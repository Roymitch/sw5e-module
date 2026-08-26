import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const EQUIPMENT_WEAPONS_ROOT = path.join(ROOT, "packs/_source/equipment/weapons");

function walkYml(dir, out = []) {
	if (!fs.existsSync(dir)) return out;
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const nextPath = path.join(dir, entry.name);
		if (entry.isDirectory()) walkYml(nextPath, out);
		else if (entry.name.endsWith(".yml") && entry.name !== "_folder.yml") out.push(nextPath);
	}
	return out;
}

let weaponIndex = null;

export function buildCanonicalWeaponIndex() {
	const byName = new Map();
	for (const file of walkYml(EQUIPMENT_WEAPONS_ROOT)) {
		const document = yaml.load(fs.readFileSync(file, "utf8"));
		if (document?.type !== "weapon") continue;
		const record = {
			id: document._id,
			name: document.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			baseItem: document.system?.type?.baseItem || "",
			weaponType: document.system?.type?.value || "",
			activityCount: Object.keys(document.system?.activities || {}).length,
			hasActivities: Object.keys(document.system?.activities || {}).length > 0
		};
		byName.set(normalizeName(document.name), record);
	}
	weaponIndex = { byName, count: byName.size };
	return weaponIndex;
}

export function getCanonicalWeaponIndex() {
	return weaponIndex || buildCanonicalWeaponIndex();
}

export function resolveCanonicalWeapon(weaponName) {
	const hit = getCanonicalWeaponIndex().byName.get(normalizeName(weaponName));
	if (!hit) {
		return {
			match: "none",
			reason: "no-canonical-equipment-name-match",
			weaponName
		};
	}
	return {
		match: "exact-name",
		canonical: hit,
		clonePolicy: "deep-clone-full-item-then-override-allowlist"
	};
}

export function loadAndCloneCanonicalWeapon(weaponName) {
	const resolved = resolveCanonicalWeapon(weaponName);
	if (resolved.match === "none") return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	return { ok: true, resolved, clone: structuredClone(full) };
}
