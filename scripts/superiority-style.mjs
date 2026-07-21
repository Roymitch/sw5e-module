/**
 * Superiority Style grant detection, character-level die curve, and denomination merge (Bug 18).
 * Design B: prepare owns pool + denomination; no pack Active Effect required.
 */

/** Canonical importer UID on Superiority Style pack/world Items. */
export const SUPERIORITY_STYLE_IMPORTER_UID = "FightingStyle.name-superiority_style";

/** Canonical pack document id for Superiority Style. */
export const SUPERIORITY_STYLE_PACK_ID = "1Niny01hQTQS4s9G";

/** Homebrew opt-in: `flags.sw5e.superiorityStyleGrant === true`. */
export const SUPERIORITY_STYLE_GRANT_FLAG = "superiorityStyleGrant";

/**
 * True when a source/compendium identifier refers to the canonical Superiority Style pack Item.
 * @param {unknown} value
 * @returns {boolean}
 */
export function sourceIdReferencesSuperiorityStylePack(value) {
	if ( value == null ) return false;
	const text = String(value);
	if ( !text ) return false;
	if ( text === SUPERIORITY_STYLE_PACK_ID ) return true;
	if ( text.endsWith(`.${SUPERIORITY_STYLE_PACK_ID}`) ) return true;
	if ( text.endsWith(`.Item.${SUPERIORITY_STYLE_PACK_ID}`) ) return true;
	if ( text.includes(`Item.${SUPERIORITY_STYLE_PACK_ID}`) ) return true;
	return false;
}

/**
 * Whether an owned Item is a Superiority Style grant source (stable ids / homebrew flag only).
 * Does not match display name or generic fightingStyle subtype alone.
 * @param {object|null|undefined} item
 * @returns {boolean}
 */
export function isSuperiorityStyleGrantItem(item) {
	if ( !item ) return false;
	if ( item.disabled === true ) return false;

	const sw5eFlags = item.flags?.sw5e ?? {};
	if ( sw5eFlags[SUPERIORITY_STYLE_GRANT_FLAG] === true ) return true;

	const importerUid = item.flags?.["sw5e-importer"]?.uid;
	if ( importerUid === SUPERIORITY_STYLE_IMPORTER_UID ) return true;

	if ( sourceIdReferencesSuperiorityStylePack(item._stats?.compendiumSource) ) return true;
	if ( sourceIdReferencesSuperiorityStylePack(item.flags?.dnd5e?.sourceId) ) return true;
	if ( sourceIdReferencesSuperiorityStylePack(item.flags?.core?.sourceId) ) return true;
	if ( sourceIdReferencesSuperiorityStylePack(item.id) ) return true;
	if ( sourceIdReferencesSuperiorityStylePack(item._id) ) return true;

	return false;
}

/**
 * Actor has at most one Style superiority grant regardless of duplicate matching Items.
 * @param {object|null|undefined} actor
 * @returns {boolean}
 */
export function hasSuperiorityStyleGrant(actor) {
	const items = actor?.items;
	if ( !items ) return false;
	const list = typeof items.values === "function" ? items.values() : (Array.isArray(items) ? items : Object.values(items));
	for ( const item of list ) {
		if ( isSuperiorityStyleGrantItem(item) ) return true;
	}
	return false;
}

/**
 * Style pool contribution: 0 or 1 (never stacks per duplicate Item).
 * @param {object|null|undefined} actor
 * @returns {0|1}
 */
export function getSuperiorityStylePoolGrant(actor) {
	return hasSuperiorityStyleGrant(actor) ? 1 : 0;
}

/**
 * Map total character level to Style die denomination (numeric faces).
 * Invalid / non-positive levels return 0.
 * @param {unknown} level
 * @returns {number}
 */
export function getSuperiorityStyleDieForCharacterLevel(level) {
	const n = Number(level);
	if ( !Number.isFinite(n) || n < 1 ) return 0;
	if ( n <= 4 ) return 4;
	if ( n <= 8 ) return 6;
	if ( n <= 12 ) return 8;
	if ( n <= 16 ) return 10;
	return 12;
}

/**
 * Resolve total character level from prepared details or sum of owned class levels.
 * @param {object|null|undefined} actor
 * @returns {number}
 */
export function getActorCharacterLevel(actor) {
	const detailsLevel = Number(actor?.system?.details?.level);
	if ( Number.isFinite(detailsLevel) && detailsLevel > 0 ) return detailsLevel;

	const classes = actor?.itemTypes?.class ?? [];
	let total = 0;
	for ( const cls of classes ) {
		const levels = Number(cls?.system?.levels ?? cls?.spellcasting?.levels);
		if ( Number.isFinite(levels) && levels > 0 ) total += levels;
	}
	return total > 0 ? total : 0;
}

/**
 * Style die for an Actor with a grant. Uses character level; if grant exists but level
 * cannot be resolved, uses the minimum Style denomination (d4 / 4) so die never stays 0.
 * @param {object|null|undefined} actor
 * @param {boolean} [hasGrant]
 * @returns {number}
 */
export function resolveSuperiorityStyleDie(actor, hasGrant = hasSuperiorityStyleGrant(actor)) {
	if ( !hasGrant ) return 0;
	const level = getActorCharacterLevel(actor);
	const fromLevel = getSuperiorityStyleDieForCharacterLevel(level);
	if ( fromLevel > 0 ) return fromLevel;
	return 4;
}

/**
 * Merge class progression die with Style die. Explicit finite source override wins.
 * With a Style grant, result is never 0 when styleDie resolves to a positive value.
 * @param {object} options
 * @param {unknown} [options.sourceDie] Explicit persisted die override
 * @param {unknown} [options.classDie] Class progression die (may be 0)
 * @param {unknown} [options.styleDie] Style character-level die
 * @param {boolean} [options.hasStyleGrant=false]
 * @returns {number}
 */
export function mergeSuperiorityDieDenomination({
	sourceDie,
	classDie,
	styleDie,
	hasStyleGrant = false
} = {}) {
	if ( sourceDie != null && sourceDie !== "" ) {
		const override = Number(sourceDie);
		if ( Number.isFinite(override) ) return Math.max(0, override);
	}

	const classVal = Number.isFinite(Number(classDie)) ? Math.max(0, Number(classDie)) : 0;
	if ( !hasStyleGrant ) return classVal;

	const styleVal = Number.isFinite(Number(styleDie)) && Number(styleDie) > 0
		? Number(styleDie)
		: 4;
	return Math.max(classVal, styleVal);
}

/**
 * Whether Superiority dice should refill on short/long rest (Bug 18E).
 * @param {object|null|undefined} actor
 * @returns {boolean}
 */
export function shouldRecoverSuperiorityDice(actor) {
	const max = Number(actor?.system?.superiority?.dice?.max);
	return Number.isFinite(max) && max > 0;
}
