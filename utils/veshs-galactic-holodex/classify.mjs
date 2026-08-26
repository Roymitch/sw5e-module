import {
	CAPABILITY_STATUSES,
	OUTPUT_SELECTION_STATUSES,
	PARSE_STATUSES,
	PRODUCTION_READINESS_STATUSES
} from "./classification-enums.mjs";

export function stripBlockquotes(body) {
	return String(body || "").replace(/^>\s?/gm, "");
}

export function detectFeatures(body) {
	const text = stripBlockquotes(body);
	const hasHp = /Hit Points/i.test(text);
	const hasAc = /Armor Class/i.test(text);
	const hasAbilityTable = /\|(?:\s*\d+\s*\([^)]+\)\s*\|){6}/.test(text)
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
		|| /\bforce save DC\b/i.test(text)
		|| /innately cast(?:s|ing)?[^.]*\bforce power\b/i.test(text);
	const hasTech = /\b\d+(?:st|nd|rd|th)-level techcaster\b/i.test(text)
		|| /\btech points\b/i.test(text)
		|| /\*{1,3}(?:Innate\s+)?Techcasting\b/i.test(text)
		|| /\btechcasting ability\b/i.test(text)
		|| /\btech casting ability\b/i.test(text)
		|| /\btech save DC\b/i.test(text)
		|| /innately cast(?:s|ing)?[^.]*\btech power\b/i.test(text);
	const hasIokathSuperiority = /\bIokath Superiority\b/i.test(text);
	const hasSuperiorityDice = /\bsuperiority (?:die|dice)\b/i.test(text)
		|| /\bmaneuver save DC\b/i.test(text)
		|| /\bmaneuver ability\b/i.test(text)
		|| /knows the following maneuvers/i.test(text)
		|| /expends? (?:a |one )?superiority die/i.test(text);
	const hasSuperiority = hasSuperiorityDice;
	const hasSwarm = /\bswarm\b/i.test(text);
	const hasSquad = /\bsquad\b/i.test(text);
	const hasQualifiedDefense = /Damage (?:Resistances|Immunities|Vulnerabilities)|Condition Immunities/i.test(text)
		&& /\([^)]+\)/.test(text);
	const hasUnusualSenseOrMove = /blindsight|tremorsense|truesight|burrow|climb|fly|hover|forcesight/i.test(text);
	const hasPowerList = /(?:at[- ]will|at will|\d+\/day(?: each)?|\d+(?:st|nd|rd|th)[- ]level)\s*:/i.test(text)
		|| /knows the following (?:force |tech )?powers/i.test(text);

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
		hasSuperiorityDice,
		hasIokathSuperiority,
		hasSwarm,
		hasSquad,
		hasQualifiedDefense,
		hasUnusualSenseOrMove,
		hasPowerList
	};
}

export function deriveCapability(features, { parseFailed = false } = {}) {
	if (parseFailed) {
		return {
			capabilityStatus: "capability-not-evaluated",
			unsupportedMechanics: ["parser-failure"],
			reasons: ["parseFailed"]
		};
	}
	if (!features.hasBasicScalars) {
		return {
			capabilityStatus: "manual-review-required",
			unsupportedMechanics: ["missing-basic-stat-block-fields"],
			reasons: ["missing-basic-stat-block-fields"]
		};
	}

	const unsupportedMechanics = [];
	if (features.hasLegendary) unsupportedMechanics.push("legendary-actions");
	if (features.hasMythic) unsupportedMechanics.push("mythic-actions");
	if (features.hasForce) unsupportedMechanics.push("force-power-embedding-incomplete");
	if (features.hasTech) unsupportedMechanics.push("tech-power-embedding-incomplete");
	if (features.hasSuperiority) unsupportedMechanics.push("superiority-embedding-incomplete");
	if (features.hasSwarm || features.hasSquad) unsupportedMechanics.push("swarm-squad-ammo-policy");
	if (features.hasQualifiedDefense) unsupportedMechanics.push("qualified-defense-parsing");
	if (features.hasRecharge) unsupportedMechanics.push("recharge-activity");
	if (features.hasLimitedUses) unsupportedMechanics.push("limited-uses-activity");
	if (features.hasBonusActions) unsupportedMechanics.push("bonus-action-activity");
	if (features.hasReactions) unsupportedMechanics.push("reaction-activity");
	if (features.hasPowerList && !features.hasForce && !features.hasTech) {
		unsupportedMechanics.push("power-list-embedding");
	}

	const complex = unsupportedMechanics.length > 0;
	if (!features.hasAttack && !features.hasSave && complex) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics,
			reasons: ["scalars-ok-complex-mechanics"]
		};
	}
	if (!features.hasAttack && !features.hasSave && !complex) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics: ["no-parseable-attack-or-save"],
			reasons: ["scalars-only"]
		};
	}
	if (complex) {
		return {
			capabilityStatus: "partially-supported",
			unsupportedMechanics,
			reasons: ["complex-mechanics-present"]
		};
	}
	return {
		capabilityStatus: "fully-supported",
		unsupportedMechanics: [],
		reasons: ["basic-scalars-and-attack-or-save"]
	};
}

export function deriveParseStatus({ intentionallyExcluded = false, parseFailed = false, warnings = [] }) {
	if (intentionallyExcluded) return "intentionally-excluded";
	if (parseFailed) return "parser-failure";
	if (warnings.length) return "parsed-with-warnings";
	return "parsed-valid";
}

export function deriveOutputSelection({ intentionallyExcluded = false, selectedPilot = false, selectedPopulation = false } = {}) {
	if (intentionallyExcluded) return "excluded";
	if (selectedPilot) return "selected-pilot";
	if (selectedPopulation) return "selected-population";
	return "not-selected";
}

export function deriveProductionReadiness({
	intentionallyExcluded = false,
	parseStatus,
	capabilityStatus,
	outputSelection
}) {
	if (intentionallyExcluded || outputSelection === "excluded") return "blocked";
	if (parseStatus === "parser-failure") return "blocked";
	if (capabilityStatus === "manual-review-required") return "requires-product-decision";
	if (outputSelection === "selected-pilot" || outputSelection === "selected-population") {
		return capabilityStatus === "fully-supported"
			? "prototype-validated"
			: "requires-runtime-validation";
	}
	return "not-assessed";
}

export function validateClassificationEnums() {
	return {
		parseStatuses: PARSE_STATUSES,
		capabilityStatuses: CAPABILITY_STATUSES,
		outputSelectionStatuses: OUTPUT_SELECTION_STATUSES,
		productionReadinessStatuses: PRODUCTION_READINESS_STATUSES
	};
}
