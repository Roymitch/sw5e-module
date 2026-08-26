#!/usr/bin/env node
/**
 * Offline contract tests for Phase 0A Bug 3 starship ability roll bounds
 * (scripts/starship-data.mjs — makeAbilityRoll).
 *
 * Starship ability check/save rolls must not supply d20 min/max bounds.
 * Character/NPC roll construction does not call makeAbilityRoll.
 */
import { makeAbilityRoll } from "../scripts/starship-data.mjs";

function assertEq(actual, expected, msg) {
	if ( actual !== expected ) {
		throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}
}

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function assertNoRange(roll, label) {
	assertEq(roll.min, null, `${label} min`);
	assertEq(roll.max, null, `${label} max`);
}

test("makeAbilityRoll 0/0 → null/null", () => {
	const roll = makeAbilityRoll({ min: 0, max: 0, mode: 0 });
	assertNoRange(roll, "0/0");
	assertEq(roll.mode, 0, "mode");
});

test("makeAbilityRoll null/null → null/null", () => {
	const roll = makeAbilityRoll({ min: null, max: null, mode: 0 });
	assertNoRange(roll, "null/null");
	assertEq(roll.mode, 0, "mode");
});

test("makeAbilityRoll missing bounds → null/null", () => {
	const roll = makeAbilityRoll({});
	assertNoRange(roll, "missing");
	assertEq(roll.mode, 0, "mode default");
});

test("makeAbilityRoll inherited poisoned 1/1 → null/null", () => {
	const roll = makeAbilityRoll({ min: 1, max: 1, mode: 0 });
	assertNoRange(roll, "1/1 poison");
	assertEq(roll.mode, 0, "mode");
});

test("makeAbilityRoll empty string / whitespace / string 0 → null/null", () => {
	const roll = makeAbilityRoll({ min: "", max: "  ", mode: 0 });
	assertNoRange(roll, "empty/whitespace");
	const roll0 = makeAbilityRoll({ min: "0", max: "0", mode: 0 });
	assertNoRange(roll0, "string 0");
});

test("makeAbilityRoll clears any prior non-null bounds (no Starship range feature)", () => {
	const roll = makeAbilityRoll({ min: 2, max: 20, mode: 0 });
	assertNoRange(roll, "2/20");
	const minOnly = makeAbilityRoll({ min: 10, mode: 1 });
	assertNoRange(minOnly, "min only");
	assertEq(minOnly.mode, 1, "mode");
	const maxOnly = makeAbilityRoll({ max: 15, mode: -1 });
	assertNoRange(maxOnly, "max only");
	assertEq(maxOnly.mode, -1, "mode");
});

test("makeAbilityRoll mode preservation", () => {
	const roll = makeAbilityRoll({ min: 1, max: 1, mode: "2" });
	assertNoRange(roll, "mode preserve");
	assertEq(roll.mode, 2, "mode from numeric string");
});

test("makeAbilityRoll is Starship-path only (Character 1/1 not constructed here)", () => {
	// Ordinary Character ability rolls use dnd5e stock paths, not makeAbilityRoll.
	// This module export exists solely for Starship/vehicle merge via mergeVehicleAbilityValues.
	assertEq(typeof makeAbilityRoll, "function", "export present");
});

console.log(`\n${passed} tests passed`);
