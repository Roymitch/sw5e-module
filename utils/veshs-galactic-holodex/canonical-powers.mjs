import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const FORCE_POWERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/force-powers");
const TECH_POWERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/tech-powers");
const MANEUVERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/maneuvers");

const POWER_ALIASES = Object.freeze({
	"burse of speed": "burst of speed",
	"concealed caltrop": "concealed caltrops",
	"electro shock": "electroshock",
	"force pull push": "force push/pull",
	"force push pull": "force push/pull",
	"mind spike": "mind spike",
	"mindspike": "mind spike",
	"phase strike": "phasestrike",
	"phasestrike": "phasestrike",
	"predictive a i": "predictive ai",
	"tech overide": "tech override"
});

function walkYml(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const nextPath = path.join(dir, entry.name);
		if (entry.isDirectory()) walkYml(nextPath, out);
		else if (entry.name.endsWith(".yml") && entry.name !== "_folder.yml") out.push(nextPath);
	}
	return out;
}

function normalizePowerLookupName(name) {
	return String(name || "")
		.replace(/\s*\([^)]*cast[^)]*\)\s*/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function aliasKey(name) {
	const cleaned = normalizeName(normalizePowerLookupName(name));
	return normalizeName(POWER_ALIASES[cleaned] || cleaned);
}

function indexPowers(root, castType) {
	const byName = new Map();
	for (const file of walkYml(root)) {
		const document = yaml.load(fs.readFileSync(file, "utf8"));
		if (document?.type !== "spell") continue;
		const record = {
			id: document._id,
			name: document.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			castType,
			level: Number(document.system?.level ?? 0),
			school: document.system?.school || "",
			activityCount: Object.keys(document.system?.activities || {}).length,
			hasActivities: Object.keys(document.system?.activities || {}).length > 0
		};
		byName.set(normalizeName(document.name), record);
	}
	return byName;
}

let powerIndex = null;
let maneuverIndex = null;

export function buildCanonicalPowerIndex() {
	const force = indexPowers(FORCE_POWERS_ROOT, "force");
	const tech = indexPowers(TECH_POWERS_ROOT, "tech");
	powerIndex = {
		byName: new Map([...force, ...tech]),
		forceCount: force.size,
		techCount: tech.size,
		count: force.size + tech.size
	};
	return powerIndex;
}

export function getCanonicalPowerIndex() {
	return powerIndex || buildCanonicalPowerIndex();
}

export function resolveCanonicalPower(powerName, preferredCastType = null) {
	const index = getCanonicalPowerIndex();
	const key = aliasKey(powerName);
	const direct = index.byName.get(key);
	if (!direct) {
		return {
			match: "none",
			reason: "no-canonical-power-name-match",
			powerName,
			preferredCastType
		};
	}
	if (preferredCastType && direct.castType !== preferredCastType) {
		const typed = [...index.byName.values()].find(record =>
			normalizeName(record.name) === key && record.castType === preferredCastType
		);
		if (typed) {
			return {
				match: "exact-name",
				canonical: typed,
				clonePolicy: "deep-clone-full-item-then-override-allowlist"
			};
		}
	}
	return {
		match: "exact-name",
		canonical: direct,
		clonePolicy: "deep-clone-full-item-then-override-allowlist"
	};
}

export function normalizeClonedSpellSchema(clone) {
	if (!clone?.system) return clone;
	const preparation = clone.system.preparation;
	if (clone.system.method == null && preparation?.mode) {
		clone.system.method = preparation.mode === "prepared" || preparation.mode === "always"
			? "powerCasting"
			: preparation.mode;
	}
	if (clone.system.prepared == null && typeof preparation?.prepared === "boolean") {
		clone.system.prepared = preparation.prepared;
	}
	if (Object.prototype.hasOwnProperty.call(clone.system, "preparation")) delete clone.system.preparation;
	if (clone.system.method == null) clone.system.method = "powerCasting";
	if (clone.system.prepared == null) clone.system.prepared = true;
	return clone;
}

export function loadAndCloneCanonicalPower(powerName, preferredCastType = null) {
	const resolved = resolveCanonicalPower(powerName, preferredCastType);
	if (resolved.match === "none") return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	return { ok: true, resolved, clone: normalizeClonedSpellSchema(structuredClone(full)) };
}

export function buildCanonicalManeuverIndex() {
	const byName = new Map();
	for (const file of walkYml(MANEUVERS_ROOT)) {
		const document = yaml.load(fs.readFileSync(file, "utf8"));
		if (document?.type !== "sw5e-module.maneuver" && document?.type !== "maneuver") continue;
		const record = {
			id: document._id,
			name: document.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			maneuverType: document.system?.type?.value || "",
			activityCount: Object.keys(document.system?.activities || {}).length,
			hasActivities: Object.keys(document.system?.activities || {}).length > 0
		};
		byName.set(normalizeName(document.name), record);
	}
	maneuverIndex = { byName, count: byName.size };
	return maneuverIndex;
}

export function getCanonicalManeuverIndex() {
	return maneuverIndex || buildCanonicalManeuverIndex();
}

export function resolveCanonicalManeuver(maneuverName) {
	const hit = getCanonicalManeuverIndex().byName.get(normalizeName(maneuverName));
	if (!hit) {
		return {
			match: "none",
			reason: "no-canonical-maneuver-name-match",
			maneuverName
		};
	}
	return {
		match: "exact-name",
		canonical: hit,
		clonePolicy: "deep-clone-full-item-then-override-allowlist"
	};
}

export function loadAndCloneCanonicalManeuver(maneuverName) {
	const resolved = resolveCanonicalManeuver(maneuverName);
	if (resolved.match === "none") return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	return { ok: true, resolved, clone: structuredClone(full) };
}
