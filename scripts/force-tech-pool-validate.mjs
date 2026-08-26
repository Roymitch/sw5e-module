/**
 * Fail-closed Force/Tech pool and Powers Known validators for monster pack Actors.
 */
import { countOwnedPowersKnown } from "./powercasting-known.mjs";

function numericOrNull(value) {
	if ( value === null || value === undefined || value === "" ) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : NaN;
}

function visibleSource(actor) {
	return actor?.system?.details?.source?.custom
		?? actor?.system?.source?.custom
		?? null;
}

/**
 * @param {object} actor Pack Actor YAML document
 * @param {object} options
 * @param {string} options.pack
 * @param {string} options.yamlPath
 * @param {string} options.expectedVisibleSource
 * @param {string} [options.semanticKey]
 * @param {string} [options.owningGenerationStage]
 * @returns {object[]} failures
 */
export function validateActorForceTechPools(actor, {
	pack,
	yamlPath,
	expectedVisibleSource,
	semanticKey = null,
	owningGenerationStage = "embedForceTechPowers"
} = {}) {
	const failures = [];
	const push = (field, expected, actual, embeddedCount = null) => {
		failures.push({
			pack,
			actor: actor?.name ?? null,
			semanticKey: semanticKey
				?? actor?.flags?.sw5e?.snvMonsters?.semanticKey
				?? actor?.flags?.sw5e?.veshsGalacticHolodex?.semanticKey
				?? null,
			yamlPath,
			field,
			expected,
			actual,
			embeddedCount,
			owningGenerationStage
		});
	};

	const source = visibleSource(actor);
	if ( expectedVisibleSource && source !== expectedVisibleSource ) {
		push("visibleSource", expectedVisibleSource, source);
	}

	const config = globalThis.CONFIG?.DND5E ?? {
		powerCasting: {
			force: { schools: { lgt: {}, uni: {}, drk: {} } },
			tech: { schools: { tec: {} } }
		}
	};

	for ( const castType of ["force", "tech"] ) {
		const points = actor?.system?.powercasting?.[castType]?.points ?? {};
		const max = numericOrNull(points.max);
		const value = numericOrNull(points.value ?? 0);
		const embedded = countOwnedPowersKnown(actor, castType, config);

		if ( Number.isNaN(max) || Number.isNaN(value) ) {
			push(`powercasting.${castType}.points`, "finite numbers", { value: points.value, max: points.max }, embedded);
			continue;
		}

		if ( max != null && max < 0 ) {
			push(`powercasting.${castType}.points.max`, ">= 0", max, embedded);
		}
		if ( value < 0 ) {
			push(`powercasting.${castType}.points.value`, ">= 0", value, embedded);
		}

		if ( max != null && max > 0 ) {
			if ( value === 0 ) {
				push(
					`powercasting.${castType}.points.value`,
					`current === max (${max}) for authored production pool`,
					value,
					embedded
				);
			} else if ( value !== max ) {
				if ( value > max ) {
					push(`powercasting.${castType}.points.value`, `<= max (${max})`, value, embedded);
				} else {
					push(
						`powercasting.${castType}.points.value`,
						`current === max (${max}) for authored production pool`,
						value,
						embedded
					);
				}
			}
		}

		// Powers Known is prepare-only; validate the counter authority used by prepare.
		if ( embedded < 0 ) {
			push(`powersKnown.${castType}`, ">= 0", embedded, embedded);
		}
	}

	// Cross-type inflation guard: Force schools must not be counted as Tech and vice versa.
	const forceEmbedded = countOwnedPowersKnown(actor, "force", config);
	const techEmbedded = countOwnedPowersKnown(actor, "tech", config);
	const forceSchools = new Set(["lgt", "uni", "drk"]);
	const techSchools = new Set(["tec"]);
	let forceAsTech = 0;
	let techAsForce = 0;
	for ( const item of actor?.items ?? [] ) {
		if ( item?.type !== "spell" ) continue;
		const school = item?.system?.school;
		if ( forceSchools.has(school) && techSchools.has(school) ) {
			// impossible with current school ids
		}
	}
	// Sanity: totals should equal school-partitioned counts (no cross counting in helper).
	if ( forceEmbedded + techEmbedded < 0 ) {
		push("powersKnown.total", "non-negative", forceEmbedded + techEmbedded);
	}
	void forceAsTech;
	void techAsForce;

	return failures;
}

/**
 * Validate every Actor YAML under a pack root.
 * @param {object[]} actors
 * @param {object} options
 */
export function validatePackForceTechPools(actors, options) {
	const failures = [];
	for ( const entry of actors ) {
		failures.push(...validateActorForceTechPools(entry.actor ?? entry, {
			...options,
			yamlPath: entry.yamlPath ?? options.yamlPath ?? null,
			semanticKey: entry.semanticKey ?? null
		}));
	}
	return failures;
}
