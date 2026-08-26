/**
 * Shared Force/Tech Powers Known counting and max-resolution helpers.
 *
 * Numerator: qualifying owned power Items (prepare-time only; never persisted).
 * freeLearn: established SW5E character rule — possessed but does not count against Powers Known.
 */
export function getPowerCastTypeSchoolIds(castType, config = globalThis.CONFIG?.DND5E) {
	return Object.keys(config?.powerCasting?.[castType]?.schools ?? {});
}

/**
 * Whether a power Item is marked Free Learn (does not count against Powers Known).
 * @param {object} power
 * @returns {boolean}
 */
export function powerHasFreeLearn(power) {
	const properties = power?.system?.properties;
	if ( !properties ) return false;
	if ( typeof properties.has === "function" ) return properties.has("freeLearn");
	if ( properties instanceof Set ) return properties.has("freeLearn");
	if ( Array.isArray(properties) ) return properties.includes("freeLearn");
	if ( typeof properties === "object" ) return properties.freeLearn === true;
	return false;
}

/**
 * Count qualifying owned powers for the visible Powers Known numerator.
 * One Item counts once regardless of Activities. Force/Tech are independent.
 *
 * @param {object} actor Actor-like with itemTypes.spell or items[]
 * @param {"force"|"tech"} castType
 * @param {object} [config]
 * @returns {number}
 */
export function countOwnedPowersKnown(actor, castType, config = globalThis.CONFIG?.DND5E) {
	const schools = new Set(getPowerCastTypeSchoolIds(castType, config));
	if ( !schools.size ) return 0;

	const spells = actor?.itemTypes?.spell
		?? (actor?.items ?? []).filter(item => item?.type === "spell");

	const seen = new Set();
	let count = 0;
	for ( const power of spells ) {
		const school = power?.system?.school;
		if ( !schools.has(school) ) continue;
		if ( powerHasFreeLearn(power) ) continue;
		const key = power?.id ?? power?._id ?? power?.name;
		if ( key != null ) {
			if ( seen.has(key) ) continue;
			seen.add(key);
		}
		count += 1;
	}
	return count;
}

/**
 * Resolve prepared Powers Known maximum.
 * Unspecified → null (sheet shows N / —). Never invent class tables for NPCs.
 *
 * @param {object} options
 * @param {boolean} options.isNPC
 * @param {number|null|undefined} options.sourceKnownMax Persisted override
 * @param {number} options.computedPowersKnownMax Class-derived max (characters)
 * @returns {number|null}
 */
export function resolvePreparedPowersKnownMax({
	isNPC,
	sourceKnownMax,
	computedPowersKnownMax = 0
} = {}) {
	const sourceMax = sourceKnownMax === "" || sourceKnownMax === undefined
		? null
		: sourceKnownMax;
	const computed = Number(computedPowersKnownMax) || 0;

	if ( isNPC ) {
		if ( sourceMax === null || sourceMax === undefined ) return null;
		const n = Number(sourceMax);
		if ( !Number.isFinite(n) ) return null;
		if ( n > 0 ) return n;
		// Stale/zero NPC override is unspecified, not a hard 0-cap.
		return null;
	}

	// Characters: positive configured override wins.
	if ( sourceMax !== null && sourceMax !== undefined ) {
		const n = Number(sourceMax);
		if ( Number.isFinite(n) && n > 0 ) return n;
		// Stale persisted 0 with a real class max → heal to class max.
		if ( n === 0 && computed > 0 ) return computed;
		if ( n === 0 && computed === 0 ) return null;
	}

	if ( computed > 0 ) return computed;
	return null;
}
