#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-5 Ship’s Stores shared Consume / Restock.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStarshipSuppliesRequestedQuantity } from "../scripts/starship-supplies-quantity.mjs";
import {
	buildStarshipSuppliesConsumeChatContext,
	buildStarshipSuppliesConsumeDialogContent,
	buildStarshipSuppliesValueUpdate,
	resolveStarshipSuppliesConsume,
	STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD,
	STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD
} from "../scripts/starship-supplies-consume.mjs";
import {
	buildStarshipSuppliesRestockChatContext,
	buildStarshipSuppliesRestockDialogContent,
	resolveStarshipSuppliesRestock,
	STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD,
	STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD
} from "../scripts/starship-supplies-restock.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const layerHbs = readFileSync(join(__dirname, "..", "templates", "starship-sheet-layer.hbs"), "utf8");
const enJson = readFileSync(join(__dirname, "..", "languages", "en.json"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

test("quantity parse: empty → 0; 0 stays 0; positive ok; invalid fails", () => {
	assert.deepEqual(parseStarshipSuppliesRequestedQuantity(""), { ok: true, value: 0 });
	assert.deepEqual(parseStarshipSuppliesRequestedQuantity("0"), { ok: true, value: 0 });
	assert.deepEqual(parseStarshipSuppliesRequestedQuantity(0), { ok: true, value: 0 });
	assert.deepEqual(parseStarshipSuppliesRequestedQuantity("3"), { ok: true, value: 3 });
	assert.equal(parseStarshipSuppliesRequestedQuantity("-1").ok, false);
	assert.equal(parseStarshipSuppliesRequestedQuantity("consume").ok, false);
	assert.equal(parseStarshipSuppliesRequestedQuantity("save").ok, false);
});

test("Consume dialog defaults both fields to 0", () => {
	const content = buildStarshipSuppliesConsumeDialogContent({ fuelCurrent: 6, foodCurrent: 120 });
	assert.match(content, new RegExp(`name="${STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD}"[^>]*value="0"`));
	assert.match(content, new RegExp(`name="${STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD}"[^>]*value="0"`));
	const depleted = buildStarshipSuppliesConsumeDialogContent({ fuelCurrent: 0, foodCurrent: 0 });
	assert.match(depleted, /value="0"/);
	assert.match(depleted, /disabled/);
});

test("Consume resolve: both-zero no-op; fuel-only; food-only; both; clamps", () => {
	const zero = resolveStarshipSuppliesConsume(6, 120, 0, 0);
	assert.equal(zero.shouldUpdate, false);
	assert.equal(zero.fuel.applied, 0);
	assert.equal(zero.food.applied, 0);

	const fuelOnly = resolveStarshipSuppliesConsume(6, 120, 1, 0);
	assert.equal(fuelOnly.shouldUpdate, true);
	assert.equal(fuelOnly.fuel.applied, 1);
	assert.equal(fuelOnly.fuel.newValue, 5);
	assert.equal(fuelOnly.food.applied, 0);

	const foodOnly = resolveStarshipSuppliesConsume(6, 120, 0, 3);
	assert.equal(foodOnly.food.applied, 3);
	assert.equal(foodOnly.fuel.applied, 0);

	const both = resolveStarshipSuppliesConsume(2, 10, 5, 3);
	assert.equal(both.fuel.applied, 2);
	assert.equal(both.food.applied, 3);
	assert.equal(both.fuel.overRequest, true);
	assert.equal(both.food.overRequest, false);

	const fuelClampOnly = resolveStarshipSuppliesConsume(2, 10, 9, 1);
	assert.equal(fuelClampOnly.fuel.applied, 2);
	assert.equal(fuelClampOnly.fuel.overRequest, true);
	assert.equal(fuelClampOnly.food.applied, 1);
});

test("Consume update payload includes only changed resources", () => {
	const fuelOnly = buildStarshipSuppliesValueUpdate({
		fuelApplied: 1, fuelNew: 5, foodApplied: 0, foodNew: 120
	});
	assert.equal(fuelOnly["system.attributes.fuel.value"], 5);
	assert.equal(fuelOnly["flags.sw5e.legacyStarshipActor.system.attributes.fuel.value"], 5);
	assert.equal(fuelOnly["system.attributes.food.value"], undefined);

	const foodOnly = buildStarshipSuppliesValueUpdate({
		fuelApplied: 0, fuelNew: 6, foodApplied: 2, foodNew: 118
	});
	assert.equal(foodOnly["system.attributes.food.value"], 118);
	assert.equal(foodOnly["system.attributes.fuel.value"], undefined);

	const both = buildStarshipSuppliesValueUpdate({
		fuelApplied: 1, fuelNew: 5, foodApplied: 2, foodNew: 118
	});
	assert.equal(both["system.attributes.fuel.value"], 5);
	assert.equal(both["system.attributes.food.value"], 118);

	assert.equal(buildStarshipSuppliesValueUpdate({
		fuelApplied: 0, fuelNew: 6, foodApplied: 0, foodNew: 120
	}), null);
});

test("Consume chat omits zero-applied lines; uses Ship’s Stores", () => {
	const fuelOnly = buildStarshipSuppliesConsumeChatContext({
		actorName: "Falcon",
		fuelApplied: 1,
		foodApplied: 0,
		fuelBefore: 6,
		fuelAfter: 5,
		fuelCap: 10,
		foodBefore: 120,
		foodAfter: 120,
		foodEffectiveCap: 160
	});
	assert.match(fuelOnly.heading, /Ship/);
	assert.equal(fuelOnly.showFuel, true);
	assert.equal(fuelOnly.showFood, false);
	assert.equal(buildStarshipSuppliesConsumeChatContext({
		fuelApplied: 0, foodApplied: 0
	}), null);
});

test("Restock dialog defaults to room; full resource disabled at 0", () => {
	const content = buildStarshipSuppliesRestockDialogContent({
		fuelCurrent: 4,
		fuelCap: 10,
		fuelRoom: 6,
		foodCurrent: 100,
		foodCap: 120,
		foodRoom: 20,
		fuelModeLabel: "Per Unit",
		foodModeLabel: "Per Restock",
		fuelCostText: "900",
		foodCostText: "500",
		totalCostText: "1400"
	});
	assert.match(content, new RegExp(`name="${STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD}"[^>]*value="6"`));
	assert.match(content, new RegExp(`name="${STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD}"[^>]*value="20"`));

	const full = buildStarshipSuppliesRestockDialogContent({
		fuelCurrent: 10,
		fuelCap: 10,
		fuelRoom: 0,
		foodCurrent: 120,
		foodCap: 120,
		foodRoom: 0,
		fuelModeLabel: "Per Restock",
		foodModeLabel: "Per Restock",
		fuelCostText: "—",
		foodCostText: "—",
		totalCostText: "0"
	});
	assert.match(full, /value="0"/);
	assert.match(full, /disabled/);
});

test("Restock resolve: mixed modes, zero intent, clamps, combined total", () => {
	const snap = {
		fuelCurrent: 4,
		fuelCap: 10,
		fuelRoom: 6,
		foodCurrent: 100,
		foodCap: 120,
		foodRoom: 20,
		fuelMode: "perUnit",
		foodMode: "perRestock",
		fuelConfiguredCost: 150,
		foodConfiguredCost: 500
	};
	const both = resolveStarshipSuppliesRestock(snap, 2, 30);
	assert.equal(both.fuel.applied, 2);
	assert.equal(both.food.applied, 20);
	assert.equal(both.food.overRequest, true);
	assert.equal(both.fuel.costDisplay.displayCost, 300);
	assert.equal(both.food.costDisplay.displayCost, 500);
	assert.equal(both.combinedTotal, 800);
	assert.equal(both.combinedSafe, true);

	const zeroFuel = resolveStarshipSuppliesRestock(snap, 0, 5);
	assert.equal(zeroFuel.fuel.applied, 0);
	assert.equal(zeroFuel.fuel.costDisplay.displayCost, 0);
	assert.equal(zeroFuel.food.applied, 5);
	assert.equal(zeroFuel.shouldUpdate, true);

	const noop = resolveStarshipSuppliesRestock(snap, 0, 0);
	assert.equal(noop.shouldUpdate, false);
});

test("Restock chat omits zero blocks; Ship’s Stores terminology", () => {
	const ctx = buildStarshipSuppliesRestockChatContext({
		actorName: "Falcon",
		fuelApplied: 2,
		foodApplied: 0,
		fuelBefore: 4,
		fuelAfter: 6,
		fuelCap: 10,
		foodBefore: 100,
		foodAfter: 100,
		foodCap: 120,
		fuelMode: "perUnit",
		foodMode: "perRestock",
		fuelConfiguredCost: 150,
		foodConfiguredCost: 500,
		fuelCostText: "300",
		foodCostText: "0",
		fuelCostTrustworthy: true,
		foodCostTrustworthy: true,
		combinedTotal: 300,
		combinedSafe: true
	});
	assert.match(ctx.heading, /Ship/);
	assert.equal(ctx.showFuel, true);
	assert.equal(ctx.showFood, false);
	assert.equal(ctx.showTotal, true);
});

test("panel template: Ship’s Stores; shared actions; no Burn/Refuel; collapse key fuel", () => {
	assert.match(layerHbs, /shipsStores|Ship/);
	assert.match(layerHbs, /data-sw5e-core-panel="fuel"/);
	assert.match(layerHbs, /data-sw5e-supplies-action="consume"/);
	assert.match(layerHbs, /data-sw5e-supplies-action="restock"/);
	assert.equal(/data-sw5e-fuel-action="burn"/.test(layerHbs), false);
	assert.equal(/data-sw5e-fuel-action="refuel"/.test(layerHbs), false);
	assert.equal(/Fuel &amp; Supplies|Fuel & Supplies/.test(layerHbs), false);
	assert.match(enJson, /"SW5E\.StarshipSheet\.ShipsStores": "Ship/);
	assert.match(enJson, /"SW5E\.StarshipSheet\.FuelAndSupplies": "Ship/);
});

console.log(`\n${passed} tests passed`);
