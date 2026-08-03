/**
 * Phase 3B / Bug 12 — Starship Food current-value world migration (1.3.6).
 *
 * Initializes missing food.value (+ legacy mirror) from selected persistent base
 * capacity. Never uses prepared foodCapMod / AE / effective capacity.
 *
 * Dispositions: skip | normalize | initialize
 * Detection: own-key presence AND value validity (flag preferred; schema-default
 * system 0 without flag own-key → initialize).
 */

import {
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	getLegacySizeSystem,
	getLegacyStarshipSize
} from "./starship-data.mjs";
import { normalizeStarshipNonNegativeInt } from "./starship-replenish-math.mjs";

export const STARSHIP_FOOD_CURRENT_MIGRATION_VERSION = "1.3.6";

/** @typedef {"skip"|"normalize"|"initialize"} StarshipFoodCurrentDisposition */

/**
 * @returns {object}
 */
export function createStarshipFoodCurrentMigrationReport() {
	return {
		scanned: 0,
		eligibleStarships: 0,
		skippedUnchanged: 0,
		initializedMissing: 0,
		normalizedExisting: 0,
		initializedZeroTinyOrMissingSize: 0,
		customFallback: 0,
		malformedInitialized: 0,
		failures: 0,
		notStarship: 0
	};
}

/** @type {ReturnType<createStarshipFoodCurrentMigrationReport>|null} */
let activeFoodCurrentMigrationReport = null;

export function beginStarshipFoodCurrentMigrationReport() {
	activeFoodCurrentMigrationReport = createStarshipFoodCurrentMigrationReport();
	return activeFoodCurrentMigrationReport;
}

export function getActiveStarshipFoodCurrentMigrationReport() {
	return activeFoodCurrentMigrationReport;
}

export function endStarshipFoodCurrentMigrationReport() {
	const report = activeFoodCurrentMigrationReport;
	activeFoodCurrentMigrationReport = null;
	if ( report ) logStarshipFoodCurrentMigrationReport(report);
	return report;
}

/**
 * @param {object} report
 */
export function logStarshipFoodCurrentMigrationReport(report) {
	if ( !report ) return;
	console.info("SW5E MODULE | Starship Food current migration report", { ...report });
}

/**
 * @param {object|null|undefined} obj
 * @returns {boolean}
 */
export function hasOwnStarshipFoodValue(obj) {
	return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, "value");
}

/**
 * True when stored raw already represents the normalized whole non-negative int.
 * @param {unknown} raw
 * @param {number} normalized
 * @returns {boolean}
 */
export function isIntegralStarshipFoodStock(raw, normalized) {
	if ( !Number.isInteger(normalized) || normalized < 0 ) return false;
	if ( typeof raw === "number" ) {
		return Number.isInteger(raw) && raw === normalized;
	}
	if ( typeof raw === "string" ) {
		const trimmed = raw.trim();
		if ( !/^\+?\d+$/.test(trimmed) ) return false;
		return Number(trimmed) === normalized;
	}
	return false;
}

/**
 * @param {object} source — plain Actor source (toObject-like)
 * @returns {boolean}
 */
export function isSw5eStarshipActorSource(source) {
	return source?.type === "vehicle"
		&& source?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}

/**
 * @param {object} source
 * @returns {{
 *   systemFood: object|null,
 *   flagFood: object|null,
 *   candidateRaw: unknown,
 *   candidateSource: "flag"|"system"|"none",
 *   hasCandidate: boolean
 * }}
 */
export function resolveStarshipFoodCurrentCandidate(source) {
	const systemFood = source?.system?.attributes?.food;
	const systemObj = systemFood && typeof systemFood === "object" ? systemFood : null;
	const flagFood = source?.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.food;
	const flagObj = flagFood && typeof flagFood === "object" ? flagFood : null;

	if ( hasOwnStarshipFoodValue(flagObj) ) {
		return {
			systemFood: systemObj,
			flagFood: flagObj,
			candidateRaw: flagObj.value,
			candidateSource: "flag",
			hasCandidate: true
		};
	}
	if ( hasOwnStarshipFoodValue(systemObj) ) {
		return {
			systemFood: systemObj,
			flagFood: flagObj,
			candidateRaw: systemObj.value,
			candidateSource: "system",
			hasCandidate: true
		};
	}
	return {
		systemFood: systemObj,
		flagFood: flagObj,
		candidateRaw: undefined,
		candidateSource: "none",
		hasCandidate: false
	};
}

/**
 * Schema-default-only system 0 (no flag own-key) → treat as missing.
 * @param {{candidateSource: string, flagFood: object|null, candidateRaw: unknown, hasCandidate: boolean}} candidate
 * @returns {boolean}
 */
export function isSchemaDefaultOnlyFoodZero(candidate) {
	if ( candidate.candidateSource !== "system" ) return false;
	if ( hasOwnStarshipFoodValue(candidate.flagFood) ) return false;
	return normalizeStarshipNonNegativeInt(candidate.candidateRaw) === 0;
}

/**
 * Selected persistent base for initial Food current (no AE / foodCapMod).
 * @param {object} source
 * @returns {{
 *   selectedPersistentBase: number,
 *   sizeFoodCap: number,
 *   customFoodCap: number|null,
 *   overrideActive: boolean,
 *   sizeResolved: boolean,
 *   customFallback: boolean,
 *   missingSize: boolean
 * }}
 */
export function resolveStarshipFoodCurrentPersistentBase(source) {
	const items = Array.isArray(source?.items) ? source.items : [];
	const sizeItem = getLegacyStarshipSize(items);
	const sizeSystem = getLegacySizeSystem(sizeItem);
	const sizeFoodCap = normalizeStarshipNonNegativeInt(sizeSystem?.foodCap) ?? 0;
	const sizeResolved = Boolean(sizeItem);
	const missingSize = !sizeResolved;

	const overrideRaw = source?.flags?.sw5e?.starship?.food?.capOverride;
	const overrideActive = overrideRaw === true || overrideRaw === "true" || overrideRaw === 1;

	const systemFood = source?.system?.attributes?.food;
	const flagFood = source?.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.food;
	const customRaw = (systemFood && typeof systemFood === "object" ? systemFood.foodCap : undefined)
		?? (flagFood && typeof flagFood === "object" ? flagFood.foodCap : undefined);
	const customFoodCap = normalizeStarshipNonNegativeInt(customRaw);

	let selectedPersistentBase = sizeFoodCap;
	let customFallback = false;
	if ( overrideActive ) {
		if ( customFoodCap !== null ) {
			selectedPersistentBase = customFoodCap;
		} else {
			selectedPersistentBase = sizeFoodCap;
			customFallback = true;
		}
	}

	return {
		selectedPersistentBase: Math.max(0, selectedPersistentBase),
		sizeFoodCap,
		customFoodCap,
		overrideActive,
		sizeResolved,
		customFallback,
		missingSize
	};
}

/**
 * Build dual-write payload for food.value.
 * @param {number} nextValue
 * @returns {object}
 */
export function buildStarshipFoodCurrentValueUpdate(nextValue) {
	const n = normalizeStarshipNonNegativeInt(nextValue) ?? 0;
	return buildStarshipLegacyAttributeBatchMirrorUpdate([
		["system.attributes.food.value", n]
	]);
}

/**
 * Pure resolve for one Actor source.
 * @param {object} source
 * @returns {{
 *   disposition: StarshipFoodCurrentDisposition,
 *   nextValue: number|null,
 *   update: object|null,
 *   candidateSource: string,
 *   malformed: boolean,
 *   customFallback: boolean,
 *   missingSize: boolean,
 *   initializedZero: boolean,
 *   reason: string
 * }}
 */
export function resolveStarshipFoodCurrentMigration(source) {
	if ( !isSw5eStarshipActorSource(source) ) {
		return {
			disposition: "skip",
			nextValue: null,
			update: null,
			candidateSource: "none",
			malformed: false,
			customFallback: false,
			missingSize: false,
			initializedZero: false,
			reason: "not-starship"
		};
	}

	const baseInfo = resolveStarshipFoodCurrentPersistentBase(source);
	const initialFood = baseInfo.selectedPersistentBase;
	const candidate = resolveStarshipFoodCurrentCandidate(source);

	const finishInitialize = (reason, { malformed=false }={}) => ({
		disposition: "initialize",
		nextValue: initialFood,
		update: buildStarshipFoodCurrentValueUpdate(initialFood),
		candidateSource: candidate.candidateSource,
		malformed,
		customFallback: baseInfo.customFallback,
		missingSize: baseInfo.missingSize,
		initializedZero: initialFood === 0,
		reason
	});

	if ( !candidate.hasCandidate || isSchemaDefaultOnlyFoodZero(candidate) ) {
		return finishInitialize(
			!candidate.hasCandidate ? "missing" : "schema-default-zero"
		);
	}

	const normalized = normalizeStarshipNonNegativeInt(candidate.candidateRaw);
	if ( normalized === null ) {
		return finishInitialize("malformed", { malformed: true });
	}

	if ( isIntegralStarshipFoodStock(candidate.candidateRaw, normalized) ) {
		return {
			disposition: "skip",
			nextValue: normalized,
			update: null,
			candidateSource: candidate.candidateSource,
			malformed: false,
			customFallback: false,
			missingSize: baseInfo.missingSize,
			initializedZero: false,
			reason: "valid-integral"
		};
	}

	// Truncatable decimal (or otherwise truncating string) → normalize write
	return {
		disposition: "normalize",
		nextValue: normalized,
		update: buildStarshipFoodCurrentValueUpdate(normalized),
		candidateSource: candidate.candidateSource,
		malformed: false,
		customFallback: false,
		missingSize: baseInfo.missingSize,
		initializedZero: false,
		reason: "truncate-decimal"
	};
}

/**
 * Record a resolve result onto a report object.
 * @param {object} report
 * @param {ReturnType<typeof resolveStarshipFoodCurrentMigration>} result
 */
export function recordStarshipFoodCurrentMigrationResult(report, result) {
	if ( !report || !result ) return;
	report.scanned += 1;
	if ( result.reason === "not-starship" ) {
		report.notStarship += 1;
		return;
	}
	report.eligibleStarships += 1;
	if ( result.disposition === "skip" ) {
		report.skippedUnchanged += 1;
		return;
	}
	if ( result.disposition === "normalize" ) {
		report.normalizedExisting += 1;
		return;
	}
	if ( result.disposition === "initialize" ) {
		report.initializedMissing += 1;
		if ( result.malformed ) report.malformedInitialized += 1;
		if ( result.initializedZero ) report.initializedZeroTinyOrMissingSize += 1;
		if ( result.customFallback ) report.customFallback += 1;
	}
}

/**
 * Apply Food current migration into Actor migration updateData (+ working source).
 * @param {object} workingActor
 * @param {object} updateData
 * @param {object} [report]
 * @returns {ReturnType<typeof resolveStarshipFoodCurrentMigration>}
 */
export function applyStarshipFoodCurrentMigration(workingActor, updateData, report=activeFoodCurrentMigrationReport) {
	const result = resolveStarshipFoodCurrentMigration(workingActor);
	if ( report ) recordStarshipFoodCurrentMigrationResult(report, result);
	if ( result.update && updateData && typeof updateData === "object" ) {
		Object.assign(updateData, result.update);
		if ( workingActor && typeof workingActor === "object" ) {
			const merge = globalThis.foundry?.utils?.mergeObject;
			const expand = globalThis.foundry?.utils?.expandObject;
			if ( typeof merge === "function" && typeof expand === "function" ) {
				merge(workingActor, expand(result.update), { inplace: true });
			} else {
				for ( const [path, value] of Object.entries(result.update) ) {
					setPlainPath(workingActor, path, value);
				}
			}
		}
	}
	return result;
}

/**
 * @param {object} obj
 * @param {string} path
 * @param {unknown} value
 */
function setPlainPath(obj, path, value) {
	const parts = path.split(".");
	let cur = obj;
	for ( let i = 0; i < parts.length - 1; i++ ) {
		const key = parts[i];
		if ( cur[key] == null || typeof cur[key] !== "object" ) cur[key] = {};
		cur = cur[key];
	}
	cur[parts[parts.length - 1]] = value;
}

/**
 * Read-only audit of Actor documents or plain sources.
 * @param {Iterable<object>} actors — live Actors or plain sources
 * @returns {object}
 */
export function auditStarshipFoodCurrent(actors) {
	const report = createStarshipFoodCurrentMigrationReport();
	const details = [];
	for ( const actor of actors ?? [] ) {
		const source = typeof actor?.toObject === "function" ? actor.toObject() : actor;
		const result = resolveStarshipFoodCurrentMigration(source);
		recordStarshipFoodCurrentMigrationResult(report, result);
		if ( result.reason !== "not-starship" && result.disposition !== "skip" ) {
			details.push({
				id: source?._id ?? actor?.id,
				name: source?.name ?? actor?.name,
				disposition: result.disposition,
				nextValue: result.nextValue,
				reason: result.reason
			});
		}
	}
	return { ...report, details };
}
