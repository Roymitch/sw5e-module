/**
 * Tracked unit tests — always runnable without ai/SnV_Final.md.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertFourDimensionalAccounting, classifyFourDimensional } from "./classify.mjs";
import { assertNoPinnedIdMutation, loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import { parseMarkdownToIr, splitCreatureBlocks } from "./parse.mjs";
import { validateIdentityPins, validateWriteGuard } from "./validate.mjs";
import { assertAllowedOutputRoot } from "./write-guard.mjs";

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
