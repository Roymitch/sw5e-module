/**
 * Feature detection + four-dimensional classification (N2 review correction).
 * Output selection must never define generator capability.
 */
import { loadIdentityMap } from "./identity.mjs";
import {
	CAPABILITY_STATUSES,
	OUTPUT_SELECTION_STATUSES,
	PARSE_STATUSES,
	PRODUCTION_READINESS_STATUSES
} from "./classification-enums.mjs";
import { normalizeName, slugifyName } from "./parse-helpers.mjs";

export function stripBlockquotes(body) {
	return String(body || "").replace(/^>\s?/gm, "");
}

export function detectFeatures(body) {
	const text = stripBlockquotes(body);
	const hasHp = /Hit Points/i.test(text);
	const hasAc = /Armor Class/i.test(text);
	const hasAbilityTable = /\|\s*\d+\s*\([^)]+\)\s*\|/.test(text)
		|| (text.match(/^\d+\s*\([+-]?\d+\)\s*$/gm) || []).length >= 6;
	const hasBasicScalars = hasHp && hasAc && hasAbilityTable;
	const hasAttack = /Weapon Attack:/i.test(text) || /\*Hit:\*/i.test(text);
	const hasSave = /saving throw/i.test(text) && (/DC\s*\d+/i.test(text) || /must succeed/i.test(text));
	const hasLegendary = /Legendary Actions/i.test(text);
	const hasMythic = /Mythic Actions/i.test(text);
	const hasReactions = /(?:^|\n)\s*(?:###\s*)?Reactions\b/im.test(text);
	const hasBonusActions = /Bonus Actions/i.test(text);
	const hasRecharge = /\(Recharge/i.test(text) || /recharge\s*\d/i.test(text);
	const hasLimitedUses = /\d+\s*\/\s*day/i.test(text) || /\bcharges\b/i.test(text);
	const hasForce = /\b\d+(?:st|nd|rd|th)-level forcecaster\b/i.test(text)
		|| /\bforce points\b/i.test(text)
		|| /\*{1,3}(?:Innate\s+)?Forcecasting\b/i.test(text)
		|| /\bforcecasting ability\b/i.test(text)
		|| /innately cast(?:s|ing)?[^.]*\bforce power\b/i.test(text);
	const hasTech = /\b\d+(?:st|nd|rd|th)-level techcaster\b/i.test(text)
		|| /\btech points\b/i.test(text)
		|| /\*{1,3}(?:Innate\s+)?Techcasting\b/i.test(text)
		|| /\btechcasting ability\b/i.test(text)
		|| /innately cast(?:s|ing)?[^.]*\btech power\b/i.test(text);
	const hasSuperiority = /\bsuperiority (?:die|dice)\b/i.test(text)
		|| /\bmaneuver save DC\b/i.test(text)
		|| /\bmaneuver ability\b/i.test(text)
		|| /\*{1,3}Superiority\b/i.test(text)
		|| /knows the following maneuvers/i.test(text)
		|| /expends? (?:a |one )?superiority die/i.test(text);
	const hasSwarm = /\bswarm\b/i.test(text);
	const hasSquad = /\bsquad\b/i.test(text);
	const hasQualifiedDefense = /Damage (?:Resistances|Immunities|Vulnerabilities)|Condition Immunities/i.test(text)
		&& /\([^)]+\)/.test(text);
	const hasUnusualSenseOrMove = /blindsight|tremorsense|truesight|burrow|climb|fly|hover/i.test(text);
	const hasPowerList = /(?:at will|1\/day|2\/day|3\/day).*:/i.test(text)
		|| /powers?\s*known/i.test(text);

	return {
		hasBasicScalars,
		hasAttack,
		hasSave,
		hasLegendary,
		hasMythic,
		hasReactions,
		hasBonusActions,
		hasRecharge,
		hasLimitedUses,
		hasForce,
		hasTech,
		hasSuperiority,
		hasSwarm,
		hasSquad,
		hasQualifiedDefense,
		hasUnusualSenseOrMove,
		hasPowerList
	};
}

function findPinned(name, section, identityMap) {
	const sk = `snv:${section}:${slugifyName(name)}`;
	if ( identityMap.actors?.[sk] ) return { semanticKey: sk, pinned: identityMap.actors[sk] };
	const slug = slugifyName(name);
	const byName = Object.entries(identityMap.actors || {}).filter(([, a]) => slugifyName(a.name) === slug);
	if ( byName.length === 1 ) return { semanticKey: byName[0][0], pinned: byName[0][1] };
	return null;
}

/**
 * Capability from source features — independent of N1 pin / sandbox selection.
 */
export function deriveCapability(features, { parseFailed } = {}) {
	if ( parseFailed ) return {
		capabilityStatus: "capability-not-evaluated",
		unsupportedMechanics: ["parser-failure"],
		reasons: ["parseFailed"]
	};
	if ( !features.hasBasicScalars ) {
		return {
			capabilityStatus: "manual-review-required",
			unsupportedMechanics: ["missing-basic-stat-block-fields"],
			reasons: ["missing-basic-stat-block-fields"]
		};
	}

	const unsupportedMechanics = [];
	if ( features.hasLegendary ) unsupportedMechanics.push("legendary-actions");
	if ( features.hasMythic ) unsupportedMechanics.push("mythic-actions");
	if ( features.hasForce ) unsupportedMechanics.push("force-power-embedding-incomplete");
	if ( features.hasTech ) unsupportedMechanics.push("tech-power-embedding-incomplete");
	if ( features.hasSuperiority ) unsupportedMechanics.push("superiority-embedding-incomplete");
	if ( features.hasSwarm || features.hasSquad ) unsupportedMechanics.push("swarm-squad-ammo-policy");
	if ( features.hasQualifiedDefense ) unsupportedMechanics.push("qualified-defense-parsing");
	if ( features.hasRecharge ) unsupportedMechanics.push("recharge-activity");
	if ( features.hasLimitedUses ) unsupportedMechanics.push("limited-uses-activity");
	if ( features.hasBonusActions ) unsupportedMechanics.push("bonus-action-activity");
	if ( features.hasReactions ) unsupportedMechanics.push("reaction-activity");
	// power-list-embedding is covered by Force/Tech embedding once casting traits are parsed
	if ( features.hasPowerList && !features.hasForce && !features.hasTech ) {
		unsupportedMechanics.push("power-list-embedding");
	}

	const complex = unsupportedMechanics.length > 0;
	if ( !features.hasAttack && !features.hasSave && complex ) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics,
			reasons: ["scalars-ok-complex-mechanics"]
		};
	}
	if ( !features.hasAttack && !features.hasSave && !complex ) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics: ["no-parseable-attack-or-save"],
			reasons: ["scalars-only"]
		};
	}
	if ( complex ) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics,
			reasons: ["complex-mechanics-present"]
		};
	}
	// Basic scalars + attack/save, no complex flags → fully-supported for generalized skeleton emit
	return {
		capabilityStatus: "fully-supported",
		unsupportedMechanics: [],
		reasons: ["basic-scalars-and-attack-or-save"]
	};
}

export function deriveParseStatus({ intentionallyExcluded, parseFailed, warnings }) {
	if ( intentionallyExcluded ) return "intentionally-excluded";
	if ( parseFailed ) return "parser-failure";
	if ( warnings?.length ) return "parsed-with-warnings";
	return "parsed-valid";
}

/**
 * @param {Set<string>} edgeCaseNames normalized names selected for edge sandbox
 */
export function deriveOutputSelection({ intentionallyExcluded, pinned, name }, edgeCaseNames = new Set()) {
	if ( intentionallyExcluded ) return "excluded";
	if ( pinned ) return "selected-n1-parity";
	if ( edgeCaseNames.has(normalizeName(name)) ) return "selected-edge-case";
	return "not-selected";
}

export function deriveProductionReadiness({
	intentionallyExcluded,
	parseStatus,
	capabilityStatus,
	outputSelection
}) {
	if ( intentionallyExcluded || outputSelection === "excluded" ) return "blocked";
	if ( parseStatus === "parser-failure" ) return "blocked";
	if ( capabilityStatus === "manual-review-required" ) return "requires-product-decision";
	if ( outputSelection === "selected-n1-parity" ) return "prototype-validated";
	if ( outputSelection === "selected-edge-case" ) {
		if ( capabilityStatus === "fully-supported" ) return "sandbox-only";
		if ( capabilityStatus === "partially-supported" ) return "requires-runtime-validation";
		return "blocked";
	}
	if ( outputSelection === "not-selected" ) return "not-assessed";
	return "not-assessed";
}

/**
 * Full four-dimensional classification for one source block.
 */
export function classifyFourDimensional({
	name,
	section,
	body,
	parseFailed = false,
	warnings = [],
	edgeCaseNames = new Set(),
	identityMap = loadIdentityMap()
}) {
	const intentionallyExcluded = /veerhydra/i.test(name);
	const features = detectFeatures(body);
	const pinnedHit = intentionallyExcluded ? null : findPinned(name, section, identityMap);
	const parseStatus = deriveParseStatus({ intentionallyExcluded, parseFailed, warnings });
	const capability = intentionallyExcluded
		? { capabilityStatus: "unsupported", unsupportedMechanics: ["intentionally-excluded"], reasons: ["veerhydra-stub"] }
		: deriveCapability(features, { parseFailed });
	const outputSelection = deriveOutputSelection({
		intentionallyExcluded,
		pinned: !!pinnedHit,
		name
	}, edgeCaseNames);
	const productionReadiness = deriveProductionReadiness({
		intentionallyExcluded,
		parseStatus,
		capabilityStatus: capability.capabilityStatus,
		outputSelection
	});

	return {
		intentionallyExcluded,
		semanticKeyOverride: pinnedHit?.semanticKey || null,
		features,
		parseStatus,
		capabilityStatus: capability.capabilityStatus,
		unsupportedMechanics: capability.unsupportedMechanics,
		capabilityReasons: capability.reasons,
		outputSelection,
		productionReadiness,
		pinned: !!pinnedHit
	};
}

export function assertFourDimensionalAccounting(entries, expectedComplete = 508) {
	const complete = entries.filter(e => !e.intentionallyExcluded && e.parseStatus !== "intentionally-excluded");
	// also treat intentionallyExcluded flag
	const completeAlt = entries.filter(e => !e.intentionallyExcluded);
	const use = completeAlt;
	const failures = [];
	if ( use.length !== expectedComplete ) {
		failures.push(`complete ${use.length} !== ${expectedComplete}`);
	}

	const countDim = (key, allowed) => {
		const counts = Object.fromEntries(allowed.map(v => [v, 0]));
		const bad = [];
		for ( const e of use ) {
			const v = e[key];
			if ( counts[v] == null ) bad.push(`${e.sourceName}:${key}=${v}`);
			else counts[v]++;
		}
		const sum = allowed.reduce((n, k) => n + counts[k], 0);
		if ( sum !== use.length ) failures.push(`${key} sum ${sum} !== ${use.length}`);
		if ( bad.length ) failures.push(`${key} invalid: ${bad.slice(0, 5).join(", ")}`);
		return counts;
	};

	// Excluded entries must not appear in complete set
	for ( const e of use ) {
		if ( e.outputSelection === "excluded" ) failures.push(`complete entry marked excluded: ${e.sourceName}`);
		if ( !PARSE_STATUSES.includes(e.parseStatus) || e.parseStatus === "intentionally-excluded" ) {
			// complete entries should not use intentionally-excluded parse status
			if ( e.parseStatus === "intentionally-excluded" ) {
				failures.push(`complete entry parse intentionally-excluded: ${e.sourceName}`);
			}
		}
	}

	const parseCounts = countDim("parseStatus", PARSE_STATUSES.filter(s => s !== "intentionally-excluded"));
	const capabilityCounts = countDim("capabilityStatus", CAPABILITY_STATUSES);
	const outputCounts = countDim("outputSelection", OUTPUT_SELECTION_STATUSES.filter(s => s !== "excluded"));
	const readinessCounts = countDim("productionReadiness", PRODUCTION_READINESS_STATUSES);

	return {
		ok: failures.length === 0,
		failures,
		expectedComplete,
		complete: use.length,
		parseCounts,
		capabilityCounts,
		outputCounts,
		readinessCounts
	};
}

export { PARSE_STATUSES, CAPABILITY_STATUSES, OUTPUT_SELECTION_STATUSES, PRODUCTION_READINESS_STATUSES };
