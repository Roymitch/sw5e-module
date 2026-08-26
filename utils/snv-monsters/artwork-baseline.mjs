import fs from "node:fs";

export const REVIEW_AUTHORITIES = Object.freeze([
	"automated-baseline-review",
	"maintainer-approved",
	"rejected"
]);

export const BASELINE_CONFIDENCE = Object.freeze([
	"high",
	"medium",
	"low",
	"insufficient"
]);

export const GENERATED_ART_STYLE_STANZA = "original science-fantasy comic-book illustration, early-2000s painted sequential-art aesthetic, expressive ink contours, angular silhouettes, dramatic cel-like shadow shapes, restrained textured brushwork, cinematic lighting, readable creature anatomy, entirely original pose and background, no text, no logos, no watermarks, no imitation of a specific panel or artist";

const BASELINE_STRING_FIELDS = Object.freeze([
	"sourceIdentity",
	"species",
	"age",
	"variant",
	"role",
	"bodyPlan",
	"silhouette",
	"headShape",
	"facialGeometry",
	"eyeStructure",
	"mouthAndNoseStructure",
	"surface",
	"posture",
	"relativeProportions",
	"requiredAvatarComposition",
	"requiredTokenComposition",
	"reviewStatus"
]);

const BASELINE_ARRAY_FIELDS = Object.freeze([
	"appendages",
	"approvedColorRange",
	"clothing",
	"armor",
	"equipment",
	"distinguishingFeatures",
	"differencesFromSimilarSpecies",
	"mustHave",
	"mustNotHave",
	"uncertainFeatures",
	"variantConflicts",
	"referenceAgreement",
	"referenceDisagreement",
	"commonMisgenerationRisks",
	"featureConsensus"
]);

function isPlainObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasNonEmptyString(value) {
	return typeof value === "string" && value.trim().length > 0;
}

function isIsoDate(value) {
	return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function pushArrayStringErrors(errors, label, value, { minItems = 0 } = {}) {
	if ( !Array.isArray(value) ) {
		errors.push(`${label} must be an array`);
		return;
	}
	if ( value.length < minItems ) errors.push(`${label} must contain at least ${minItems} item(s)`);
	for ( const [index, item] of value.entries() ) {
		if ( !hasNonEmptyString(item) ) errors.push(`${label}[${index}] must be a non-empty string`);
	}
}

function validateFeatureConsensus(list, errors) {
	if ( !Array.isArray(list) ) {
		errors.push("featureConsensus must be an array");
		return;
	}
	for ( const [index, item] of list.entries() ) {
		if ( !isPlainObject(item) ) {
			errors.push(`featureConsensus[${index}] must be an object`);
			continue;
		}
		if ( !hasNonEmptyString(item.feature) ) errors.push(`featureConsensus[${index}].feature must be a non-empty string`);
		if ( !Number.isInteger(item.supportingReferenceCount) || item.supportingReferenceCount < 0 ) {
			errors.push(`featureConsensus[${index}].supportingReferenceCount must be a non-negative integer`);
		}
		pushArrayStringErrors(errors, `featureConsensus[${index}].authoritativeSupport`, item.authoritativeSupport);
		pushArrayStringErrors(errors, `featureConsensus[${index}].conflicts`, item.conflicts);
		if ( !hasNonEmptyString(item.speciesGeneralVsNamedIndividual) ) {
			errors.push(`featureConsensus[${index}].speciesGeneralVsNamedIndividual must be a non-empty string`);
		}
		if ( !hasNonEmptyString(item.ageOrVariantScoped) ) {
			errors.push(`featureConsensus[${index}].ageOrVariantScoped must be a non-empty string`);
		}
	}
}

export function validateVisualBaseline(baseline) {
	const errors = [];
	if ( !isPlainObject(baseline) ) return { ok: false, errors: ["baseline must be an object"] };
	for ( const field of BASELINE_STRING_FIELDS ) {
		if ( !hasNonEmptyString(baseline[field]) ) errors.push(`${field} must be a non-empty string`);
	}
	if ( !Number.isInteger(baseline.limbCount) || baseline.limbCount < 0 ) {
		errors.push("limbCount must be a non-negative integer");
	}
	if ( !Number.isInteger(baseline.digitCount) || baseline.digitCount < 0 ) {
		errors.push("digitCount must be a non-negative integer");
	}
	for ( const field of BASELINE_ARRAY_FIELDS ) {
		if ( field === "mustHave" || field === "approvedColorRange" || field === "distinguishingFeatures"
			|| field === "differencesFromSimilarSpecies" || field === "referenceAgreement" || field === "commonMisgenerationRisks" ) {
			pushArrayStringErrors(errors, field, baseline[field], { minItems: 1 });
			continue;
		}
		if ( field === "featureConsensus" ) {
			validateFeatureConsensus(baseline[field], errors);
			continue;
		}
		pushArrayStringErrors(errors, field, baseline[field]);
	}
	if ( !BASELINE_CONFIDENCE.includes(baseline.confidence) ) {
		errors.push(`confidence must be one of: ${BASELINE_CONFIDENCE.join(", ")}`);
	}
	return { ok: errors.length === 0, errors };
}

export function assertValidVisualBaseline(baseline) {
	const result = validateVisualBaseline(baseline);
	if ( !result.ok ) throw new Error(`[snv-monsters] invalid visual baseline: ${result.errors.join("; ")}`);
	return baseline;
}

export function loadVisualBaseline(filePath) {
	const baseline = JSON.parse(fs.readFileSync(filePath, "utf8"));
	return assertValidVisualBaseline(baseline);
}

function validateReferenceObservation(entry, label, errors) {
	if ( !isPlainObject(entry) ) {
		errors.push(`${label} must be an object`);
		return;
	}
	if ( !hasNonEmptyString(entry.url) ) errors.push(`${label}.url must be a non-empty string`);
	if ( !isIsoDate(entry.recordedOn) ) errors.push(`${label}.recordedOn must be YYYY-MM-DD`);
	pushArrayStringErrors(errors, `${label}.observations`, entry.observations, { minItems: 1 });
}

function validateEvidenceOutput(entry, label, errors) {
	if ( !isPlainObject(entry) ) {
		errors.push(`${label} must be an object`);
		return;
	}
	if ( !["avatar", "token"].includes(entry.kind) ) errors.push(`${label}.kind must be avatar or token`);
	if ( !["Avatar.webp", "Token.webp"].includes(entry.fileName) ) {
		errors.push(`${label}.fileName must be Avatar.webp or Token.webp`);
	}
	if ( !isIsoDate(entry.recordedOn) ) errors.push(`${label}.recordedOn must be YYYY-MM-DD`);
}

function validateRejection(entry, label, errors) {
	if ( !isPlainObject(entry) ) {
		errors.push(`${label} must be an object`);
		return;
	}
	if ( !isIsoDate(entry.recordedOn) ) errors.push(`${label}.recordedOn must be YYYY-MM-DD`);
	if ( !REVIEW_AUTHORITIES.includes(entry.reviewAuthority) ) {
		errors.push(`${label}.reviewAuthority must be one of: ${REVIEW_AUTHORITIES.join(", ")}`);
	}
	pushArrayStringErrors(errors, `${label}.reasons`, entry.reasons, { minItems: 1 });
}

export function validateArtworkEvidence(evidence) {
	const errors = [];
	if ( !isPlainObject(evidence) ) return { ok: false, errors: ["evidence must be an object"] };
	for ( const field of ["sourceIdentity", "sourceName", "generationPrompt"] ) {
		if ( !hasNonEmptyString(evidence[field]) ) errors.push(`${field} must be a non-empty string`);
	}
	if ( !isIsoDate(evidence.generatedOn) ) errors.push("generatedOn must be YYYY-MM-DD");
	if ( !REVIEW_AUTHORITIES.includes(evidence.reviewAuthority) ) {
		errors.push(`reviewAuthority must be one of: ${REVIEW_AUTHORITIES.join(", ")}`);
	}
	if ( typeof evidence.unofficialFanContent !== "boolean" ) errors.push("unofficialFanContent must be boolean");
	pushArrayStringErrors(errors, "notEndorsedBy", evidence.notEndorsedBy, { minItems: 1 });
	if ( !Array.isArray(evidence.referenceObservations) ) {
		errors.push("referenceObservations must be an array");
	} else {
		for ( const [index, entry] of evidence.referenceObservations.entries() ) {
			validateReferenceObservation(entry, `referenceObservations[${index}]`, errors);
		}
	}
	if ( !Array.isArray(evidence.rejections) ) {
		errors.push("rejections must be an array");
	} else {
		for ( const [index, entry] of evidence.rejections.entries() ) {
			validateRejection(entry, `rejections[${index}]`, errors);
		}
	}
	if ( !Array.isArray(evidence.acceptedOutputs) ) {
		errors.push("acceptedOutputs must be an array");
	} else {
		for ( const [index, entry] of evidence.acceptedOutputs.entries() ) {
			validateEvidenceOutput(entry, `acceptedOutputs[${index}]`, errors);
		}
	}
	if ( !isPlainObject(evidence.provenance) ) {
		errors.push("provenance must be an object");
	} else {
		if ( !hasNonEmptyString(evidence.provenance.tool) ) errors.push("provenance.tool must be a non-empty string");
		if ( !hasNonEmptyString(evidence.provenance.model) ) errors.push("provenance.model must be a non-empty string");
		if ( !isIsoDate(evidence.provenance.generatedOn) ) errors.push("provenance.generatedOn must be YYYY-MM-DD");
		if ( !REVIEW_AUTHORITIES.includes(evidence.provenance.reviewAuthority) ) {
			errors.push(`provenance.reviewAuthority must be one of: ${REVIEW_AUTHORITIES.join(", ")}`);
		}
		if ( typeof evidence.provenance.unofficialFanContent !== "boolean" ) {
			errors.push("provenance.unofficialFanContent must be boolean");
		}
		if ( typeof evidence.provenance.notEndorsed !== "boolean" ) {
			errors.push("provenance.notEndorsed must be boolean");
		}
	}
	return { ok: errors.length === 0, errors };
}

export function assertValidArtworkEvidence(evidence) {
	const result = validateArtworkEvidence(evidence);
	if ( !result.ok ) throw new Error(`[snv-monsters] invalid artwork evidence: ${result.errors.join("; ")}`);
	return evidence;
}

export function buildGeneratedArtworkProvenance({
	tool = "GenerateImage",
	model = "tool-generated",
	generatedOn,
	reviewAuthority,
	unofficialFanContent = true
} = {}) {
	if ( !isIsoDate(generatedOn) ) throw new Error("[snv-monsters] provenance generatedOn must be YYYY-MM-DD");
	if ( !REVIEW_AUTHORITIES.includes(reviewAuthority) ) {
		throw new Error(`[snv-monsters] invalid reviewAuthority: ${reviewAuthority}`);
	}
	return {
		tool,
		model,
		generatedOn,
		reviewAuthority,
		unofficialFanContent,
		notEndorsed: true
	};
}

function joinList(values) {
	return values.filter(hasNonEmptyString).join(", ");
}

function labeledList(label, values) {
	const joined = joinList(values);
	return joined ? `${label}: ${joined}` : "";
}

export function buildGenerationPrompt(baseline, { kind = "avatar" } = {}) {
	assertValidVisualBaseline(baseline);
	const composition = kind === "token"
		? baseline.requiredTokenComposition
		: baseline.requiredAvatarComposition;
	const parts = [
		`${baseline.species}, ${baseline.variant}, ${baseline.role}`,
		`body plan: ${baseline.bodyPlan}`,
		`silhouette: ${baseline.silhouette}`,
		`head shape: ${baseline.headShape}`,
		`face geometry: ${baseline.facialGeometry}`,
		`eyes: ${baseline.eyeStructure}`,
		`mouth and nose structure: ${baseline.mouthAndNoseStructure}`,
		`limbs: ${baseline.limbCount}, digits: ${baseline.digitCount}`,
		`surface: ${baseline.surface}`,
		`posture: ${baseline.posture}`,
		`relative proportions: ${baseline.relativeProportions}`,
		`colors: ${joinList(baseline.approvedColorRange)}`,
		labeledList("clothing", baseline.clothing),
		labeledList("armor", baseline.armor),
		labeledList("equipment", baseline.equipment),
		`distinguishing features: ${joinList(baseline.distinguishingFeatures)}`,
		`must have: ${joinList(baseline.mustHave)}`,
		labeledList("must not have", baseline.mustNotHave),
		`composition: ${composition}`,
		GENERATED_ART_STYLE_STANZA
	];
	return parts.filter(part => typeof part === "string" && part.trim()).join(". ");
}
