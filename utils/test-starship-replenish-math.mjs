#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-1 replenish / food-capacity / cost-mode math.
 */
import assert from "node:assert/strict";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
	STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK,
	STARSHIP_REPLENISH_COST_MODE_PER_UNIT,
	calculateStarshipReplenishDisplayCost,
	normalizeStarshipNonNegativeInt,
	normalizeStarshipPositiveQuantity,
	prepareStarshipReplenishClampWarning,
	resolveStarshipFoodCapacity,
	resolveStarshipReplenishAdd,
	resolveStarshipReplenishConsume,
	resolveStarshipReplenishCostMode,
	resolveStarshipReplenishRoom
} from "../scripts/starship-replenish-math.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("normalize non-negative: undefined/null/empty/NaN/Infinity/negative/action strings", () => {
	assert.equal(normalizeStarshipNonNegativeInt(undefined), null);
	assert.equal(normalizeStarshipNonNegativeInt(null), null);
	assert.equal(normalizeStarshipNonNegativeInt(""), null);
	assert.equal(normalizeStarshipNonNegativeInt("  "), null);
	assert.equal(normalizeStarshipNonNegativeInt(NaN), null);
	assert.equal(normalizeStarshipNonNegativeInt(Infinity), null);
	assert.equal(normalizeStarshipNonNegativeInt(-1), null);
	assert.equal(normalizeStarshipNonNegativeInt("-3"), null);
	assert.equal(normalizeStarshipNonNegativeInt("refuel"), null);
	assert.equal(normalizeStarshipNonNegativeInt("restock"), null);
	assert.equal(normalizeStarshipNonNegativeInt("burn"), null);
});

test("normalize non-negative: zero, positive int, numeric string, decimal trunc", () => {
	assert.equal(normalizeStarshipNonNegativeInt(0), 0);
	assert.equal(normalizeStarshipNonNegativeInt("0"), 0);
	assert.equal(normalizeStarshipNonNegativeInt(12), 12);
	assert.equal(normalizeStarshipNonNegativeInt("7"), 7);
	assert.equal(normalizeStarshipNonNegativeInt(4.9), 4);
	assert.equal(normalizeStarshipNonNegativeInt("3.2"), 3);
});

test("normalize positive quantity rejects zero and action strings", () => {
	assert.equal(normalizeStarshipPositiveQuantity(0), null);
	assert.equal(normalizeStarshipPositiveQuantity("0"), null);
	assert.equal(normalizeStarshipPositiveQuantity("refuel"), null);
	assert.equal(normalizeStarshipPositiveQuantity("restock"), null);
	assert.equal(normalizeStarshipPositiveQuantity(1), 1);
	assert.equal(normalizeStarshipPositiveQuantity("5"), 5);
});

test("room: below, equal, above capacity; does not lower current", () => {
	assert.deepEqual(resolveStarshipReplenishRoom(4, 10), { current: 4, capacity: 10, room: 6 });
	assert.deepEqual(resolveStarshipReplenishRoom(10, 10), { current: 10, capacity: 10, room: 0 });
	assert.deepEqual(resolveStarshipReplenishRoom(15, 10), { current: 15, capacity: 10, room: 0 });
});

test("add: partial fuel-style replenish", () => {
	const r = resolveStarshipReplenishAdd(2, 4, 10);
	assert.deepEqual(r, {
		requested: 2,
		current: 4,
		capacity: 10,
		room: 6,
		applied: 2,
		newValue: 6,
		overRequest: false,
		shouldUpdate: true
	});
});

test("add: over-cap clamp sets overRequest", () => {
	const r = resolveStarshipReplenishAdd(20, 4, 10);
	assert.equal(r.applied, 6);
	assert.equal(r.newValue, 10);
	assert.equal(r.overRequest, true);
	assert.equal(r.shouldUpdate, true);
});

test("add: already-full is no-op", () => {
	const r = resolveStarshipReplenishAdd(5, 10, 10);
	assert.equal(r.applied, 0);
	assert.equal(r.shouldUpdate, false);
	assert.equal(r.newValue, 10);
});

test("add: invalid quantity no-op", () => {
	assert.equal(resolveStarshipReplenishAdd("refuel", 4, 10).shouldUpdate, false);
	assert.equal(resolveStarshipReplenishAdd(0, 4, 10).shouldUpdate, false);
	assert.equal(resolveStarshipReplenishAdd(-2, 4, 10).shouldUpdate, false);
});

test("consume: within available", () => {
	assert.deepEqual(resolveStarshipReplenishConsume(3, 5), {
		requested: 3,
		current: 5,
		applied: 3,
		newValue: 2,
		overRequest: false,
		shouldUpdate: true
	});
});

test("consume: over-request clamp", () => {
	const r = resolveStarshipReplenishConsume(10, 2);
	assert.equal(r.applied, 2);
	assert.equal(r.newValue, 0);
	assert.equal(r.overRequest, true);
	assert.equal(r.shouldUpdate, true);
});

test("consume: current 0 or invalid request no-op", () => {
	assert.equal(resolveStarshipReplenishConsume(1, 0).shouldUpdate, false);
	assert.equal(resolveStarshipReplenishConsume("restock", 5).shouldUpdate, false);
});

test("cost mode: missing/invalid → perRestock; fuel and food independent in same scenario", () => {
	assert.equal(resolveStarshipReplenishCostMode(undefined), STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK);
	assert.equal(resolveStarshipReplenishCostMode(null), STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK);
	assert.equal(resolveStarshipReplenishCostMode("legacyFlat"), STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK);
	assert.equal(resolveStarshipReplenishCostMode(""), STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK);

	const fuelMode = resolveStarshipReplenishCostMode(STARSHIP_REPLENISH_COST_MODE_PER_UNIT);
	const foodMode = resolveStarshipReplenishCostMode(undefined);
	assert.equal(fuelMode, STARSHIP_REPLENISH_COST_MODE_PER_UNIT);
	assert.equal(foodMode, STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK);
	assert.notEqual(fuelMode, foodMode);

	assert.equal(
		STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
		"flags.sw5e.starship.fuel.replenishCostMode"
	);
	assert.equal(
		STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
		"flags.sw5e.starship.food.replenishCostMode"
	);
});

test("cost calc: perRestock flat; perUnit multiplied; zero applied → 0", () => {
	assert.equal(
		calculateStarshipReplenishDisplayCost("perRestock", 100, 6).displayCost,
		100
	);
	assert.equal(
		calculateStarshipReplenishDisplayCost("perUnit", 10, 6).displayCost,
		60
	);
	assert.equal(
		calculateStarshipReplenishDisplayCost("perRestock", 100, 0).displayCost,
		0
	);
	assert.equal(
		calculateStarshipReplenishDisplayCost("perUnit", 10, 0).displayCost,
		0
	);
});

test("cost calc: uses applied quantity after clamp, not over-request", () => {
	const add = resolveStarshipReplenishAdd(20, 4, 10);
	assert.equal(add.requested, 20);
	assert.equal(add.applied, 6);
	const cost = calculateStarshipReplenishDisplayCost("perUnit", 5, add.applied);
	assert.equal(cost.displayCost, 30);
	assert.notEqual(cost.displayCost, 20 * 5);
});

test("food capacity: size baseline without override", () => {
	const r = resolveStarshipFoodCapacity(120, 999, false);
	assert.equal(r.effectiveCap, 120);
	assert.equal(r.overrideActive, false);
	assert.equal(r.outsideRaw, false);
});

test("food capacity: actor override", () => {
	const r = resolveStarshipFoodCapacity(120, 150, true);
	assert.equal(r.effectiveCap, 150);
	assert.equal(r.outsideRaw, true);
	assert.equal(r.tinyPositiveOverride, false);
});

test("food capacity: Tiny/zero baseline and positive override", () => {
	const baseline = resolveStarshipFoodCapacity(0, 0, false);
	assert.equal(baseline.effectiveCap, 0);
	const override = resolveStarshipFoodCapacity(0, 5, true);
	assert.equal(override.effectiveCap, 5);
	assert.equal(override.tinyPositiveOverride, true);
	assert.equal(override.outsideRaw, true);
});

test("food capacity: size baseline change with/without override", () => {
	const noOverrideSmall = resolveStarshipFoodCapacity(10, 0, false);
	const noOverrideMedium = resolveStarshipFoodCapacity(120, 0, false);
	assert.equal(noOverrideSmall.effectiveCap, 10);
	assert.equal(noOverrideMedium.effectiveCap, 120);

	const withOverride = resolveStarshipFoodCapacity(120, 50, true);
	const sizeChanged = resolveStarshipFoodCapacity(240000, 50, true);
	assert.equal(withOverride.effectiveCap, 50);
	assert.equal(sizeChanged.effectiveCap, 50);
});

test("food capacity: large RAW values stay stable integers", () => {
	const garg = resolveStarshipFoodCapacity(576000000, 0, false);
	assert.equal(garg.rawCap, 576000000);
	assert.equal(garg.effectiveCap, 576000000);
	assert.equal(Number.isSafeInteger(garg.effectiveCap), true);
});

test("food capacity: missing size baseline → 0", () => {
	assert.equal(resolveStarshipFoodCapacity(undefined, 10, false).effectiveCap, 0);
	assert.equal(resolveStarshipFoodCapacity(null, 10, false).effectiveCap, 0);
});

test("clamp warning data: structured, no localization", () => {
	assert.equal(prepareStarshipReplenishClampWarning("refuel", 20, 6)?.clamped, true);
	assert.deepEqual(prepareStarshipReplenishClampWarning("restock", 20, 6), {
		operation: "restock",
		requested: 20,
		applied: 6,
		clamped: true
	});
	assert.equal(prepareStarshipReplenishClampWarning("consume", 2, 2), null);
	assert.equal(prepareStarshipReplenishClampWarning("burn", 1, 3), null);
});

test("safe-integer boundary documented for extreme perUnit products", () => {
	const safe = calculateStarshipReplenishDisplayCost("perUnit", 10, 6);
	assert.equal(safe.safeInteger, true);
	const huge = calculateStarshipReplenishDisplayCost(
		"perUnit",
		Number.MAX_SAFE_INTEGER,
		2
	);
	assert.equal(huge.safeInteger, false);
	assert.equal(huge.displayCost, Number.MAX_SAFE_INTEGER * 2);
});

console.log(`\n${passed} tests passed`);
