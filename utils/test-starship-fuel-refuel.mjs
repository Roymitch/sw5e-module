#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-3 partial Fuel Refuel.
 */
import assert from "node:assert/strict";
import { calculateStarshipReplenishDisplayCost } from "../scripts/starship-replenish-math.mjs";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG
} from "../scripts/starship-replenish-math.mjs";
import {
	buildStarshipFuelRefuelDialogContent,
	buildStarshipFuelValueMirrorUpdate,
	coerceStarshipFuelRefuelDialogResult,
	evaluateStarshipFuelRefuelGate,
	formatStarshipFuelRefuelCostDisplay,
	formatStarshipFuelRefuelOverRequestWarning,
	getStarshipFuelRefuelDialogForm,
	readStarshipFuelRefuelAmountFromForm,
	readStarshipFuelRefuelSnapshot,
	resolveStarshipFuelRefuel,
	starshipFuelRefuelDialogCallback
} from "../scripts/starship-fuel-refuel.mjs";
import { prepareStarshipReplenishClampWarning } from "../scripts/starship-replenish-math.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockForm(value) {
	const input = { value, name: "refueled" };
	return {
		tagName: "FORM",
		elements: { namedItem: name => (name === "refueled" ? input : null) },
		querySelector: sel => (sel === "[name='refueled']" ? input : null)
	};
}

function mockStarship({ value=4, fuelCap=10, cost=100, mode } = {}) {
	const fuelFlags = {};
	if ( mode !== undefined ) fuelFlags.replenishCostMode = mode;
	return {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: { attributes: { fuel: { value, fuelCap, cost } } }
				},
				starship: { fuel: fuelFlags }
			}
		},
		system: { attributes: { fuel: { value, fuelCap, cost } } }
	};
}

test("current 4/cap 10 resolves room 6", () => {
	const gate = evaluateStarshipFuelRefuelGate(4, 10);
	assert.equal(gate.ok, true);
	assert.equal(gate.room, 6);
	assert.equal(gate.reason, "ready");
});

test("dialog default quantity equals room", () => {
	const content = buildStarshipFuelRefuelDialogContent({
		current: 4,
		capacity: 10,
		room: 6,
		defaultQuantity: 6,
		modeLabel: "Per Restock",
		costText: "100"
	});
	assert.match(content, /value="6"/);
	assert.equal(/<form[\s>]/i.test(content), false);
});

test("enter 2 applies 2 → 6; enter 6 fills; enter 20 clamps to 6 → 10", () => {
	assert.deepEqual(resolveStarshipFuelRefuel(4, 10, 2), {
		requested: 2,
		current: 4,
		capacity: 10,
		room: 6,
		applied: 2,
		newValue: 6,
		overRequest: false,
		shouldUpdate: true
	});
	assert.equal(resolveStarshipFuelRefuel(4, 10, 6).newValue, 10);
	const over = resolveStarshipFuelRefuel(4, 10, 20);
	assert.equal(over.applied, 6);
	assert.equal(over.newValue, 10);
	assert.equal(over.overRequest, true);
});

test("over-request warning data requested 20 / applied 6", () => {
	const warn = prepareStarshipReplenishClampWarning("refuel", 20, 6);
	assert.deepEqual(warn, {
		operation: "refuel",
		requested: 20,
		applied: 6,
		clamped: true
	});
	assert.match(formatStarshipFuelRefuelOverRequestWarning(20, 6), /20/);
	assert.match(formatStarshipFuelRefuelOverRequestWarning(20, 6), /6/);
});

test("already full / capacity 0 gates", () => {
	assert.deepEqual(evaluateStarshipFuelRefuelGate(10, 10).reason, "full");
	assert.equal(evaluateStarshipFuelRefuelGate(10, 10).ok, false);
	assert.deepEqual(evaluateStarshipFuelRefuelGate(4, 0).reason, "no-cap");
	assert.equal(evaluateStarshipFuelRefuelGate(4, 0).ok, false);
});

test("current greater than capacity does not reduce current", () => {
	const gate = evaluateStarshipFuelRefuelGate(15, 10);
	assert.equal(gate.reason, "full");
	assert.equal(gate.current, 15);
	assert.equal(gate.room, 0);
	const resolved = resolveStarshipFuelRefuel(15, 10, 5);
	assert.equal(resolved.shouldUpdate, false);
	assert.equal(resolved.newValue, 15);
});

test("invalid / zero / negative / decimal / action-string quantities", () => {
	assert.equal(resolveStarshipFuelRefuel(4, 10, 0).shouldUpdate, false);
	assert.equal(resolveStarshipFuelRefuel(4, 10, -2).shouldUpdate, false);
	assert.equal(resolveStarshipFuelRefuel(4, 10, "refuel").shouldUpdate, false);
	assert.equal(resolveStarshipFuelRefuel(4, 10, "cancel").shouldUpdate, false);
	assert.equal(coerceStarshipFuelRefuelDialogResult("refuel"), null);
	assert.equal(coerceStarshipFuelRefuelDialogResult(0), null);
	assert.equal(coerceStarshipFuelRefuelDialogResult(2.9), 2);
	assert.equal(resolveStarshipFuelRefuel(4, 10, 2.9).applied, 2);
});

test("dialog callback reads button.form; cancel/dismiss coerce to null", () => {
	const form = mockForm("3");
	assert.equal(starshipFuelRefuelDialogCallback({}, { form }, {}), 3);
	assert.equal(readStarshipFuelRefuelAmountFromForm(getStarshipFuelRefuelDialogForm({ form }, {})), 3);
	assert.equal(coerceStarshipFuelRefuelDialogResult(null), null);
	assert.equal(coerceStarshipFuelRefuelDialogResult(undefined), null);
	assert.equal(coerceStarshipFuelRefuelDialogResult("cancel"), null);
});

test("Per Restock partial uses flat cost; Per Unit uses applied qty", () => {
	assert.equal(
		calculateStarshipReplenishDisplayCost("perRestock", 100, 2).displayCost,
		100
	);
	assert.equal(
		calculateStarshipReplenishDisplayCost("perUnit", 100, 2).displayCost,
		200
	);
	const overApplied = resolveStarshipFuelRefuel(4, 10, 20).applied;
	assert.equal(
		calculateStarshipReplenishDisplayCost("perUnit", 100, overApplied).displayCost,
		600
	);
});

test("missing cost mode behaves as Per Restock without writing", () => {
	const actor = mockStarship({ mode: undefined });
	const snap = readStarshipFuelRefuelSnapshot(actor, actor.system.attributes.fuel);
	assert.equal(snap.mode, "perRestock");
	assert.equal(actor.flags.sw5e.starship.fuel.replenishCostMode, undefined);
});

test("unsafe cost product is not presented as trustworthy exact cost", () => {
	const costInfo = calculateStarshipReplenishDisplayCost(
		"perUnit",
		Number.MAX_SAFE_INTEGER,
		2
	);
	assert.equal(costInfo.safeInteger, false);
	const display = formatStarshipFuelRefuelCostDisplay(costInfo);
	assert.equal(display.trustworthy, false);
	assert.match(display.text, /Unavailable|unavailable|too large/i);
});

test("successful Refuel mirror update shape; cap/cost/mode untouched conceptually", () => {
	const mirror = buildStarshipFuelValueMirrorUpdate(6);
	assert.deepEqual(mirror, {
		"system.attributes.fuel.value": 6,
		"flags.sw5e.legacyStarshipActor.system.attributes.fuel.value": 6
	});
	assert.equal(Object.keys(mirror).some(k => k.includes("fuelCap") || k.includes("cost")), false);
	assert.equal(Object.keys(mirror).some(k => k.includes("replenishCostMode")), false);
	assert.equal(Object.keys(mirror).some(k => /currency|wallet|treasury|credits|\.gc\b/i.test(k)), false);
	assert.equal(Object.keys(mirror).some(k => k.includes(".food.")), false);
});

test("no Food path in snapshot / mirror; non-Starship returns null snapshot", () => {
	const actor = mockStarship();
	const snap = readStarshipFuelRefuelSnapshot(actor, actor.system.attributes.fuel);
	assert.ok(snap);
	assert.equal(
		JSON.stringify(snap).includes("food"),
		false
	);
	const character = { type: "character", flags: {} };
	assert.equal(readStarshipFuelRefuelSnapshot(character, { value: 1, fuelCap: 5, cost: 1 }), null);
	assert.notEqual(STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG, STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG);
});

console.log(`\n${passed} tests passed`);
