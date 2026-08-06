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
