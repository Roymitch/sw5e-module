/**
 * Tracked unit tests — always runnable without ai/SnV_Final.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFourDimensionalAccounting, classifyFourDimensional } from "./classify.mjs";
import {
	assertNoPinnedIdMutation,
	buildProductionIdentityPlan,
	createN3aActorId,
	createProductionActorId,
	loadIdentityMap,
	loadProductionIdentityMap,
	summarizeIdentityAddition,
	summarizeIdentityMap
} from "./identity.mjs";
import { parseMarkdownToIr, splitCreatureBlocks } from "./parse.mjs";
import { COMMITTED_PACK_SOURCE } from "./paths.mjs";
import { validateCompiledPackData, validateIdentityPins, validateProductionPostwrite, validateWriteGuard } from "./validate.mjs";
import { assertAllowedOutputRoot, assertApprovedProductionYamlPath, getProductionBatchDescriptor } from "./write-guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(HERE, "fixtures/synthetic-statblock-corpus.md");

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

test("identity map pins 5 folders and 8 actors", () => {
	const v = validateIdentityPins();
	assert.equal(v.ok, true, v.failures.join("; "));
	assert.equal(summarizeIdentityMap().actors, 8);
});

test("pinned identity mutation is refused", () => {
	const map = loadIdentityMap();
	assert.throws(() => assertNoPinnedIdMutation({
		actors: { [Object.keys(map.actors)[0]]: { id: "0000000000000000", items: {} } }
	}, map));
});

test("write guard refuses committed pack", () => {
	assert.equal(validateWriteGuard().ok, true);
	assert.throws(() => assertAllowedOutputRoot("packs/_source/snv-monsters"));
});

test("production batch descriptors stay fail-closed and path-scoped", () => {
	const n3a = getProductionBatchDescriptor("n3a");
	const p2 = getProductionBatchDescriptor("n3b-p2");
	const p3 = getProductionBatchDescriptor("n3b-p3");
	assert.equal(n3a.artifactPrefix, "n3a");
	assert.equal(p2.approvedSemanticKeys.length, 2);
	assert.equal(p3.approvedSemanticKeys.length, 1);
	assert.throws(() => getProductionBatchDescriptor("not-a-batch"));
	assert.throws(() => assertAllowedOutputRoot(COMMITTED_PACK_SOURCE, { allowProductionWrite: true }));
	assert.throws(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/blurrg.yml"), "n3b-p2"));
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/aryx.yml"), "n3b-p2"));
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/moof.yml"), "n3b-p3"));
	const p4 = getProductionBatchDescriptor("n3b-p4");
	assert.equal(p4.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/sibian-hound.yml"), "n3b-p4"));
	const p1 = getProductionBatchDescriptor("n3b-p1");
	assert.equal(p1.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/gundark-adolescent.yml"), "n3b-p1"));
	const p5 = getProductionBatchDescriptor("n3b-p5");
	assert.equal(p5.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/nerf.yml"), "n3b-p5"));
	const p6 = getProductionBatchDescriptor("n3b-p6");
	assert.equal(p6.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/scrange.yml"), "n3b-p6"));
	const p7 = getProductionBatchDescriptor("n3b-p7");
	assert.equal(p7.approvedSemanticKeys.length, 6);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/fathier.yml"), "n3b-p7"));
	const p8 = getProductionBatchDescriptor("n3b-p8");
	assert.equal(p8.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/reek-adult.yml"), "n3b-p8"));
	const p9 = getProductionBatchDescriptor("n3b-p9");
	assert.equal(p9.approvedSemanticKeys.length, 2);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/vornskr.yml"), "n3b-p9"));
	const p10 = getProductionBatchDescriptor("n3b-p10");
	assert.equal(p10.approvedSemanticKeys.length, 1);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/dianoga-adolescent.yml"), "n3b-p10"));
	const p11 = getProductionBatchDescriptor("n3b-p11");
	assert.equal(p11.approvedSemanticKeys.length, 6);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/kath-hound-horned.yml"), "n3b-p11"));
	const p12 = getProductionBatchDescriptor("n3b-p12");
	assert.equal(p12.approvedSemanticKeys.length, 8);
	assert.doesNotThrow(() => assertApprovedProductionYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/ghest.yml"), "n3b-p12"));
});

test("production identity plans preserve n3a seeds and support n3b-p2 counts", () => {
	const semanticKey = "snv:Beasts:blurrg";
	assert.equal(createProductionActorId("n3a", semanticKey), createN3aActorId(semanticKey));
	const plan = buildProductionIdentityPlan("n3b-p2", {
		finalCandidates: [
			{
				name: "Aryx",
				semanticKey: "snv:Beasts:aryx",
				passives: [],
				nonAttackActions: [],
				weaponAttacks: ["Beak", "Talons"]
			},
			{
				name: "Ewok Pony",
				semanticKey: "snv:Beasts:ewok-pony",
				passives: [],
				nonAttackActions: [],
				weaponAttacks: ["Hooves"]
			}
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 3);
	assert.equal(counts.activities, 3);
});

test("production identity plans support n3b-p3 Moof counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p3", {
		actors: [
			{
				name: "Moof",
				semanticKey: "snv:Beasts:moof",
				traitsAndActions: {
					passives: ["Beast of Burden", "Charge"],
					nonAttackActions: [],
					weaponAttacks: ["Gore"]
				}
			}
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 1);
	assert.equal(counts.actors, 1);
	assert.equal(counts.items, 3);
	assert.equal(counts.activities, 1);
});

test("production identity plans support n3b-p4 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p4", {
		actors: [
			{
				name: "Jundland Wastes Womp Rat",
				semanticKey: "snv:Beasts:jundland-wastes-womp-rat",
				traitsAndActions: {
					passives: ["Keen Hearing and Smell", "Pack Tactics"],
					nonAttackActions: [],
					weaponAttacks: ["Bite"]
				}
			},
			{
				name: "Sibian Hound",
				semanticKey: "snv:Beasts:sibian-hound",
				traitsAndActions: {
					passives: ["Keen Hearing and Smell", "Pack Tactics"],
					nonAttackActions: [],
					weaponAttacks: ["Bite"]
				}
			}
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 6);
	assert.equal(counts.activities, 2);
});

test("production identity plans support n3b-p5 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p5", {
		actors: [
			{
				name: "Nerf",
				semanticKey: "snv:Beasts:nerf",
				traitsAndActions: {
					passives: ["Charge"],
					nonAttackActions: [],
					weaponAttacks: ["Gore", "Spit"]
				}
			},
			{
				name: "Fambaa",
				semanticKey: "snv:Beasts:fambaa",
				traitsAndActions: {
					passives: ["Amphibious", "Siege Monster", "Sure-Footed"],
					nonAttackActions: [],
					weaponAttacks: ["Bite", "Stomp"]
				}
			}
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 8);
	assert.equal(counts.activities, 4);
});

test("production identity plans support n3b-p6 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p6", {
		actors: [
			{
				name: "Scrange",
				semanticKey: "snv:Beasts:scrange",
				traitsAndActions: {
					passives: ["Ambusher", "Bioluminescent", "Hold Breath", "Mud Camouflage", "Surprise Attack"],
					nonAttackActions: ["Multiattack"],
					weaponAttacks: ["Bite", "Tail"]
				}
			},
			{
				name: "Fambaa Howdah",
				semanticKey: "snv:Beasts:fambaa-howdah",
				traitsAndActions: {
					passives: ["Amphibious", "Howdah", "Siege Monster", "Sure-Footed"],
					nonAttackActions: [],
					weaponAttacks: ["Bite", "Stomp"]
				}
			}
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 14);
	assert.equal(counts.activities, 4);
});

test("production identity plans support n3b-p7 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p7", {
		actors: [
			{ name: "Fathier", semanticKey: "snv:Beasts:fathier", traitsAndActions: { passives: ["Keen Hearing", "Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Hooves"] } },
			{ name: "Tusk Cat", semanticKey: "snv:Beasts:tusk-cat", traitsAndActions: { passives: ["Keen Sight and Smell", "Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Hooves", "Tusks"] } },
			{ name: "Ronto", semanticKey: "snv:Beasts:ronto", traitsAndActions: { passives: ["Keen Hearing and Smell", "Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Slam", "Stomp"] } },
			{ name: "Acklay, Adolescent", semanticKey: "snv:Beasts:acklay-adolescent", traitsAndActions: { passives: ["Amphibious", "Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Bite", "Claw"] } },
			{ name: "Bantha, Adolescent", semanticKey: "snv:Beasts:bantha-adolescent", traitsAndActions: { passives: ["Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Ram", "Stomp"] } },
			{ name: "Bantha, Adult", semanticKey: "snv:Beasts:bantha-adult", traitsAndActions: { passives: ["Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Ram", "Stomp"] } }
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 6);
	assert.equal(counts.actors, 6);
	assert.equal(counts.items, 21);
	assert.equal(counts.activities, 11);
});

test("production identity plans support n3b-p8 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p8", {
		actors: [
			{ name: "Reek, Adolescent", semanticKey: "snv:Beasts:reek-adolescent", traitsAndActions: { passives: ["Charge"], nonAttackActions: [], weaponAttacks: ["Gore"] } },
			{ name: "Reek, Adult", semanticKey: "snv:Beasts:reek-adult", traitsAndActions: { passives: ["Charge"], nonAttackActions: [], weaponAttacks: ["Gore"] } }
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 4);
	assert.equal(counts.activities, 2);
});

test("production identity plans support n3b-p9 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p9", {
		actors: [
			{ name: "Scurrier", semanticKey: "snv:Beasts:scurrier", traitsAndActions: { passives: ["Keen Smell", "Pack Tactics"], nonAttackActions: [], weaponAttacks: ["Bite", "Ram"] } },
			{ name: "Vornskr", semanticKey: "snv:Beasts:vornskr", traitsAndActions: { passives: ["Force Tracking", "Keen Smell"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Tail"] } }
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 2);
	assert.equal(counts.actors, 2);
	assert.equal(counts.items, 9);
	assert.equal(counts.activities, 4);
});

test("production identity plans support n3b-p10 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p10", {
		actors: [{
			name: "Dianoga, Adolescent",
			semanticKey: "snv:Beasts:dianoga-adolescent",
			traitsAndActions: {
				passives: ["Grasping Tentacles", "Limited Amphibiousness", "Regeneration"],
				nonAttackActions: ["Multiattack"],
				weaponAttacks: ["Bite", "Tentacles"]
			}
		}]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 1);
	assert.equal(counts.actors, 1);
	assert.equal(counts.items, 6);
	assert.equal(counts.activities, 2);
});

test("production identity plans support n3b-p11 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p11", {
		actors: [
			{ name: "Kath Hound, Horned", semanticKey: "snv:Beasts:kath-hound-horned", traitsAndActions: { passives: ["Charge", "Keen Hearing and Smell", "Pack Tactics"], nonAttackActions: [], weaponAttacks: ["Bite", "Tusk"] } },
			{ name: "Eopie", semanticKey: "snv:Beasts:eopie", traitsAndActions: { passives: ["Beast of Burden"], nonAttackActions: [], weaponAttacks: ["Bite", "Regurgitate"] } },
			{ name: "Rancor, Adolescent", semanticKey: "snv:Beasts:rancor-adolescent", traitsAndActions: { passives: ["Siege Monster"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Claws", "Throw Boulder"] } },
			{ name: "Beggar's Canyon Womp Rat", semanticKey: "snv:Beasts:beggars-canyon-womp-rat", traitsAndActions: { passives: ["Grunge Fever", "Keen Hearing and Smell", "Pack Tactics"], nonAttackActions: [], weaponAttacks: ["Bite", "Gnash"] } },
			{ name: "Gundark, Alpha", semanticKey: "snv:Beasts:gundark-alpha", traitsAndActions: { passives: ["Aura of Menace", "Keen Hearing and Smell", "Rampage", "Siege Monster"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Claw", "Crush"] } },
			{ name: "Gundark, Matriarch", semanticKey: "snv:Beasts:gundark-matriarch", traitsAndActions: { passives: ["Aura of Blood Thirst", "Keen Hearing and Smell", "Rampage", "Siege Monster"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Claw", "Gigantic Claw"] } }
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 6);
	assert.equal(counts.actors, 6);
	assert.equal(counts.items, 33);
	assert.equal(counts.activities, 14);
});

test("production identity plans support n3b-p12 counts", () => {
	const plan = buildProductionIdentityPlan("n3b-p12", {
		actors: [
			{ name: "Bantha, Feral", semanticKey: "snv:Beasts:bantha-feral", traitsAndActions: { passives: ["Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Ram", "Stomp"] } },
			{ name: "Sleen", semanticKey: "snv:Beasts:sleen", traitsAndActions: { passives: ["Trampling Charge"], nonAttackActions: [], weaponAttacks: ["Bite", "Claw"] } },
			{ name: "Scazz", semanticKey: "snv:Beasts:scazz", traitsAndActions: { passives: ["Pack Tactics", "Sunlight Sensitivity"], nonAttackActions: [], weaponAttacks: ["Bite", "Leap Attack"] } },
			{ name: "Pherin", semanticKey: "snv:Beasts:pherin", traitsAndActions: { passives: ["Amphibious", "Standing Leap", "Swamp Camouflage"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Stone"] } },
			{ name: "Nashtah", semanticKey: "snv:Beasts:nashtah", traitsAndActions: { passives: ["Ambusher", "Keen Striking", "Pack Tactics", "Tracking Venom"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Claw", "Tail"] } },
			{ name: "Ghest", semanticKey: "snv:Beasts:ghest", traitsAndActions: { passives: ["Ambusher", "Hold Breath"], nonAttackActions: ["Multiattack"], weaponAttacks: ["Bite", "Claws"] } },
			{ name: "Dianoga, Adult", semanticKey: "snv:Beasts:dianoga-adult", traitsAndActions: { passives: ["Grasping Tentacles", "Limited Amphibiousness", "Regeneration"], nonAttackActions: ["Multiattack", "Tentacle Slam"], weaponAttacks: ["Bite", "Tentacles"] } },
			{ name: "Rancor, Adult", semanticKey: "snv:Beasts:rancor-adult", traitsAndActions: { passives: ["Siege Monster"], nonAttackActions: ["Multiattack", "Swallow"], weaponAttacks: ["Bite", "Claws", "Throw Boulder"] } }
		]
	}, loadProductionIdentityMap());
	const counts = summarizeIdentityAddition(plan);
	assert.equal(Object.keys(plan.actors).length, 8);
	assert.equal(counts.actors, 8);
	assert.equal(counts.items, 42);
	assert.equal(counts.activities, 18);
});

test("production validators fail closed on malformed ledgers", () => {
	const identityMap = loadProductionIdentityMap();
	const malformedLedger = {};
	const postwrite = validateProductionPostwrite("n3b-p2", COMMITTED_PACK_SOURCE, malformedLedger, identityMap);
	assert.equal(postwrite.ok, false);
	assert.ok(postwrite.failures.some(failure => /candidate ledger missing finalCandidates\/actors/i.test(failure)));
	const compiled = validateCompiledPackData([], malformedLedger, identityMap);
	assert.equal(compiled.ok, false);
	assert.ok(compiled.failures.some(failure => /candidate ledger missing finalCandidates\/actors/i.test(failure)));
});

test("synthetic fixture 4D classify: not-selected is not generator-unsupported", () => {
	const md = fs.readFileSync(FIXTURE, "utf8");
	const ir = parseMarkdownToIr(md);
	const cub = ir.entries.find(e => /synthetic cub/i.test(e.sourceName));
	assert.ok(cub);
	assert.notEqual(cub.outputSelection, "selected-n1-parity");
	assert.ok(["fully-supported", "partially-supported", "manual-review-required"].includes(cub.capabilityStatus));
	assert.notEqual(cub.capabilityStatus, "unsupported");
	const excluded = ir.entries.filter(e => e.intentionallyExcluded);
	assert.equal(excluded.length, 1);
	const complete = ir.entries.filter(e => !e.intentionallyExcluded);
	const accounting = assertFourDimensionalAccounting(complete, complete.length);
	assert.equal(accounting.ok, true, accounting.failures.join("; "));
});

test("classification does not use N1 pin as capability", () => {
	const c = classifyFourDimensional({
		name: "Random Beast",
		section: "Beasts",
		body: `
*Small beast*
- Armor Class 12
- Hit Points 10 (2d6)
- Speed 30 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 10 (+0) | 14 (+2) | 12 (+1) | 2 (-4) | 10 (+0) | 5 (-3) |
- Challenge 0 (10 XP)
### Actions
**Bite.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 4 (1d4+2) kinetic damage.
`,
		edgeCaseNames: new Set()
	});
	assert.equal(c.pinned, false);
	assert.equal(c.outputSelection, "not-selected");
	assert.equal(c.capabilityStatus, "fully-supported");
	assert.equal(c.productionReadiness, "not-assessed");
});

test("blocks split without SnV_Final", () => {
	assert.ok(splitCreatureBlocks(fs.readFileSync(FIXTURE, "utf8")).length >= 3);
});

if ( !process.exitCode ) console.log(`\n${passed} unit tests passed`);
