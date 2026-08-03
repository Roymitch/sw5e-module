#!/usr/bin/env node
/**
 * Offline tests: Phase 3B / Bug 12 Slice 3B-4 Food storage, capacity source, mirror.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	shouldMirrorStarshipLegacyAttributePath,
	buildStarshipLegacyAttributeMirrorUpdate
} from "../scripts/starship-data.mjs";
import {
	STARSHIP_FOOD_CAP_OVERRIDE_FLAG,
	STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD,
	STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD,
	STARSHIP_FOOD_LEGACY_MIRROR_PATHS,
	STARSHIP_FOOD_SYSTEM_ONLY_PATHS,
	applyStarshipFoodCapSource,
	applyStarshipFoodCapacityConfig,
	buildStarshipFoodBarContext,
	buildStarshipFoodCapSourceDialogContent,
	formatStarshipFoodCapacityTooltip,
	readStarshipFoodCapOverride,
	readStarshipFoodResourceSnapshot,
	starshipFoodCapSourceDialogCallback,
	validateStarshipFoodCapSourceSubmission
} from "../scripts/starship-food.mjs";
import { addStarshipFoodSchemaField } from "../scripts/patch/starship-food-schema.mjs";
import { resolveStarshipFoodCapacity } from "../scripts/starship-replenish-math.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const layerHbs = readFileSync(join(__dirname, "..", "templates", "starship-sheet-layer.hbs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

async function testAsync(name, fn) {
	await fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockStarship({
	food={},
	capOverride,
	sizeFoodCap=120,
	type="vehicle"
}={}) {
	globalThis.game = { user: { id: "u1", isGM: true } };
	return {
		type,
		name: "Test Ship",
		flags: {
			sw5e: {
				legacyStarshipActor: { type: "starship" },
				starship: {
					food: {
						...(capOverride !== undefined ? { capOverride } : {})
					}
				}
			}
		},
		system: {
			attributes: {
				food: {
					value: food.value ?? 0,
					foodCap: food.foodCap ?? 0,
					foodCapMod: food.foodCapMod ?? 0,
					cost: food.cost ?? 0
				},
				fuel: { value: 1, fuelCap: 6, cost: 150 }
			}
		},
		_source: {
			system: {
				attributes: {
					food: {
						value: food.value ?? 0,
						foodCap: food.foodCap ?? 0,
						foodCapMod: food.sourceMod ?? food.foodCapMod ?? 0,
						cost: food.cost ?? 0
					}
				}
			}
		},
		items: {
			contents: [
				{
					type: "feat",
					flags: { sw5e: { legacyStarshipSize: { foodCap: sizeFoodCap } } }
				}
			]
		},
		updates: [],
		canUserModify() { return true; },
		async update(payload) {
			this.updates.push(payload);
			if ( payload[STARSHIP_FOOD_CAP_OVERRIDE_FLAG] !== undefined ) {
				this.flags.sw5e.starship.food.capOverride = payload[STARSHIP_FOOD_CAP_OVERRIDE_FLAG];
			}
			if ( payload["system.attributes.food.foodCap"] !== undefined ) {
				this.system.attributes.food.foodCap = payload["system.attributes.food.foodCap"];
				this._source.system.attributes.food.foodCap = payload["system.attributes.food.foodCap"];
			}
			if ( payload["system.attributes.food.foodCapMod"] !== undefined ) {
				this.system.attributes.food.foodCapMod = payload["system.attributes.food.foodCapMod"];
				this._source.system.attributes.food.foodCapMod = payload["system.attributes.food.foodCapMod"];
			}
		}
	};
}

test("mirror whitelist: value/foodCap/cost yes; foodCapMod no", () => {
	assert.equal(shouldMirrorStarshipLegacyAttributePath("system.attributes.food.value"), true);
	assert.equal(shouldMirrorStarshipLegacyAttributePath("system.attributes.food.foodCap"), true);
	assert.equal(shouldMirrorStarshipLegacyAttributePath("system.attributes.food.cost"), true);
	assert.equal(shouldMirrorStarshipLegacyAttributePath("system.attributes.food.foodCapMod"), false);
	assert.deepEqual([...STARSHIP_FOOD_LEGACY_MIRROR_PATHS], [
		"system.attributes.food.value",
		"system.attributes.food.foodCap",
		"system.attributes.food.cost"
	]);
	assert.deepEqual([...STARSHIP_FOOD_SYSTEM_ONLY_PATHS], [
		"system.attributes.food.foodCapMod"
	]);
});

test("mirror payload dual-writes approved Food paths only", () => {
	const value = buildStarshipLegacyAttributeMirrorUpdate("system.attributes.food.value", 4);
	assert.equal(value["system.attributes.food.value"], 4);
	assert.equal(value["flags.sw5e.legacyStarshipActor.system.attributes.food.value"], 4);
	const mod = buildStarshipLegacyAttributeMirrorUpdate("system.attributes.fuel.value", 1);
	assert.ok(mod["system.attributes.fuel.value"]);
	assert.equal(
		Object.keys(buildStarshipLegacyAttributeMirrorUpdate("system.attributes.food.foodCapMod", -5))
			.includes("flags.sw5e.legacyStarshipActor.system.attributes.food.foodCapMod"),
		false
	);
});

test("direct Food attribute paths are documented for sheet persistence", () => {
	assert.equal(STARSHIP_FOOD_LEGACY_MIRROR_PATHS.includes("system.attributes.food.value"), true);
	assert.equal(STARSHIP_FOOD_SYSTEM_ONLY_PATHS.includes("system.attributes.food.foodCapMod"), true);
});

test("Food bar: 0/0 safe; fill caps at 100%; over-cap current displayed in label", () => {
	const empty = buildStarshipFoodBarContext(0, 0);
	assert.equal(empty.foodPct, 0);
	assert.equal(empty.foodBarLabel, "0 / 0 portions");
	assert.equal(empty.foodHasCap, false);
	assert.equal(empty.foodValueFormatted, "0");
	assert.equal(empty.foodCapacityFormatted, "0");
	assert.equal(buildStarshipFoodBarContext(50, 100).foodPct, 50);
	assert.equal(buildStarshipFoodBarContext(200, 100).foodPct, 100);
	assert.match(buildStarshipFoodBarContext(200, 100).foodBarLabel, /200 \/ 100/);
});

test("missing capOverride reads Size mode without write", () => {
	const actor = mockStarship();
	assert.equal(readStarshipFoodCapOverride(actor), false);
	const snap = readStarshipFoodResourceSnapshot(actor);
	assert.equal(snap.overrideActive, false);
	assert.equal(snap.capacity.selectedBase, 120);
	assert.equal(snap.capacity.effectiveCapacity, 120);
});

test("source vs prepared modifier: EDIT uses source; effective uses prepared", () => {
	const actor = mockStarship({
		food: { foodCapMod: 10, sourceMod: 5 },
		sizeFoodCap: 120
	});
	actor.system.attributes.food.foodCapMod = 10; // prepared after AE
	actor._source.system.attributes.food.foodCapMod = 5; // source
	const snap = readStarshipFoodResourceSnapshot(actor);
	assert.equal(snap.sourceModifier, 5);
	assert.equal(snap.preparedModifier, 10);
	assert.equal(snap.capacity.effectiveCapacity, 130);
});

test("capacity source validation rejects action strings", () => {
	assert.equal(validateStarshipFoodCapSourceSubmission("save"), null);
	assert.equal(validateStarshipFoodCapSourceSubmission("size"), "size");
	assert.equal(validateStarshipFoodCapSourceSubmission("custom"), "custom");
});

test("capacity source dialog has no nested form", () => {
	const content = buildStarshipFoodCapSourceDialogContent({ overrideActive: false });
	assert.equal(/<form[\s>]/i.test(content), false);
	assert.match(content, /name="foodCapSource"/);
});

test("capacity dialog includes Size/Custom, custom base, and source modifier", () => {
	const content = buildStarshipFoodCapSourceDialogContent({
		overrideActive: true,
		customBase: 200,
		sourceModifier: 5,
		selectedBase: 200,
		effectiveCapacity: 210,
		safeInteger: true
	});
	assert.match(content, /name="foodCapSource"/);
	assert.match(content, new RegExp(`name="${STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD}"`));
	assert.match(content, new RegExp(`name="${STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD}"`));
	assert.match(content, /value="5"/);
	assert.match(content, /value="200"/);
	assert.match(content, /Base 200/);
	assert.match(content, /Source mod 5/);
	assert.match(content, /Effective 210/);
	assert.equal(/prepared|Active Effect/i.test(content), false);
});

test("capacity dialog Size mode marks custom base inactive", () => {
	const content = buildStarshipFoodCapSourceDialogContent({
		overrideActive: false,
		customBase: 200,
		sourceModifier: -3,
		selectedBase: 120,
		effectiveCapacity: 117,
		safeInteger: true
	});
	assert.match(content, /sw5e-food-cap-custom-group"\s*hidden/);
	assert.match(content, /name="foodCapCustomBase"[^>]*disabled|disabled[^>]*name="foodCapCustomBase"/);
	assert.match(content, /value="-3"/);
});

test("capacity dialog callback reads source modifier, not prepared AE value", () => {
	const form = {
		elements: {
			foodCapSource: { value: "custom" },
			[STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD]: { value: "200" },
			[STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD]: { value: "5" }
		}
	};
	const result = starshipFoodCapSourceDialogCallback(null, { form });
	assert.deepEqual(result, { source: "custom", customBase: 200, sourceModifier: 5 });
});

await testAsync("Use Size Capacity skips write when already Size", async () => {
	const actor = mockStarship({ capOverride: false, food: { foodCap: 200 } });
	const result = await applyStarshipFoodCapSource(actor, "size");
	assert.equal(result.updated, false);
	assert.equal(actor.updates.length, 0);
	assert.equal(actor.system.attributes.food.foodCap, 200);
});

await testAsync("Use Custom Capacity seeds from Size when custom unused", async () => {
	const actor = mockStarship({ capOverride: false, food: { foodCap: 0 }, sizeFoodCap: 120 });
	const result = await applyStarshipFoodCapSource(actor, "custom");
	assert.equal(result.updated, true);
	assert.equal(actor.flags.sw5e.starship.food.capOverride, true);
	assert.equal(actor.system.attributes.food.foodCap, 120);
	assert.ok(actor.updates.some(u => u[STARSHIP_FOOD_CAP_OVERRIDE_FLAG] === true));
});

await testAsync("Use Custom Capacity restores dormant custom without overwrite", async () => {
	const actor = mockStarship({ capOverride: false, food: { foodCap: 200 }, sizeFoodCap: 120 });
	const result = await applyStarshipFoodCapSource(actor, "custom");
	assert.equal(result.updated, true);
	assert.equal(actor.system.attributes.food.foodCap, 200);
	assert.equal(
		actor.updates.some(u => u["system.attributes.food.foodCap"] !== undefined),
		false
	);
});

await testAsync("Use Size Capacity clears override and preserves dormant custom", async () => {
	const actor = mockStarship({ capOverride: true, food: { foodCap: 200 }, sizeFoodCap: 120 });
	const result = await applyStarshipFoodCapSource(actor, "size");
	assert.equal(result.updated, true);
	assert.equal(actor.flags.sw5e.starship.food.capOverride, false);
	assert.equal(actor.system.attributes.food.foodCap, 200);
});

await testAsync("saving source modifier does not persist prepared AE result", async () => {
	const actor = mockStarship({
		capOverride: false,
		food: { foodCap: 0, foodCapMod: 40, sourceMod: 5 },
		sizeFoodCap: 120
	});
	actor.system.attributes.food.foodCapMod = 40;
	actor._source.system.attributes.food.foodCapMod = 5;
	const result = await applyStarshipFoodCapacityConfig(actor, {
		source: "size",
		sourceModifier: 5
	});
	assert.equal(result.updated, false);
	assert.equal(actor.updates.length, 0);

	const changed = await applyStarshipFoodCapacityConfig(actor, {
		source: "size",
		sourceModifier: 8
	});
	assert.equal(changed.updated, true);
	assert.equal(actor._source.system.attributes.food.foodCapMod, 8);
	assert.ok(actor.updates.some(u => u["system.attributes.food.foodCapMod"] === 8));
	assert.equal(
		actor.updates.some(u => u["system.attributes.food.foodCapMod"] === 40),
		false
	);
	assert.equal(
		actor.updates.some(u => Object.keys(u).some(k => k.includes("effective"))),
		false
	);
});

await testAsync("saving custom base + source mod in Custom mode writes only source values", async () => {
	const actor = mockStarship({
		capOverride: true,
		food: { foodCap: 200, foodCapMod: 10, sourceMod: 5 },
		sizeFoodCap: 120
	});
	actor.system.attributes.food.foodCapMod = 10;
	const result = await applyStarshipFoodCapacityConfig(actor, {
		source: "custom",
		customBase: 180,
		sourceModifier: 7
	});
	assert.equal(result.updated, true);
	assert.equal(actor.system.attributes.food.foodCap, 180);
	assert.equal(actor._source.system.attributes.food.foodCapMod, 7);
	assert.ok(actor.updates.some(u => (
		u["system.attributes.food.foodCap"] === 180
		&& u["flags.sw5e.legacyStarshipActor.system.attributes.food.foodCap"] === 180
	)));
	assert.ok(actor.updates.some(u => u["system.attributes.food.foodCapMod"] === 7));
});

test("capacity tooltip formulas: positive, negative, floored, unsafe", () => {
	assert.equal(formatStarshipFoodCapacityTooltip({
		selectedBase: 120,
		preparedModifier: 40,
		effectiveCapacity: 160,
		safeInteger: true
	}), "120 + 40 = 160");
	assert.equal(formatStarshipFoodCapacityTooltip({
		selectedBase: 120,
		preparedModifier: -20,
		effectiveCapacity: 100,
		safeInteger: true
	}), "120 + (-20) = 100");
	assert.equal(formatStarshipFoodCapacityTooltip({
		selectedBase: 10,
		preparedModifier: -20,
		effectiveCapacity: 0,
		safeInteger: true
	}), "10 + (-20) = 0");
	assert.match(formatStarshipFoodCapacityTooltip({
		selectedBase: 120,
		preparedModifier: 40,
		effectiveCapacity: Number.MAX_SAFE_INTEGER + 2,
		safeInteger: false
	}), /Unavailable/i);
});

test("Capacity display and Food bar maximum use the same effective capacity", () => {
	const capacity = resolveStarshipFoodCapacity(120, 0, false, 40);
	assert.equal(capacity.effectiveCapacity, 160);
	const bar = buildStarshipFoodBarContext(50, capacity.effectiveCapacity);
	assert.match(bar.foodBarLabel, /50 \/ 160 portions/);
	const actor = mockStarship({
		food: { value: 50, foodCapMod: 40, sourceMod: 40 },
		sizeFoodCap: 120
	});
	const snap = readStarshipFoodResourceSnapshot(actor);
	assert.equal(snap.capacity.effectiveCapacity, 160);
	assert.equal(snap.capacity.effectiveCapacity, capacity.effectiveCapacity);
});

test("panel template: three Food fields; Fuel container parity; shared Ship’s Stores actions", () => {
	assert.match(layerHbs, /\{\{systemsCore\.labels\.shipsStores\}\}/);
	assert.match(layerHbs, /data-sw5e-core-panel="fuel"/);
	assert.match(layerHbs, /sw5e-starship-systems-field--fuel sw5e-starship-systems-field--food/);
	assert.match(layerHbs, /sw5e-starship-core-fuel-grid sw5e-starship-core-food-grid/);
	assert.match(layerHbs, /system\.attributes\.food\.value/);
	assert.match(layerHbs, /system\.attributes\.food\.cost/);
	assert.match(layerHbs, /systemsCore\.food\.effectiveCapacityFormatted/);
	assert.match(layerHbs, /systemsCore\.food\.capacityTooltip/);
	assert.match(layerHbs, /data-sw5e-food-cap-source/);
	assert.match(layerHbs, /data-sw5e-replenish-cost-mode="food"/);
	assert.match(layerHbs, /sw5e-core-food-effective-cap/);
	assert.equal(/name="system\.attributes\.food\.foodCap"/.test(layerHbs), false);
	assert.equal(/name="system\.attributes\.food\.foodCapMod"/.test(layerHbs), false);
	assert.equal(/foodCapacityModifier|FoodCapacityModifier|Capacity Modifier/.test(layerHbs), false);
	assert.equal(/foodEffectiveCapacity|FoodEffectiveCapacity|Effective Capacity/.test(layerHbs), false);
	assert.equal(/sw5e-starship-core-food-meta/.test(layerHbs), false);
	assert.equal(/data-sw5e-food-action="consume"|data-sw5e-food-action="restock"/i.test(layerHbs), false);
	assert.equal(/data-sw5e-fuel-action="burn"|data-sw5e-fuel-action="refuel"/.test(layerHbs), false);
	assert.match(layerHbs, /data-sw5e-supplies-action="consume"/);
	assert.match(layerHbs, /data-sw5e-supplies-action="restock"/);
	// Capacity cog gated to EDIT; Restock Cost cog uses replenishCostMode.configEditable
	assert.match(layerHbs, /\{\{#if @root\.systemsSetupEditable\}\}[\s\S]*data-sw5e-food-cap-source/);
});

test("Food Capacity uses centered display-only text contract (formatted)", () => {
	const foodCapMatch = layerHbs.match(
		/<input[^>]*id="sw5e-core-food-effective-cap"[\s\S]*?>/
	);
	assert.ok(foodCapMatch, "Capacity input present");
	const foodCap = foodCapMatch[0];
	assert.match(foodCap, /type="text"/);
	assert.match(foodCap, /class="[^"]*sw5e-starship-systems-input/);
	assert.match(foodCap, /\breadonly\b/);
	assert.match(foodCap, /\bdisabled\b/);
	assert.equal(/\bname=/.test(foodCap), false);
	assert.equal(/type="number"/.test(foodCap), false);
	assert.match(foodCap, /data-tooltip="\{\{systemsCore\.food\.capacityTooltip\}\}"/);
	// EDIT Current + Restock Cost remain number inputs; PLAY uses formatted text
	assert.match(layerHbs, /id="sw5e-core-food-value"[\s\S]*?type="number"/);
	assert.match(layerHbs, /id="sw5e-core-food-cost"[\s\S]*?type="number"/);
	assert.match(layerHbs, /id="sw5e-core-fuel-cap"[\s\S]*?type="number"/);
	assert.match(layerHbs, /systemsCore\.food\.valueFormatted/);
	assert.match(layerHbs, /systemsCore\.food\.costFormatted/);
	// Grid-level centering applies in EDIT and PLAY (no mode gate on the rule)
	const foodLess = readFileSync(join(__dirname, "..", "styles", "less", "starship-food-capacity.less"), "utf8");
	assert.match(foodLess, /\.sw5e-starship-core-fuel-grid[\s\S]*?\.sw5e-starship-systems-input[\s\S]*?text-align:\s*center/);
	assert.equal(/sotg--mode-edit|systemsSetupEditable/.test(foodLess), false);
});

test("schema registration is idempotent when VehicleData unavailable", () => {
	const prev = globalThis.dnd5e;
	delete globalThis.dnd5e;
	addStarshipFoodSchemaField();
	globalThis.dnd5e = prev;
});

test("schema registration adds food fields when VehicleData mock present", () => {
	const fields = {};
	globalThis.dnd5e = {
		dataModels: {
			actor: {
				VehicleData: {
					schema: {
						fields: {
							attributes: { fields }
						}
					}
				}
			}
		}
	};
	globalThis.foundry = {
		data: {
			fields: {
				NumberField: class NumberField {
					constructor(opts) { this.options = opts; }
				},
				SchemaField: class SchemaField {
					constructor(obj, opts) { this.fields = obj; this.options = opts; }
				}
			}
		}
	};
	addStarshipFoodSchemaField();
	assert.ok(fields.food);
	assert.ok(fields.food.fields.value);
	assert.ok(fields.food.fields.foodCap);
	assert.ok(fields.food.fields.foodCapMod);
	assert.ok(fields.food.fields.cost);
	assert.equal(fields.food.fields.foodCapMod.options.min, undefined);
	assert.equal(fields.food.fields.value.options.min, 0);
	addStarshipFoodSchemaField();
	assert.equal(Object.keys(fields).filter(k => k === "food").length, 1);
	delete globalThis.dnd5e;
	delete globalThis.foundry;
});

console.log(`\n${passed} tests passed`);
