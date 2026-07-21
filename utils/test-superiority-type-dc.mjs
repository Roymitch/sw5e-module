/**
 * Offline tests for Bug 21 B2 Maneuver superiority type DC resolution.
 */
import assert from "node:assert/strict";
import { resolveSuperiorityTypeDc } from "../scripts/patch/maneuver.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const base = 8 + 3; // PB 3
const strMod = 3;
const intMod = 3;
const bonus = 0;

check("null type DC uses formula (physical)", () => {
	assert.equal(resolveSuperiorityTypeDc(null, base, strMod, bonus), 14);
});

check("undefined type DC uses formula", () => {
	assert.equal(resolveSuperiorityTypeDc(undefined, base, strMod, bonus), 14);
});

check("empty/whitespace type DC uses formula", () => {
	assert.equal(resolveSuperiorityTypeDc("", base, intMod, bonus), 14);
	assert.equal(resolveSuperiorityTypeDc("  ", base, intMod, bonus), 14);
});

check("finite explicit override is preserved", () => {
	assert.equal(resolveSuperiorityTypeDc(18, base, strMod, bonus), 18);
});

check("explicit zero override is preserved", () => {
	assert.equal(resolveSuperiorityTypeDc(0, base, strMod, bonus), 0);
	assert.equal(resolveSuperiorityTypeDc("0", base, strMod, bonus), 0);
});

check("bonus contributes to formula fallback", () => {
	assert.equal(resolveSuperiorityTypeDc(null, base, strMod, 2), 16);
});

check("invalid text falls through to formula", () => {
	assert.equal(resolveSuperiorityTypeDc("abc", base, strMod, bonus), 14);
});

console.log(`\n${passed} tests passed`);
