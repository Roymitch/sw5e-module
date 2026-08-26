/**
 * Canonical Equipment weapon resolution audit + helpers (N2).
 * Indexes packs/_source/equipment weapons by normalized name / baseItem.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const EQUIPMENT_WEAPONS = path.join(ROOT, "packs/_source/equipment/weapons");

function walkYml(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYml(p, out);
		else if ( ent.name.endsWith(".yml") ) out.push(p);
	}
	return out;
}

let _index = null;

export function buildCanonicalWeaponIndex() {
	const byName = new Map();
	const byBaseItem = new Map();
	const files = walkYml(EQUIPMENT_WEAPONS);
	for ( const file of files ) {
		const doc = yaml.load(fs.readFileSync(file, "utf8"));
		if ( doc.type !== "weapon" ) continue;
		const rec = {
			id: doc._id,
			name: doc.name,
			path: path.relative(ROOT, file).split(path.sep).join("/"),
			baseItem: doc.system?.type?.baseItem || "",
			properties: doc.system?.properties || [],
			uses: doc.system?.uses || null,
			hasActivities: Object.keys(doc.system?.activities || {}).length > 0,
			activityCount: Object.keys(doc.system?.activities || {}).length
		};
		byName.set(normalizeName(doc.name), rec);
		if ( rec.baseItem ) byBaseItem.set(String(rec.baseItem).toLowerCase(), rec);
	}
	_index = { byName, byBaseItem, count: byName.size };
	return _index;
}

export function getCanonicalWeaponIndex() {
	return _index || buildCanonicalWeaponIndex();
}

/**
 * Exact name match → clone candidate; else null (source-specific).
 */
export function resolveCanonicalWeapon(weaponName) {
	const idx = getCanonicalWeaponIndex();
	const hit = idx.byName.get(normalizeName(weaponName));
	if ( !hit ) {
		return {
			match: "none",
			reason: "no-canonical-equipment-name-match",
			weaponName
		};
	}
	return {
		match: "exact-name",
		canonical: hit,
		clonePolicy: "deep-clone-full-item-then-override-allowlist",
		overrideAllowlist: [
			"name",
			"system.range",
			"system.damage",
			"system.attackBonus / activity.attack.bonus",
			"system.uses.max (reload)",
			"flags.sw5e.snvMonsters",
			"embedded _id/_key"
		],
		note: "Implementation must deep-clone complete Item document from equipment source, not cherry-pick fields."
	};
}

/**
 * Deep-clone helper for YAML equipment weapon documents.
 */
export function loadAndCloneCanonicalWeapon(weaponName) {
	const resolved = resolveCanonicalWeapon(weaponName);
	if ( resolved.match === "none" ) return { ok: false, resolved };
	const full = yaml.load(fs.readFileSync(path.join(ROOT, resolved.canonical.path), "utf8"));
	const clone = structuredClone(full);
	return { ok: true, resolved, clone };
}

export function canonicalResolutionAuditReport() {
	const idx = buildCanonicalWeaponIndex();
	return {
		equipmentWeaponsRoot: "packs/_source/equipment/weapons",
		indexedCount: idx.count,
		semanticKey: "normalized equipment Item name (primary); baseItem secondary",
		exactVsOverride: "exact normalized name → full deep clone; SnV numeric/text fields applied via allowlist overrides",
		idAssignment: "new embedded Item _id from identity map (pinned) or sandbox temp; _key=!actors.items!{actorId}.{itemId}",
		activities: "preserved from canonical clone unless override replaces consumption targets",
		unsupportedMatchReporting: "resolveCanonicalWeapon returns match:none with reason",
		doesNotCherryPick: true
	};
}
