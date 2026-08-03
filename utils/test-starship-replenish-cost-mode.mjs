#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-2 Fuel replenish cost-mode config.
 */
import assert from "node:assert/strict";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG
} from "../scripts/starship-replenish-math.mjs";
import {
	STARSHIP_REPLENISH_COST_MODE_WRITABLE_RESOURCES,
	buildStarshipFuelReplenishCostModeContext,
	buildStarshipReplenishCostModeDialogContent,
	buildStarshipReplenishCostModeUpdate,
	coerceStarshipReplenishCostModeDialogResult,
	getStarshipReplenishCostModeDialogForm,
	getStarshipReplenishCostModeFlagPath,
	isStarshipReplenishCostModeWritable,
	readStarshipReplenishCostModeFromForm,
	readStarshipReplenishCostModeRaw,
	resolveActorStarshipReplenishCostMode,
	starshipReplenishCostModeDialogCallback,
	validateStarshipReplenishCostModeSubmission
} from "../scripts/starship-replenish-cost-mode.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockStarship(fuelMode, foodMode, { type="starship", fuelCost=25 } = {}) {
	const fuel = {};
	if ( fuelMode !== undefined ) fuel.replenishCostMode = fuelMode;
	const food = {};
	if ( foodMode !== undefined ) food.replenishCostMode = foodMode;
	return {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: { type },
				starship: { fuel, food }
			}
		},
		system: {
			attributes: {
				fuel: { value: 4, fuelCap: 10, cost: fuelCost }
			}
		},
		updateCalls: [],
		async update(payload) {
			this.updateCalls.push(payload);
			const mode = payload[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG];
			if ( mode !== undefined ) {
				this.flags.sw5e.starship.fuel.replenishCostMode = mode;
			}
			const foodModeWrite = payload[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG];
			if ( foodModeWrite !== undefined ) {
				this.flags.sw5e.starship.food.replenishCostMode = foodModeWrite;
			}
		}
	};
}

function mockForm(modeValue) {
	const input = { value: modeValue, name: "replenishCostMode" };
	return {
		tagName: "FORM",
		elements: {
			namedItem: name => (name === "replenishCostMode" ? input : null)
		},
		querySelector: sel => (sel === "[name='replenishCostMode']" ? input : null)
	};
}

test("missing Fuel flag resolves to perRestock", () => {
	const actor = mockStarship(undefined);
	assert.equal(resolveActorStarshipReplenishCostMode(actor, "fuel"), "perRestock");
	assert.equal(readStarshipReplenishCostModeRaw(actor, "fuel"), undefined);
});

test("invalid Fuel flag resolves to perRestock", () => {
	assert.equal(
		resolveActorStarshipReplenishCostMode(mockStarship("legacyFlat"), "fuel"),
		"perRestock"
	);
});

test("perRestock remains perRestock; perUnit remains perUnit", () => {
	assert.equal(
		resolveActorStarshipReplenishCostMode(mockStarship("perRestock"), "fuel"),
		"perRestock"
	);
	assert.equal(
		resolveActorStarshipReplenishCostMode(mockStarship("perUnit"), "fuel"),
		"perUnit"
	);
});

test("Fuel and Food storage paths remain distinct", () => {
	assert.equal(
		getStarshipReplenishCostModeFlagPath("fuel"),
		STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG
	);
	assert.equal(
		getStarshipReplenishCostModeFlagPath("food"),
		STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG
	);
	assert.notEqual(
		STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
		STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG
	);
});

test("Slice 3B-2 writable set is Fuel only", () => {
	assert.equal(isStarshipReplenishCostModeWritable("fuel"), true);
	assert.equal(isStarshipReplenishCostModeWritable("food"), false);
	assert.deepEqual([...STARSHIP_REPLENISH_COST_MODE_WRITABLE_RESOURCES], ["fuel"]);
});

test("unchanged mode produces no Actor update (including missing → perRestock)", () => {
	assert.equal(
		buildStarshipReplenishCostModeUpdate(mockStarship(undefined), "fuel", "perRestock"),
		null
	);
	assert.equal(
		buildStarshipReplenishCostModeUpdate(mockStarship("perUnit"), "fuel", "perUnit"),
		null
	);
});

test("changed mode produces expected Fuel flag update only", () => {
	const planned = buildStarshipReplenishCostModeUpdate(
		mockStarship(undefined),
		"fuel",
		"perUnit"
	);
	assert.deepEqual(planned, {
		mode: "perUnit",
		update: { [STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG]: "perUnit" }
	});
	assert.equal(
		Object.prototype.hasOwnProperty.call(planned.update, STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG),
		false
	);
});

test("invalid submitted mode does not write; action strings rejected", () => {
	assert.equal(validateStarshipReplenishCostModeSubmission("save"), null);
	assert.equal(validateStarshipReplenishCostModeSubmission("cancel"), null);
	assert.equal(validateStarshipReplenishCostModeSubmission("refuel"), null);
	assert.equal(
		buildStarshipReplenishCostModeUpdate(mockStarship("perRestock"), "fuel", "save"),
		null
	);
	assert.equal(coerceStarshipReplenishCostModeDialogResult("save"), null);
	assert.equal(coerceStarshipReplenishCostModeDialogResult("perUnit"), "perUnit");
});

test("Food resource cannot produce a write payload", () => {
	assert.equal(
		buildStarshipReplenishCostModeUpdate(mockStarship(undefined, undefined), "food", "perUnit"),
		null
	);
});

test("non-Starship Actors do not receive Fuel flag update", () => {
	const vehicle = mockStarship(undefined, undefined, { type: "vehicle" });
	vehicle.flags.sw5e.legacyStarshipActor.type = "vehicle";
	assert.equal(
		buildStarshipReplenishCostModeUpdate(vehicle, "fuel", "perUnit"),
		null
	);
	const character = { type: "character", flags: {}, system: { attributes: { fuel: { cost: 1 } } } };
	assert.equal(
		buildStarshipReplenishCostModeUpdate(character, "fuel", "perUnit"),
		null
	);
});

test("dialog callback reads selected value through button.form", () => {
	const form = mockForm("perUnit");
	const button = { form };
	assert.equal(starshipReplenishCostModeDialogCallback({}, button, {}), "perUnit");
	assert.equal(
		readStarshipReplenishCostModeFromForm(getStarshipReplenishCostModeDialogForm(button, {})),
		"perUnit"
	);
});

test("dialog content has no nested form", () => {
	const content = buildStarshipReplenishCostModeDialogContent("perRestock");
	assert.equal(/<form[\s>]/i.test(content), false);
	assert.match(content, /name="replenishCostMode"/);
	assert.match(content, /value="perRestock"[^>]*selected|selected[^>]*value="perRestock"/);
});

test("context defaults missing Fuel mode without writing", () => {
	const actor = mockStarship(undefined);
	const ctx = buildStarshipFuelReplenishCostModeContext(actor, { costConfigEditable: true });
	assert.equal(ctx.mode, "perRestock");
	assert.equal(ctx.configEditable, true);
	assert.equal(readStarshipReplenishCostModeRaw(actor, "fuel"), undefined);
	assert.equal(actor.updateCalls.length, 0);
});

test("existing numeric fuel.cost remains untouched by mode helpers", () => {
	const actor = mockStarship("perRestock", undefined, { fuelCost: 42 });
	buildStarshipReplenishCostModeUpdate(actor, "fuel", "perUnit");
	assert.equal(actor.system.attributes.fuel.cost, 42);
	const ctx = buildStarshipFuelReplenishCostModeContext(actor, { costConfigEditable: false });
	assert.equal(actor.system.attributes.fuel.cost, 42);
	assert.equal(ctx.mode, "perRestock");
});

test("no Food flag initialized by Fuel context / Fuel update builder", () => {
	const actor = mockStarship(undefined);
	buildStarshipFuelReplenishCostModeContext(actor, { costConfigEditable: true });
	const planned = buildStarshipReplenishCostModeUpdate(actor, "fuel", "perUnit");
	assert.equal(readStarshipReplenishCostModeRaw(actor, "food"), undefined);
	assert.equal(
		Object.keys(planned.update).some(k => k.includes(".food.")),
		false
	);
});

test("no currency-related fields in update payload", () => {
	const planned = buildStarshipReplenishCostModeUpdate(mockStarship(undefined), "fuel", "perUnit");
	const blob = JSON.stringify(planned.update);
	assert.equal(/currency|wallet|treasury|credits|\.gc\b/i.test(blob), false);
});

console.log(`\n${passed} tests passed`);
