/**
 * Offline tests for Bug 21 B1/B2 nullable DC presence contract.
 */
import assert from "node:assert/strict";
import { isAbsentNullableNumberSource, parseExplicitNullableNumber } from "../scripts/nullable-number.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

check("null is absent", () => {
	assert.equal(isAbsentNullableNumberSource(null), true);
	assert.equal(parseExplicitNullableNumber(null), null);
});

check("undefined is absent", () => {
	assert.equal(isAbsentNullableNumberSource(undefined), true);
	assert.equal(parseExplicitNullableNumber(undefined), null);
});

check("empty string is absent", () => {
	assert.equal(isAbsentNullableNumberSource(""), true);
	assert.equal(parseExplicitNullableNumber(""), null);
});

check("whitespace is absent", () => {
	assert.equal(isAbsentNullableNumberSource("   "), true);
	assert.equal(parseExplicitNullableNumber(" "), null);
});

check("explicit numeric 0 is present", () => {
	assert.equal(isAbsentNullableNumberSource(0), false);
	assert.equal(parseExplicitNullableNumber(0), 0);
});

check("explicit string 0 is present", () => {
	assert.equal(isAbsentNullableNumberSource("0"), false);
	assert.equal(parseExplicitNullableNumber("0"), 0);
});

check("positive DC is present", () => {
	assert.equal(parseExplicitNullableNumber(14), 14);
	assert.equal(parseExplicitNullableNumber("15"), 15);
});

check("invalid text falls back", () => {
	assert.equal(parseExplicitNullableNumber("nope"), null);
	assert.equal(parseExplicitNullableNumber(NaN), null);
});

console.log(`\n${passed} tests passed`);
