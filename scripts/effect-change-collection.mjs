/**
 * Resolve and migrate Active Effect change arrays across Foundry 13/14 source shapes.
 *
 * Foundry 14 stores changes at `system.changes`. Live documents and `toObject()` expose a
 * non-enumerable `changes` shim. `foundry.utils.deepClone` copies only enumerable keys, so
 * SW5e world migration often sees `system.changes` with top-level `changes` omitted.
 */

export const LEGACY_SUPERIORITY_EFFECT_KEY_MAP = {
	"system.attributes.super.dice.max": "system.superiority.dice.max",
	"system.attributes.super.dice.value": "system.superiority.dice.value",
	"system.attributes.super.die": "system.superiority.die",
	"system.attributes.super.level": "system.superiority.level",
	"bonuses.super.dc": "bonuses.superiority.dc.all",
	"bonuses.super.physicalDC": "bonuses.superiority.dc.physical",
	"bonuses.super.mentalDC": "bonuses.superiority.dc.mental"
};

const EFFECT_CHANGE_BLACKLIST = [
	"system.details.background",
	"system.details.species",
	"system.traits.languages.value",
	"system.traits.toolProf.value"
];

const EFFECT_CHANGE_BLACKLIST_RE = [
	/system\.tools\.\w+\.prof/
];

/**
 * @param {object} effect
 * @returns {{ changes: object[], updateKey: "changes"|"system.changes" } | null}
 */
export function getMigratableEffectChanges(effect) {
	if ( Array.isArray(effect?.changes) ) return { changes: effect.changes, updateKey: "changes" };
	if ( Array.isArray(effect?.system?.changes) ) return { changes: effect.system.changes, updateKey: "system.changes" };
	return null;
}

function isBlacklistedEffectChangeKey(key) {
	if ( typeof key !== "string" ) return false;
	if ( EFFECT_CHANGE_BLACKLIST.includes(key) ) return true;
	for ( const re of EFFECT_CHANGE_BLACKLIST_RE ) if ( re.test(key) ) return true;
	return false;
}

/**
 * Remap legacy standalone SW5e superiority Active Effect keys to dnd5e-module paths.
 * @param {object} effect
 * @param {object} updateData
 * @returns {object}
 */
export function remapSuperiorityEffectKeys(effect, updateData={}) {
	const resolved = getMigratableEffectChanges(effect);
	if ( !resolved ) return updateData;

	let changed = false;
	for ( const change of resolved.changes ) {
		const mappedKey = LEGACY_SUPERIORITY_EFFECT_KEY_MAP[change?.key];
		if ( !mappedKey ) continue;
		change.key = mappedKey;
		changed = true;
	}
	if ( changed ) updateData[resolved.updateKey] = resolved.changes;
	return updateData;
}

/**
 * Remove any old effect changes that have been supplanted by advancements.
 * @param {object} effect
 * @param {object} updateData
 * @param {object} [parent]
 * @returns {object}
 */
export function cleanEffectAdvancementSupplantedChanges(effect, updateData={}, parent) {
	const hasAdvancements = parent?.system?.advancement !== undefined || parent?.advancement !== undefined;
	if ( !hasAdvancements ) return updateData;

	const resolved = getMigratableEffectChanges(effect);
	if ( !resolved ) return updateData;

	const newChanges = resolved.changes.filter(change => !isBlacklistedEffectChangeKey(change?.key));
	if ( newChanges.length !== resolved.changes.length ) updateData[resolved.updateKey] = newChanges;
	return updateData;
}
