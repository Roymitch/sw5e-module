/**
 * Local source integration tests — require ai/SnV_Final.md.
 */
import assert from "node:assert/strict";
import path from "node:path";
import { assertFourDimensionalAccounting } from "./classify.mjs";
import { EDGE_CASE_SELECTION } from "./edge-cases.mjs";
import { loadAuthoritativeSnVSource, parseAuthoritativeSource } from "./parse.mjs";
import { EXPECTED_COMPLETE_ENTRIES, SNV_FINAL_PATH } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const loaded = loadAuthoritativeSnVSource();
if ( !loaded.ok ) {
	console.log(`SKIP local source integration tests: ${loaded.reason}`);
	process.exit(0);
}

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

test("authoritative path is ai/SnV_Final.md", () => {
	assert.equal(path.normalize(loaded.path), path.normalize(SNV_FINAL_PATH));
});

test("508 complete with 4D accounting; 8 n1-parity selections", () => {
	const result = parseAuthoritativeSource();
	assert.equal(result.ok, true);
	assert.equal(result.ir.entries.length, 509);
	const complete = result.ir.entries.filter(e => !e.intentionallyExcluded);
	assert.equal(complete.length, EXPECTED_COMPLETE_ENTRIES);
	const accounting = assertFourDimensionalAccounting(result.ir.entries, EXPECTED_COMPLETE_ENTRIES);
	assert.equal(accounting.ok, true, accounting.failures.join("; "));
	const n1 = complete.filter(e => e.outputSelection === "selected-n1-parity");
	assert.equal(n1.length, 8);
	const unsupportedOnlyBecauseUnselected = complete.filter(e =>
		e.outputSelection === "not-selected" && e.capabilityStatus === "unsupported"
	);
	// May be zero; must not be ~500 solely from allowlist
	assert.ok(unsupportedOnlyBecauseUnselected.length < 50,
		`too many unsupported among not-selected: ${unsupportedOnlyBecauseUnselected.length}`);
	const notSelected = complete.filter(e => e.outputSelection === "not-selected");
	assert.ok(notSelected.some(e => e.capabilityStatus === "fully-supported"
		|| e.capabilityStatus === "partially-supported"));
});

test("edge-case selection appears in IR", () => {
	const result = parseAuthoritativeSource();
	const edges = result.ir.entries.filter(e => e.outputSelection === "selected-edge-case");
	for ( const sel of EDGE_CASE_SELECTION ) {
		assert.ok(
			edges.some(e => e.normalizedName === normalizeName(sel.name)),
			`missing edge case ${sel.name}`
		);
	}
});

if ( !process.exitCode ) console.log(`\n${passed} integration tests passed`);
