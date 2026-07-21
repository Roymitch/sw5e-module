/**
 * Bug 27C — Pure planner for obsolete embedded Maneuver heal/temphp formulas.
 * No Foundry globals required.
 */

/** Authoritative formula for affected heal / temp-HP activities. */
export const CANONICAL_MANEUVER_HEAL_FORMULA = "1d@superiority.die + @mod";

/** Canonical heal / temp-HP Activity id used by the six Bug 27A carriers. */
export const CANONICAL_HEAL_ACTIVITY_ID = "sw5e0heal0000000";

/** Pack document IDs for the six affected Maneuvers. */
export const AFFECTED_MANEUVER_DOCUMENT_IDS = Object.freeze([
	"u1oADGkMWPBiFM9S", // Administer Aid
	"j3Js7GVKVghAIWXU", // Vanity
	"j1Q0ShrfK4lkk4ki", // Water of Life
	"WHNxR2MQKOXRFnkI", // Inner Strength
	"aJVdPJfnv5SgZCzA", // Parry
	"lahxD9PioVTSYCeV" // You Call This Archaeology
]);

/** Importer UIDs for the six affected Maneuvers. */
export const AFFECTED_MANEUVER_IMPORTER_UIDS = Object.freeze([
	"Maneuvers.name-administer_aid",
	"Maneuvers.name-vanity",
	"Maneuvers.name-water_of_life",
	"Maneuvers.name-inner_strength",
	"Maneuvers.name-parry",
	"Maneuvers.name-you_call_this_archaeology"
]);

const DOCUMENT_ID_SET = new Set(AFFECTED_MANEUVER_DOCUMENT_IDS);
const IMPORTER_UID_SET = new Set(AFFECTED_MANEUVER_IMPORTER_UIDS);

/** Normalized obsolete fingerprints (after normalizeManeuverFormula). */
export const OBSOLETE_FORMULA_FINGERPRINTS = Object.freeze({
	fullSixAbilityMax: "1d@superiority.die+max(@abilities.str.mod,@abilities.dex.mod,@abilities.con.mod,@abilities.int.mod,@abilities.wis.mod,@abilities.cha.mod)",
	mentalThreeAbilityMax: "1d@superiority.die+max(@abilities.int.mod,@abilities.wis.mod,@abilities.cha.mod)",
	wisChaMax: "1d@superiority.die+max(@abilities.wis.mod,@abilities.cha.mod)",
	modOnly: "@mod"
});

/**
 * Normalize a formula for fingerprint comparison.
 * Collapses whitespace only — does not rewrite tokens or broaden max(...) matching.
 * @param {unknown} formula
 * @returns {string}
 */
export function normalizeManeuverFormula(formula) {
	if ( formula == null ) return "";
	return String(formula).replace(/\s+/g, "").trim();
}

/**
 * Classify a normalized formula fingerprint.
 * @param {unknown} formula
 * @returns {"canonical"|"obsolete-full-max"|"obsolete-mental-max"|"obsolete-wis-cha-max"|"obsolete-mod-only"|"blank"|"unknown"}
 */
export function classifyManeuverFormula(formula) {
	const normalized = normalizeManeuverFormula(formula);
	if ( !normalized ) return "blank";
	if ( normalized === normalizeManeuverFormula(CANONICAL_MANEUVER_HEAL_FORMULA) ) return "canonical";
	if ( normalized === OBSOLETE_FORMULA_FINGERPRINTS.fullSixAbilityMax ) return "obsolete-full-max";
	if ( normalized === OBSOLETE_FORMULA_FINGERPRINTS.mentalThreeAbilityMax ) return "obsolete-mental-max";
	if ( normalized === OBSOLETE_FORMULA_FINGERPRINTS.wisChaMax ) return "obsolete-wis-cha-max";
	if ( normalized === OBSOLETE_FORMULA_FINGERPRINTS.modOnly ) return "obsolete-mod-only";
	return "unknown";
}

/**
 * Extract a pack document id from a Compendium UUID / sourceId string.
 * @param {unknown} value
 * @returns {string|null}
 */
export function extractCompendiumItemId(value) {
	if ( typeof value !== "string" || !value ) return null;
	const match = value.match(/\.Item\.([A-Za-z0-9]{16})\b/);
	return match?.[1] ?? null;
}

/**
 * Strong canonical provenance for the six Bug 27A carriers.
 * Name-alone is never sufficient.
 * @param {object} itemSource
 * @returns {boolean}
 */
export function isCanonicalAffectedManeuver(itemSource) {
	if ( !itemSource || typeof itemSource !== "object" ) return false;

	const type = itemSource.type;
	const isManeuverType = typeof type === "string" && (
		type === "sw5e-module.maneuver"
		|| type === "sw5e.maneuver"
		|| type.endsWith(".maneuver")
	);
	if ( !isManeuverType ) return false;

	const importerUid = itemSource.flags?.["sw5e-importer"]?.uid
		?? itemSource.flags?.sw5e?.importer?.uid;
	if ( typeof importerUid === "string" && IMPORTER_UID_SET.has(importerUid) ) return true;

	const ids = [
		itemSource._id,
		itemSource.id,
		extractCompendiumItemId(itemSource.flags?.core?.sourceId),
		extractCompendiumItemId(itemSource._stats?.compendiumSource),
		extractCompendiumItemId(itemSource.flags?.dnd5e?.sourceId),
		extractCompendiumItemId(itemSource.system?.source?.value)
	].filter(Boolean);

	return ids.some(id => DOCUMENT_ID_SET.has(id));
}

function getActivityMap(itemSource) {
	const activities = itemSource?.system?.activities;
	if ( !activities ) return null;
	if ( Array.isArray(activities) ) {
		const map = {};
		for ( const activity of activities ) {
			if ( activity?._id ) map[activity._id] = activity;
			else if ( activity?.id ) map[activity.id] = activity;
		}
		return map;
	}
	return activities;
}

function getDamagePartFormula(itemSource) {
	const parts = itemSource?.system?.damage?.parts;
	if ( !Array.isArray(parts) || !parts.length ) return null;
	const first = parts[0];
	if ( Array.isArray(first) ) return first[0] ?? null;
	if ( first && typeof first === "object" ) return first.formula ?? first[0] ?? null;
	return null;
}

function getDamagePartType(itemSource) {
	const parts = itemSource?.system?.damage?.parts;
	if ( !Array.isArray(parts) || !parts.length ) return null;
	const first = parts[0];
	if ( Array.isArray(first) ) return first[1] ?? null;
	if ( first && typeof first === "object" ) return first.type ?? first[1] ?? null;
	return null;
}

/**
 * Decide whether a classified formula may be rewritten for a given location.
 * @param {string} classification
 * @param {"activity"|"damagePart"} location
 * @param {boolean} hasCanonicalProvenance
 * @param {boolean} hasCanonicalActivity
 * @returns {{ migrate: boolean, reason: string }}
 */
function decideMigration(classification, location, hasCanonicalProvenance, hasCanonicalActivity) {
	if ( classification === "canonical" ) {
		return { migrate: false, reason: "already-current" };
	}
	if ( classification === "blank" ) {
		return { migrate: false, reason: "blank" };
	}
	if ( !hasCanonicalProvenance ) {
		return { migrate: false, reason: "missing-canonical-provenance" };
	}
	if ( location === "activity" && !hasCanonicalActivity ) {
		return { migrate: false, reason: "non-canonical-activity" };
	}
	if ( classification === "obsolete-full-max"
		|| classification === "obsolete-mental-max"
		|| classification === "obsolete-wis-cha-max" ) {
		return { migrate: true, reason: classification };
	}
	if ( classification === "obsolete-mod-only" ) {
		if ( location === "activity" && hasCanonicalActivity ) {
			return { migrate: true, reason: "obsolete-mod-only" };
		}
		if ( location === "damagePart" ) {
			return { migrate: true, reason: "obsolete-mod-only" };
		}
		return { migrate: false, reason: "mod-only-without-canonical-activity" };
	}
	return { migrate: false, reason: "unknown-or-custom" };
}

/**
 * Plan formula updates for one Item source object.
 * @param {object} itemSource
 * @returns {{
 *   isAffected: boolean,
 *   classifications: object,
 *   updates: object,
 *   reasons: object,
 *   changedFields: string[]
 * }}
 */
export function planManeuverFormulaMigration(itemSource) {
	const result = {
		isAffected: false,
		classifications: {},
		updates: {},
		reasons: {},
		changedFields: []
	};

	const hasProvenance = isCanonicalAffectedManeuver(itemSource);
	result.isAffected = hasProvenance;
	if ( !hasProvenance ) {
		result.reasons.item = "not-canonical-affected-maneuver";
		return result;
	}

	const activities = getActivityMap(itemSource);
	const activity = activities?.[CANONICAL_HEAL_ACTIVITY_ID];
	const hasCanonicalActivity = !!activity;
	const activityFormula = activity?.healing?.custom?.formula;
	const activityClass = classifyManeuverFormula(activityFormula);
	result.classifications.activity = activityClass;

	if ( activity ) {
		const decision = decideMigration(activityClass, "activity", true, true);
		result.reasons.activity = decision.reason;
		if ( decision.migrate ) {
			const path = `system.activities.${CANONICAL_HEAL_ACTIVITY_ID}.healing.custom.formula`;
			result.updates[path] = CANONICAL_MANEUVER_HEAL_FORMULA;
			result.changedFields.push(path);
		}
	} else {
		result.reasons.activity = "missing-canonical-activity";
	}

	const partFormula = getDamagePartFormula(itemSource);
	const partType = getDamagePartType(itemSource);
	if ( partFormula != null && partFormula !== "" ) {
		const partClass = classifyManeuverFormula(partFormula);
		result.classifications.damagePart = partClass;
		const healLike = partType == null || partType === "healing" || partType === "temphp";
		if ( !healLike ) {
			result.reasons.damagePart = "non-heal-damage-part";
		} else {
			const decision = decideMigration(partClass, "damagePart", true, hasCanonicalActivity);
			result.reasons.damagePart = decision.reason;
			if ( decision.migrate ) {
				const path = "system.damage.parts";
				const parts = foundryDeepCloneParts(itemSource.system.damage.parts);
				if ( Array.isArray(parts[0]) ) parts[0][0] = CANONICAL_MANEUVER_HEAL_FORMULA;
				else if ( parts[0] && typeof parts[0] === "object" ) parts[0].formula = CANONICAL_MANEUVER_HEAL_FORMULA;
				result.updates[path] = parts;
				result.changedFields.push("system.damage.parts.0.0");
			}
		}
	} else {
		result.classifications.damagePart = "blank";
		result.reasons.damagePart = "blank";
	}

	return result;
}

function foundryDeepCloneParts(parts) {
	return JSON.parse(JSON.stringify(parts));
}

/**
 * Apply planned formula updates onto an Item source / updateData pair (migration.mjs style).
 * Update keys are dotted paths (Foundry expands them). Working itemData is mutated in place.
 * @param {object} itemData Working item source
 * @param {object} updateData Accumulated update object
 * @returns {object} updateData
 */
export function applyManeuverFormulaMigration(itemData, updateData={}) {
	const plan = planManeuverFormulaMigration(itemData);
	for ( const [path, value] of Object.entries(plan.updates) ) {
		updateData[path] = value;
		setPath(itemData, path, value);
	}
	return updateData;
}

function setPath(object, path, value) {
	const parts = path.split(".");
	let target = object;
	for ( let i = 0; i < parts.length - 1; i++ ) {
		const key = parts[i];
		if ( !(key in target) || typeof target[key] !== "object" || target[key] === null ) {
			target[key] = {};
		}
		target = target[key];
	}
	target[parts[parts.length - 1]] = value;
}
