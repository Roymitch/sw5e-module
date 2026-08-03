#!/usr/bin/env node
/**
 * Offline tests: Theme-removal Gate C functional Starship presentation restoration.
 * AC shield markup/CSS, Power Die meters, Ship’s Stores bars/cog/dialog, cost modes, no theme gates.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
	STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK,
	STARSHIP_REPLENISH_COST_MODE_PER_UNIT
} from "../scripts/starship-replenish-math.mjs";
import { readStarshipReplenishCostModeRaw } from "../scripts/starship-replenish-cost-mode.mjs";
import {
	buildStarshipShipsStoresConfigSaveUpdate,
	buildStarshipShipsStoresConfigUpdate,
	buildStarshipShipsStoresCostModeOptions,
	parseStarshipShipsStoresConfigNumber,
	readStarshipShipsStoresConfigValues,
	SHIPS_STORES_COST_MODE_OPTION_VALUES,
	SHIPS_STORES_FIELD_PATHS,
	SHIPS_STORES_FOOD_COST_MODE_PATH,
	SHIPS_STORES_FUEL_COST_MODE_PATH
} from "../scripts/starship-ships-stores-config.mjs";
import { getStarshipAdvancedPowerContext } from "../scripts/starship-data.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAYER = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const VITALS_LESS = fs.readFileSync(path.join(ROOT, "styles/less/starship-sidebar-vitals.less"), "utf8");
const RESOURCES_LESS = fs.readFileSync(path.join(ROOT, "styles/less/starship-core-resources.less"), "utf8");
const MODULE_LESS = fs.readFileSync(path.join(ROOT, "styles/less/module.less"), "utf8");
const NEUTRALIZE = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-neutralize.mjs"), "utf8");
const DELEGATES = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-delegates.mjs"), "utf8");
const EN = fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8");
const CONFIG_HBS = fs.readFileSync(path.join(ROOT, "templates/apps/starship-ships-stores-config.hbs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function inline(name) {
	const m = LAYER.match(new RegExp(`\\{\\{#\\*inline "${name}"\\}\\}[\\s\\S]*?\\{\\{\\/inline\\}\\}`));
	assert.ok(m, `expected inline ${name}`);
	return m[0];
}

function stubI18n() {
	globalThis.game = {
		i18n: {
			localize: key => {
				const map = {
					"SW5E.StarshipSheet.ReplenishCostModePerUnit": "Per Unit",
					"SW5E.StarshipSheet.ReplenishCostModePerRestock": "Per Restock"
				};
				return map[key] ?? key;
			},
			format: key => key
		}
	};
}

function mockActor({ fuelMode, foodMode, ...overrides } = {}) {
	const fuel = {};
	const food = {};
	if ( fuelMode !== undefined ) fuel.replenishCostMode = fuelMode;
	if ( foodMode !== undefined ) food.replenishCostMode = foodMode;
	return {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: {
							fuel: { value: 6, fuelCap: 6, cost: 150 },
							food: { value: 30, foodCap: 30, cost: 100 },
							power: {
								die: "d8",
								central: { value: 4, max: 4 },
								comms: { value: 2, max: 2 },
								engines: { value: 1, max: 2 },
								sensors: { value: 0, max: 2 },
								shields: { value: 2, max: 2 },
								weapons: { value: 2, max: 2 }
							}
						}
					}
				},
				starship: { ui: {}, fuel, food }
			}
		},
		system: {
			attributes: {
				fuel: { value: 6, fuelCap: 6, cost: 150 },
				food: { value: 30, foodCap: 30, cost: 100 },
				power: {
					die: "d8",
					central: { value: 4, max: 4 },
					comms: { value: 2, max: 2 },
					engines: { value: 1, max: 2 },
					sensors: { value: 0, max: 2 },
					shields: { value: 2, max: 2 },
					weapons: { value: 2, max: 2 }
				}
			}
		},
		...overrides
	};
}

function sampleNumericValues(overrides = {}) {
	return {
		"system.attributes.fuel.value": 6,
		"system.attributes.fuel.fuelCap": 6,
		"system.attributes.fuel.cost": 150,
		"system.attributes.food.value": 30,
		"system.attributes.food.foodCap": 30,
		"system.attributes.food.cost": 100,
		...overrides
	};
}

test("AC badge uses stock ac-badge classes; CSS keeps shield image", () => {
	assert.match(NEUTRALIZE, /className = "ac-badge badge sw5e-starship-ac-badge"/);
	assert.match(VITALS_LESS, /\.portrait \.sw5e-starship-ac-badge/);
	assert.doesNotMatch(VITALS_LESS, /background:\s*none\s*!important/);
	assert.match(VITALS_LESS, /ac-badge\.webp|Keep stock \.ac-badge background/);
	assert.doesNotMatch(VITALS_LESS, /data-sw5e-theme|sw5e-theme-root|sw5e-light|sw5e-dark|sw5e-underworld/);
});

test("Power Die PLAY rows include meter fill + ROLL command binding", () => {
	const power = inline("sw5e-starship-core-advanced-power");
	assert.match(power, /sw5e-starship-advanced-power-slot-track/);
	assert.match(power, /sw5e-starship-advanced-power-slot-fill/);
	assert.match(power, /style="width: \{\{pct\}\}%;"/);
	assert.match(power, /data-sw5e-advanced-power-action="spend"/);
	assert.match(power, /data-power-slot="\{\{key\}\}"/);
	assert.match(power, /data-sw5e-advanced-power-action="recover"/);
	assert.match(RESOURCES_LESS, /justify-content:\s*flex-end/);
	assert.match(RESOURCES_LESS, /sw5e-starship-advanced-power-slot-fill/);
});

test("Power Die context exposes pct for every slot", () => {
	globalThis.CONFIG = globalThis.CONFIG ?? {};
	globalThis.CONFIG.SW5E = globalThis.CONFIG.SW5E ?? {};
	globalThis.CONFIG.SW5E.powerDieSlots = globalThis.CONFIG.SW5E.powerDieSlots ?? {
		central: "Central",
		comms: "Comms",
		engines: "Engines",
		sensors: "Sensors",
		shields: "Shields",
		weapons: "Weapons"
	};
	stubI18n();
	const ctx = getStarshipAdvancedPowerContext(mockActor());
	assert.ok(Array.isArray(ctx.slots));
	assert.ok(ctx.slots.length >= 6);
	for ( const slot of ctx.slots ) {
		assert.equal(typeof slot.pct, "number");
		assert.ok(slot.pct >= 0 && slot.pct <= 100);
		assert.equal(slot.displayValue, slot.value);
	}
	const sensors = ctx.slots.find(s => s.key === "sensors");
	assert.equal(sensors.pct, 0);
	const central = ctx.slots.find(s => s.key === "central");
	assert.equal(central.pct, 100);
});

test("Ship’s Stores PLAY bars + right-aligned actions; no inline grids", () => {
	const fuel = inline("sw5e-starship-core-fuel");
	assert.match(fuel, /sw5e-starship-fuel-track/);
	assert.match(fuel, /sw5e-starship-fuel-fill/);
	assert.match(fuel, /sw5e-starship-food-fill/);
	assert.match(fuel, /width: \{\{systemsCore\.fuelPct\}\}%/);
	assert.match(fuel, /width: \{\{systemsCore\.food\.pct\}\}%/);
	assert.match(fuel, /data-sw5e-supplies-action="consume"/);
	assert.match(fuel, /data-sw5e-supplies-action="restock"/);
	assert.doesNotMatch(fuel, /sw5e-starship-core-fuel-grid/);
	assert.doesNotMatch(fuel, /id="sw5e-core-fuel-value"/);
	assert.doesNotMatch(fuel, /id="sw5e-core-food-value"/);
	assert.match(RESOURCES_LESS, /\.sw5e-starship-core-fuel-actions[\s\S]*justify-content:\s*flex-end/);
});

test("EDIT: one ships-stores cog beside chevron; PLAY has no cog without systemsSetupEditable", () => {
	const fuel = inline("sw5e-starship-core-fuel");
	assert.match(fuel, /\{\{#if @root\.systemsSetupEditable\}\}/);
	assert.match(fuel, /data-sw5e-ships-stores-config/);
	assert.match(fuel, /sw5e-starship-ships-stores-config/);
	assert.match(fuel, /fa-cog/);
	assert.match(fuel, /fa-chevron-down/);
	assert.equal((fuel.match(/data-sw5e-ships-stores-config/g) || []).length, 1);
	assert.doesNotMatch(fuel, /data-sw5e-food-cap-source/);
	assert.doesNotMatch(fuel, /data-sw5e-replenish-cost-mode/);
	assert.match(DELEGATES, /ensureStarshipShipsStoresConfigDelegate/);
	assert.match(DELEGATES, /openStarshipShipsStoresConfig/);
});

test("Ship’s Stores dialog renders eight controls including Fuel/Food cost-mode dropdowns", () => {
	for ( const path of SHIPS_STORES_FIELD_PATHS ) {
		assert.match(CONFIG_HBS, new RegExp(`name="${path.replace(/\./g, "\\.")}"`));
	}
	assert.match(CONFIG_HBS, /id="sw5e-ships-stores-fuel-cost-mode"/);
	assert.match(CONFIG_HBS, /id="sw5e-ships-stores-food-cost-mode"/);
	assert.match(CONFIG_HBS, /name="\{\{fuelCostModePath\}\}"/);
	assert.match(CONFIG_HBS, /name="\{\{foodCostModePath\}\}"/);
	assert.match(CONFIG_HBS, /\{\{#each fuel\.costModeOptions\}\}/);
	assert.match(CONFIG_HBS, /\{\{#each food\.costModeOptions\}\}/);
	assert.equal(SHIPS_STORES_FUEL_COST_MODE_PATH, STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG);
	assert.equal(SHIPS_STORES_FOOD_COST_MODE_PATH, STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG);
	assert.deepEqual(
		[...SHIPS_STORES_COST_MODE_OPTION_VALUES],
		[STARSHIP_REPLENISH_COST_MODE_PER_UNIT, STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK]
	);
	assert.doesNotMatch(CONFIG_HBS, /foodCapMod|foodCapSource|permanent helper|explanatory/);
	assert.match(EN, /"SW5E\.StarshipSheet\.FuelRegenerationCostMode": "Regeneration Cost Mode"/);
	assert.match(EN, /"SW5E\.StarshipSheet\.FoodRestockCostMode": "Restock Cost Mode"/);
	assert.match(EN, /"SW5E\.StarshipSheet\.ReplenishCostModePerUnit": "Per Unit"/);
	assert.match(EN, /"SW5E\.StarshipSheet\.ReplenishCostModePerRestock": "Per Restock"/);
});

test("Cost-mode options are exactly Per Unit then Per Restock with localized labels", () => {
	stubI18n();
	const options = buildStarshipShipsStoresCostModeOptions("perUnit");
	assert.equal(options.length, 2);
	assert.deepEqual(options.map(o => o.value), ["perUnit", "perRestock"]);
	assert.deepEqual(options.map(o => o.label), ["Per Unit", "Per Restock"]);
	assert.equal(options[0].selected, true);
	assert.equal(options[1].selected, false);
});

test("Existing Fuel/Food modes preselect; missing uses perRestock display fallback without write", () => {
	stubI18n();
	const withModes = readStarshipShipsStoresConfigValues(mockActor({
		fuelMode: "perUnit",
		foodMode: "perRestock"
	}));
	assert.equal(withModes.fuel.replenishCostMode, "perUnit");
	assert.equal(withModes.food.replenishCostMode, "perRestock");
	assert.equal(withModes.fuel.costModeOptions.find(o => o.selected).value, "perUnit");
	assert.equal(withModes.food.costModeOptions.find(o => o.selected).value, "perRestock");

	const actor = mockActor();
	const missing = readStarshipShipsStoresConfigValues(actor);
	assert.equal(missing.fuel.replenishCostMode, "perRestock");
	assert.equal(missing.food.replenishCostMode, "perRestock");
	assert.equal(readStarshipReplenishCostModeRaw(actor, "fuel"), undefined);
	assert.equal(readStarshipReplenishCostModeRaw(actor, "food"), undefined);
	assert.equal(actor.flags.sw5e.starship.fuel.replenishCostMode, undefined);
	assert.equal(actor.flags.sw5e.starship.food.replenishCostMode, undefined);
});

test("Ships Stores number parse: zero ok; negative/invalid rejected", () => {
	assert.deepEqual(parseStarshipShipsStoresConfigNumber("0"), { ok: true, value: 0 });
	assert.deepEqual(parseStarshipShipsStoresConfigNumber("12"), { ok: true, value: 12 });
	assert.equal(parseStarshipShipsStoresConfigNumber("").ok, false);
	assert.equal(parseStarshipShipsStoresConfigNumber("-1").ok, false);
	assert.equal(parseStarshipShipsStoresConfigNumber("1.5").ok, false);
	assert.equal(parseStarshipShipsStoresConfigNumber("abc").ok, false);
});

test("Numeric dual-write payload unchanged; modes merge on save path", () => {
	stubI18n();
	const values = Object.fromEntries(SHIPS_STORES_FIELD_PATHS.map((p, i) => [p, i === 0 ? 0 : i]));
	const numeric = buildStarshipShipsStoresConfigUpdate(values);
	assert.equal(numeric["system.attributes.fuel.value"], 0);
	assert.equal(numeric["flags.sw5e.legacyStarshipActor.system.attributes.fuel.value"], 0);
	assert.equal(numeric["system.attributes.food.foodCap"], 4);
	assert.equal(numeric[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG], undefined);

	const actor = mockActor();
	const perUnitFuel = buildStarshipShipsStoresConfigSaveUpdate(
		actor, sampleNumericValues(), "perUnit", "perRestock"
	);
	assert.equal(perUnitFuel.ok, true);
	assert.equal(perUnitFuel.update[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG], "perUnit");
	assert.equal(perUnitFuel.update[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG], undefined);
	assert.equal(perUnitFuel.update["system.attributes.fuel.cost"], 150);

	const bothUnit = buildStarshipShipsStoresConfigSaveUpdate(
		actor, sampleNumericValues({ "system.attributes.fuel.value": 0 }), "perUnit", "perUnit"
	);
	assert.equal(bothUnit.update[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG], "perUnit");
	assert.equal(bothUnit.update[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG], "perUnit");
	assert.equal(bothUnit.update["system.attributes.fuel.value"], 0);

	const storedUnit = mockActor({ fuelMode: "perUnit", foodMode: "perUnit" });
	const restockFuel = buildStarshipShipsStoresConfigSaveUpdate(
		storedUnit, sampleNumericValues(), "perRestock", "perUnit"
	);
	assert.equal(restockFuel.update[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG], "perRestock");
	assert.equal(restockFuel.update[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG], undefined);

	const restockFood = buildStarshipShipsStoresConfigSaveUpdate(
		mockActor({ fuelMode: "perUnit", foodMode: "perUnit" }),
		sampleNumericValues(),
		"perUnit",
		"perRestock"
	);
	assert.equal(restockFood.update[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG], "perRestock");
});

test("Invalid modes cannot persist; missing→perRestock selection does not dirty mode flags", () => {
	stubI18n();
	const actor = mockActor();
	assert.equal(
		buildStarshipShipsStoresConfigSaveUpdate(actor, sampleNumericValues(), "legacyFlat", "perUnit").ok,
		false
	);
	assert.equal(
		buildStarshipShipsStoresConfigSaveUpdate(actor, sampleNumericValues(), "perUnit", "").ok,
		false
	);
	const keepFallback = buildStarshipShipsStoresConfigSaveUpdate(
		actor, sampleNumericValues(), "perRestock", "perRestock"
	);
	assert.equal(keepFallback.ok, true);
	assert.equal(keepFallback.update[STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG], undefined);
	assert.equal(keepFallback.update[STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG], undefined);
	assert.equal(keepFallback.update["system.attributes.fuel.value"], 6);
	assert.equal(keepFallback.update["system.attributes.hp.value"], undefined);
});

test("Ships Stores preload reads Actor Fuel/Food paths", () => {
	stubI18n();
	const values = readStarshipShipsStoresConfigValues(mockActor());
	assert.equal(values.fuel.value, 6);
	assert.equal(values.fuel.fuelCap, 6);
	assert.equal(values.fuel.cost, 150);
	assert.equal(values.food.value, 30);
	assert.equal(values.food.foodCap, 30);
	assert.equal(values.food.cost, 100);
});

test("Neutral resources LESS imported; no theme gates restored", () => {
	assert.match(MODULE_LESS, /@import "starship-core-resources\.less"/);
	assert.doesNotMatch(RESOURCES_LESS, /data-sw5e-theme|sw5e-theme-root|themeMode|sw5e-light|sw5e-dark|sw5e-underworld/);
	assert.equal(fs.existsSync(path.join(ROOT, "scripts/theme.mjs")), false);
	assert.doesNotMatch(EN, /"SW5E\.Settings\.ThemeMode"|ThemeMode/);
	const themeRefs = [
		RESOURCES_LESS,
		VITALS_LESS,
		LAYER,
		DELEGATES,
		CONFIG_HBS
	].join("\n");
	assert.doesNotMatch(themeRefs, /data-sw5e-theme|sw5e-theme-root/);
});

console.log(`\n${passed} passed`);
