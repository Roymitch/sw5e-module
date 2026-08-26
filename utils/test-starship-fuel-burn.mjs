#!/usr/bin/env node
/**
 * Offline tests: Phase 3A / Bug 7 multi-unit Starship Fuel burn helpers.
 */
import assert from "node:assert/strict";
import {
	coerceStarshipFuelBurnDialogResult,
	formatStarshipFuelOverBurnWarning,
	getStarshipFuelBurnDialogForm,
	normalizeStarshipFuelBurnRequest,
	readStarshipFuelBurnAmountFromForm,
	resolveStarshipFuelBurn,
	starshipFuelBurnDialogCallback
} from "../scripts/starship-fuel-burn.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

/** Minimal form stub matching DialogV2 outer-form field access. */
function mockForm(burnedValue) {
	const input = { value: burnedValue, name: "burned" };
	return {
		tagName: "FORM",
		elements: {
			namedItem: name => (name === "burned" ? input : null)
		},
		querySelector: sel => (sel === "[name='burned']" ? input : null)
	};
}

test("normalize: accepts positive integers", () => {
	assert.equal(normalizeStarshipFuelBurnRequest(1), 1);
	assert.equal(normalizeStarshipFuelBurnRequest("3"), 3);
	assert.equal(normalizeStarshipFuelBurnRequest(4.9), 4);
});

test("normalize: rejects zero, negative, NaN", () => {
	assert.equal(normalizeStarshipFuelBurnRequest(0), null);
	assert.equal(normalizeStarshipFuelBurnRequest(-2), null);
	assert.equal(normalizeStarshipFuelBurnRequest("nope"), null);
	assert.equal(normalizeStarshipFuelBurnRequest(""), null);
});

test("resolve: burn within stock", () => {
	assert.deepEqual(resolveStarshipFuelBurn(5, 1), {
		requested: 1,
		applied: 1,
		newValue: 4,
		overBurn: false
	});
	assert.deepEqual(resolveStarshipFuelBurn(5, 3), {
		requested: 3,
		applied: 3,
		newValue: 2,
		overBurn: false
	});
});

test("resolve: exact burn to empty", () => {
	assert.deepEqual(resolveStarshipFuelBurn(4, 4), {
		requested: 4,
		applied: 4,
		newValue: 0,
		overBurn: false
	});
});

test("resolve: over-request clamps and flags overBurn", () => {
	assert.deepEqual(resolveStarshipFuelBurn(2, 10), {
		requested: 10,
		applied: 2,
		newValue: 0,
		overBurn: true
	});
});

test("resolve: current 0 yields applied 0 with overBurn", () => {
	assert.deepEqual(resolveStarshipFuelBurn(0, 1), {
		requested: 1,
		applied: 0,
		newValue: 0,
		overBurn: true
	});
});

test("resolve: invalid request returns null", () => {
	assert.equal(resolveStarshipFuelBurn(5, 0), null);
	assert.equal(resolveStarshipFuelBurn(5, -1), null);
});

test("over-burn warning includes requested and applied", () => {
	const text = formatStarshipFuelOverBurnWarning(10, 2);
	assert.match(text, /Requested 10 fuel, but only 2 remaining was burned\./);
});

test("DialogV2 wait result: action string 'burn' must not be treated as amount", () => {
	assert.equal(coerceStarshipFuelBurnDialogResult("burn"), null);
	assert.equal(coerceStarshipFuelBurnDialogResult("cancel"), null);
	assert.equal(coerceStarshipFuelBurnDialogResult(null), null);
	assert.equal(coerceStarshipFuelBurnDialogResult(1), 1);
	assert.equal(coerceStarshipFuelBurnDialogResult(3), 3);
	assert.equal(coerceStarshipFuelBurnDialogResult(0), null);
});

test("read amount from form field name=burned", () => {
	assert.equal(readStarshipFuelBurnAmountFromForm(mockForm("1")), 1);
	assert.equal(readStarshipFuelBurnAmountFromForm(mockForm("3")), 3);
	assert.equal(readStarshipFuelBurnAmountFromForm(mockForm("")), null);
	assert.equal(readStarshipFuelBurnAmountFromForm(null), null);
});

test("button.callback prefers button.form and returns parsed amount", () => {
	const form = mockForm("7");
	const button = { form };
	assert.equal(getStarshipFuelBurnDialogForm(button, {}), form);
	assert.equal(starshipFuelBurnDialogCallback({}, button, {}), 7);
});

test("button.callback falls back to dialog.form when button.form missing", () => {
	const form = mockForm("2");
	const dialog = { form };
	assert.equal(starshipFuelBurnDialogCallback({}, {}, dialog), 2);
});

console.log(`\n${passed} tests passed`);
