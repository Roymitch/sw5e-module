/**
 * Visual-baseline / evidence validation tests for generated SnV artwork.
 */
import assert from "node:assert/strict";
import {
	REVIEW_AUTHORITIES,
	validateArtworkEvidence,
	validateVisualBaseline
} from "./artwork-baseline.mjs";

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`ok - ${name}`);
	} catch ( err ) {
		console.error(`not ok - ${name}`);
		console.error(err);
		process.exitCode = 1;
	}
}

function makeValidBaseline() {
	return {
		sourceIdentity: "snv:Humanoids:purge-trooper-commander",
		species: "Human",
		age: "adult",
		variant: "purge trooper commander",
		role: "armored humanoid commander",
		bodyPlan: "biped",
		silhouette: "broad-shouldered armored soldier silhouette",
		headShape: "human helmeted head",
		facialGeometry: "helmet obscures face; hard angular visor plate",
		eyeStructure: "helmet visor slit",
		mouthAndNoseStructure: "sealed respirator mask integrated into helmet",
		limbCount: 4,
		digitCount: 5,
		appendages: ["pauldron", "utility belt", "holstered baton"],
		surface: "armor over undersuit",
		approvedColorRange: ["white armor", "black undersuit", "dark visor"],
		posture: "upright military stance",
		relativeProportions: "athletic human proportions with bulky armor plating",
		clothing: ["black bodysuit"],
		armor: ["white segmented imperial-style armor", "helmet", "shoulder armor"],
		equipment: ["electrostaff or blaster sidearm"],
		distinguishingFeatures: ["closed helmet", "commander-grade silhouette"],
		differencesFromSimilarSpecies: ["not a stormtrooper", "not a clone trooper face reveal"],
		requiredAvatarComposition: "waist-up portrait with readable helmet silhouette",
		requiredTokenComposition: "full-body centered silhouette readable at token scale",
		mustHave: ["sealed helmet", "white armor", "black undersuit"],
		mustNotHave: ["bare human face", "lightsaber", "stormtrooper frown mask"],
		uncertainFeatures: ["exact pauldron color"],
		variantConflicts: ["unhelmeted inquisitor styling"],
		referenceAgreement: ["all references show sealed white armor"],
		referenceDisagreement: ["some references vary shoulder accents"],
		confidence: "high",
		reviewStatus: "ready-for-generation",
		commonMisgenerationRisks: [
			"generic stormtrooper faceplate",
			"lightsaber added by mistake"
		],
		featureConsensus: [
			{
				feature: "helmet",
				supportingReferenceCount: 3,
				authoritativeSupport: ["reference-a", "reference-b"],
				conflicts: [],
				speciesGeneralVsNamedIndividual: "species-general",
				ageOrVariantScoped: "variant-specific"
			}
		]
	};
}

function makeValidEvidence() {
	return {
		sourceIdentity: "snv:Humanoids:purge-trooper-commander",
		sourceName: "Purge Trooper, Commander",
		generatedOn: "2026-08-07",
		reviewAuthority: "automated-baseline-review",
		unofficialFanContent: true,
		notEndorsedBy: ["Disney", "Lucasfilm"],
		referenceObservations: [
			{
				url: "https://example.com/reference",
				observations: ["sealed white armor", "black bodysuit"],
				recordedOn: "2026-08-07"
			}
		],
		generationPrompt: "original science-fantasy comic-book illustration",
		rejections: [],
		acceptedOutputs: [
			{
				kind: "avatar",
				fileName: "Avatar.webp",
				recordedOn: "2026-08-07"
			}
		],
		provenance: {
			tool: "GenerateImage",
			model: "tool-generated",
			generatedOn: "2026-08-07",
			reviewAuthority: "automated-baseline-review",
			unofficialFanContent: true,
			notEndorsed: true
		}
	};
}

test("reviewAuthority enum stays locked to plan-approved values", () => {
	assert.deepEqual(REVIEW_AUTHORITIES, [
		"automated-baseline-review",
		"maintainer-approved",
		"rejected"
	]);
});

test("valid visual baseline passes schema validation", () => {
	const result = validateVisualBaseline(makeValidBaseline());
	assert.equal(result.ok, true, result.errors.join("; "));
});

test("baseline fails closed when required sections are missing", () => {
	const baseline = makeValidBaseline();
	delete baseline.mustHave;
	const result = validateVisualBaseline(baseline);
	assert.equal(result.ok, false);
	assert.ok(result.errors.some(error => /mustHave/.test(error)), result.errors.join("; "));
});

test("valid evidence accepts automated-baseline-review", () => {
	const result = validateArtworkEvidence(makeValidEvidence());
	assert.equal(result.ok, true, result.errors.join("; "));
});

test("evidence rejects invalid reviewAuthority", () => {
	const evidence = makeValidEvidence();
	evidence.reviewAuthority = "human-autonomous-maybe";
	const result = validateArtworkEvidence(evidence);
	assert.equal(result.ok, false);
	assert.ok(result.errors.some(error => /reviewAuthority/.test(error)), result.errors.join("; "));
});

if ( !process.exitCode ) console.log(`\n${passed} artwork baseline tests passed`);
