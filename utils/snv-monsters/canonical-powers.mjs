/**
 * Canonical Force/Tech power and Maneuver resolution for snv-monsters embedding.
 * Mirrors loadAndCloneCanonicalWeapon: deep-clone full Item YAML, then override allowlist.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const FORCE_POWERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/force-powers");
const TECH_POWERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/tech-powers");
const MANEUVERS_ROOT = path.join(ROOT, "packs/_source/powers-maneuvers/maneuvers");

const POWER_ALIASES = Object.freeze({
	// Keys must match normalizeName() output (punctuation collapsed/removed).
	"force push pull": "force push/pull",
	"force pull push": "force push/pull",
	"improved dark side tendrils": "improved dark side tendrils",
	"dark side tendrils": "dark side tendrils",
	"voltaic shield": "voltaic shielding",
	"phase strike": "phasestrike",
	"phasestrike": "phasestrike",
	"electro shock": "electroshock",
	"predictive a i": "predictive ai",
	"predictive ai": "predictive ai",
	"tech overide": "tech override",
	"dimish tech": "diminish tech",
	"turbulance": "turbulence",
	"propel": "force propel",
	"mindspike": "mind spike",
	"mind spike": "mind spike",
	"concealed caltrop": "concealed caltrops",
	// Maintainer-locked SnV outdated/D&D-derived terminology → SW5e canonical tech powers
	"charge power cell": "capacity boost",
	"scorching ray": "shocking ray"
});

/**
 * Normalize SnV power labels before alias/index lookup.
 * Strips cast-as parentheticals and collapses punctuation variants.
 */
export function normalizePowerLookupName(name) {
	return String(name || "")
		.replace(/\s*\([^)]*cast[^)]*\)\s*/gi, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function walkYml(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) out.push(p);
	}
	return out;
}

let _powerIndex = null;
let _maneuverIndex = null;

function indexPowers(root, castType) {
	const byName = new Map();
	for ( const file of walkYml(root) ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		if ( doc.type !== "spell" ) continue;
		const rec = {
			id: doc._id,
			name: doc.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			castType,
			level: Number(doc.system?.level ?? 0),
			school: doc.system?.school || "",
			activityCount: Object.keys(doc.system?.activities || {}).length,
			consumeTarget: doc.system?.consume?.target || "",
			hasActivities: Object.keys(doc.system?.activities || {}).length > 0
		};
		byName.set(normalizeName(doc.name), rec);
	}
	return byName;
}

export function buildCanonicalPowerIndex() {
	const force = indexPowers(FORCE_POWERS_ROOT, "force");
	const tech = indexPowers(TECH_POWERS_ROOT, "tech");
	const byName = new Map([...force, ...tech]);
	_powerIndex = {
		byName,
		forceCount: force.size,
		techCount: tech.size,
		count: byName.size
	};
	return _powerIndex;
}

export function getCanonicalPowerIndex() {
	return _powerIndex || buildCanonicalPowerIndex();
}

export function buildCanonicalManeuverIndex() {
	const byName = new Map();
	for ( const file of walkYml(MANEUVERS_ROOT) ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		if ( doc.type !== "sw5e-module.maneuver" && doc.type !== "maneuver" ) continue;
		const rec = {
			id: doc._id,
			name: doc.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			maneuverType: doc.system?.type?.value || "",
			activityCount: Object.keys(doc.system?.activities || {}).length,
			consumeTarget: doc.system?.consume?.target || "",
			hasActivities: Object.keys(doc.system?.activities || {}).length > 0
		};
		byName.set(normalizeName(doc.name), rec);
	}
	_maneuverIndex = { byName, count: byName.size };
	return _maneuverIndex;
}

export function getCanonicalManeuverIndex() {
	return _maneuverIndex || buildCanonicalManeuverIndex();
}

function aliasKey(name) {
	const cleaned = normalizePowerLookupName(name);
	const n = normalizeName(cleaned);
	return POWER_ALIASES[n] ? normalizeName(POWER_ALIASES[n]) : n;
}

/**
 * @param {string} powerName
 * @param {"force"|"tech"|null} [preferredCastType]
 */
export function resolveCanonicalPower(powerName, preferredCastType = null) {
	const idx = getCanonicalPowerIndex();
	const key = aliasKey(powerName);
	const hit = idx.byName.get(key);
	if ( !hit ) {
		return { match: "none", reason: "no-canonical-power-name-match", powerName, preferredCastType };
	}
	if ( preferredCastType && hit.castType !== preferredCastType ) {
		// Prefer matching cast type when names collide across Force/Tech (rare).
		const typed = [...idx.byName.values()].find(
			rec => normalizeName(rec.name) === key && rec.castType === preferredCastType
		);
		if ( typed ) {
			return {
				match: "exact-name",
				canonical: typed,
				clonePolicy: "deep-clone-full-item-then-override-allowlist"
			};
		}
	}
	return {
		match: "exact-name",
		canonical: hit,
		clonePolicy: "deep-clone-full-item-then-override-allowlist",
		overrideAllowlist: [
			"name",
			"flags.sw5e.snvMonsters",
			"embedded _id/_key",
			"optional flat attack/DC overrides when SnV differs"
		],
		note: "Preserve system.activities and consume targets from canonical Item."
	};
}

/**
 * Normalize cloned spell Item for current dnd5e SpellData (method/prepared).
 * Does not modify the canonical source file — only the in-memory clone.
 */
export function normalizeClonedSpellSchema(clone) {
	if ( !clone?.system ) return clone;
	const prep = clone.system.preparation;
	if ( clone.system.method == null && prep?.mode ) {
		clone.system.method = prep.mode === "prepared" || prep.mode === "always"
			? "powerCasting"
			: prep.mode;
	}
	if ( clone.system.prepared == null && typeof prep?.prepared === "boolean" ) {
		clone.system.prepared = prep.prepared;
	}
	if ( Object.prototype.hasOwnProperty.call(clone.system, "preparation") ) {
		delete clone.system.preparation;
	}
	if ( clone.system.method == null ) clone.system.method = "powerCasting";
	if ( clone.system.prepared == null ) clone.system.prepared = true;
	return clone;
}

export function loadAndCloneCanonicalPower(powerName, preferredCastType = null) {
	const resolved = resolveCanonicalPower(powerName, preferredCastType);
	if ( resolved.match === "none" ) return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	return { ok: true, resolved, clone: normalizeClonedSpellSchema(structuredClone(full)) };
}

export function resolveCanonicalManeuver(maneuverName) {
	const idx = getCanonicalManeuverIndex();
	const hit = idx.byName.get(normalizeName(maneuverName));
	if ( !hit ) {
		return { match: "none", reason: "no-canonical-maneuver-name-match", maneuverName };
	}
	return {
		match: "exact-name",
		canonical: hit,
		clonePolicy: "deep-clone-full-item-then-override-allowlist"
	};
}

export function loadAndCloneCanonicalManeuver(maneuverName) {
	const resolved = resolveCanonicalManeuver(maneuverName);
	if ( resolved.match === "none" ) return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	return { ok: true, resolved, clone: structuredClone(full) };
}
