/**
 * Minimal IR schema + four-dimensional entry factory.
 */
import {
	CAPABILITY_STATUSES,
	OUTPUT_SELECTION_STATUSES,
	PARSE_STATUSES,
	PRODUCTION_READINESS_STATUSES
} from "./classification-enums.mjs";
import { assertFourDimensionalAccounting } from "./classify.mjs";
import { SCHEMA_VERSION } from "./paths.mjs";

export function createEmptyIrEntry(partial = {}) {
	return {
		schemaVersion: SCHEMA_VERSION,
		sourceName: "",
		normalizedName: "",
		semanticKey: "",
		section: "",
		sourceOrder: 0,
		rawSourceHash: "",
		parseStatus: "parsed-valid",
		capabilityStatus: "capability-not-evaluated",
		outputSelection: "not-selected",
		productionReadiness: "not-assessed",
		warnings: [],
		unsupportedMechanics: [],
		features: {},
		manualReview: false,
		manualReviewReasons: [],
		confidence: "low",
		intentionallyExcluded: false,
		inventory: [],
		forceTech: {
			actorResourcesSupported: false,
			powerLookup: "not-assessed",
			powerEmbedding: "not-assessed",
			activityAvailability: "not-assessed",
			pointConsumption: "not-assessed",
			discountCompatibility: "not-assessed",
			unsupportedPowerMechanics: []
		},
		...partial
	};
}

export function validateIrEntry(entry) {
	const errors = [];
	if ( !entry || typeof entry !== "object" ) return { ok: false, errors: ["entry not object"] };
	if ( !entry.sourceName ) errors.push("sourceName required");
	if ( !entry.intentionallyExcluded ) {
		if ( !PARSE_STATUSES.includes(entry.parseStatus) ) errors.push(`parseStatus ${entry.parseStatus}`);
		if ( !CAPABILITY_STATUSES.includes(entry.capabilityStatus) ) errors.push(`capabilityStatus ${entry.capabilityStatus}`);
		if ( !OUTPUT_SELECTION_STATUSES.includes(entry.outputSelection) ) errors.push(`outputSelection ${entry.outputSelection}`);
		if ( !PRODUCTION_READINESS_STATUSES.includes(entry.productionReadiness) ) {
			errors.push(`productionReadiness ${entry.productionReadiness}`);
		}
	}
	if ( !Array.isArray(entry.warnings) ) errors.push("warnings must be array");
	return { ok: errors.length === 0, errors };
}

export function assertAccountingInvariant(entries, expectedComplete = 508) {
	return assertFourDimensionalAccounting(entries, expectedComplete);
}
