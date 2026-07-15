/**
 * Starship Actor preUpdate sanitizers (Phase 6 Slice A).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getStarshipPrototypeTokenDimensions } from "./starship-data.mjs";
import { isSw5eStarshipActor, STARSHIP_ABILITY_KEYS } from "./starship-sheet-ids.mjs";

/** Vehicle HP fields validated as integers by dnd5e; sidebar quick-edit must never submit raw "" / floats. */
export const STARSHIP_INTEGER_HP_PATHS = new Set([
	"system.attributes.hp.value",
	"system.attributes.hp.max",
	"system.attributes.hp.temp",
	"system.attributes.hp.tempmax"
]);

export function coerceStarshipIntegerHpField(actor, systemPath, raw) {
	const m = /^system\.attributes\.hp\.(value|max|temp|tempmax)$/.exec(systemPath);
	if ( !m ) return null;
	const key = m[1];
	const prev = Number(actor?.system?.attributes?.hp?.[key]);
	const fallback = Number.isFinite(prev) ? Math.trunc(prev) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

/** Keys from `CONFIG.DND5E.actorSizes` — `system.traits.size` must be one of these or dnd5e `_preUpdate` can throw (token sizing). */
export function getDnd5eActorSizeKeys() {
	return Object.keys(CONFIG?.DND5E?.actorSizes ?? {});
}

export function isValidDnd5eActorSizeKey(value) {
	return typeof value === "string"
		&& value !== ""
		&& Object.prototype.hasOwnProperty.call(CONFIG?.DND5E?.actorSizes ?? {}, value);
}

export function resolveValidActorSizeKey(actor, legacySystem) {
	const keys = getDnd5eActorSizeKeys();
	const fallback = keys.includes("med") ? "med" : (keys[0] ?? "med");
	for ( const c of [actor?.system?.traits?.size, legacySystem?.traits?.size] ) {
		if ( isValidDnd5eActorSizeKey(c) ) return c;
	}
	return fallback;
}

/**
 * Starship sheet form / mode-toggle can send blank or legacy invalid size strings; coerce before Actor5e.update.
 */
export function sanitizeStarshipTraitsSizeForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const incoming = foundry.utils.getProperty(changed, "system.traits.size");
	const ks = getDnd5eActorSizeKeys();
	const fallback = ks.includes("med") ? "med" : (ks[0] ?? "med");
	const next = isValidDnd5eActorSizeKey(incoming)
		? incoming
		: (isValidDnd5eActorSizeKey(actor?.system?.traits?.size) ? actor.system.traits.size : fallback);
	foundry.utils.setProperty(changed, "system.traits.size", next);
}

export function syncStarshipPrototypeTokenDimensionsForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	if ( !foundry.utils.hasProperty(changed, "system.traits.size") ) return;
	const sizeKey = foundry.utils.getProperty(changed, "system.traits.size");
	if ( !sizeKey || sizeKey === actor?.system?.traits?.size ) return;
	const { width, height } = getStarshipPrototypeTokenDimensions(sizeKey);
	// dnd5e may already have stamped stock token dimensions onto the pending payload before this hook runs.
	// On starship size changes, always reassert the SW5E-specific token map so gargantuan resolves to 16x16, etc.
	foundry.utils.setProperty(changed, "prototypeToken.width", width);
	foundry.utils.setProperty(changed, "prototypeToken.height", height);
}

export function onPreUpdateActorStarshipTraitsSize(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipTraitsSizeForUpdate(document, changed);
	syncStarshipPrototypeTokenDimensionsForUpdate(document, changed);
}

/**
 * Coerce vehicle HP integer fields before Actor update (defense in depth vs blank string / float from form serialization).
 */
export function sanitizeStarshipHpIntegersForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const path of STARSHIP_INTEGER_HP_PATHS ) {
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		const raw = foundry.utils.getProperty(changed, path);
		const coerced = coerceStarshipIntegerHpField(actor, path, raw);
		if ( coerced !== null ) foundry.utils.setProperty(changed, path, coerced);
	}
}

export function onPreUpdateActorStarshipHpIntegers(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipHpIntegersForUpdate(document, changed);
}

export function getPersistedStarshipAbilityValue(actor, abilityId) {
	const persistedAbility = actor?._source?.system?.abilities?.[abilityId];
	const persistedValue = Number(persistedAbility?.value ?? persistedAbility);
	if ( Number.isFinite(persistedValue) ) return persistedValue;
	const legacyAbility = actor?.flags?.sw5e?.legacyStarshipActor?.system?.abilities?.[abilityId];
	const legacyValue = Number(legacyAbility?.value ?? legacyAbility);
	if ( Number.isFinite(legacyValue) ) return legacyValue;
	const liveAbility = actor?.system?.abilities?.[abilityId];
	const liveValue = Number(liveAbility?.value ?? liveAbility);
	if ( Number.isFinite(liveValue) ) return liveValue;
	return 10;
}

export function coerceStarshipAbilityValueForUpdate(actor, abilityId, raw) {
	const fallback = Math.trunc(getPersistedStarshipAbilityValue(actor, abilityId));
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.trunc(n);
}

export function sanitizeStarshipAbilityValuesForUpdate(actor, changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const abilityId of STARSHIP_ABILITY_KEYS ) {
		const path = `system.abilities.${abilityId}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		foundry.utils.setProperty(
			changed,
			path,
			coerceStarshipAbilityValueForUpdate(actor, abilityId, foundry.utils.getProperty(changed, path))
		);
	}
}

export function mirrorStarshipAbilityValuesToLegacyFlag(changed) {
	if ( !changed || typeof changed !== "object" ) return;
	for ( const abilityId of STARSHIP_ABILITY_KEYS ) {
		const path = `system.abilities.${abilityId}.value`;
		if ( !foundry.utils.hasProperty(changed, path) ) continue;
		foundry.utils.setProperty(
			changed,
			`flags.sw5e.legacyStarshipActor.system.abilities.${abilityId}.value`,
			foundry.utils.getProperty(changed, path)
		);
	}
}

export function onPreUpdateActorStarshipAbilities(document, changed, _options, _userId) {
	if ( !isSw5eStarshipActor(document) ) return;
	sanitizeStarshipAbilityValuesForUpdate(document, changed);
	mirrorStarshipAbilityValuesToLegacyFlag(changed);
}
