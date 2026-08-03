#!/usr/bin/env node
/**
 * Offline tests: Starship Food current-value migration (1.3.6).
 */
import assert from "node:assert/strict";
import {
	applyStarshipFoodCurrentMigration,
	auditStarshipFoodCurrent,
	buildStarshipFoodCurrentValueUpdate,
	createStarshipFoodCurrentMigrationReport,
	hasOwnStarshipFoodValue,
	isIntegralStarshipFoodStock,
	isSchemaDefaultOnlyFoodZero,
	resolveStarshipFoodCurrentCandidate,
	resolveStarshipFoodCurrentMigration,
	resolveStarshipFoodCurrentPersistentBase
} from "../scripts/starship-food-value-migration.mjs";
import { normalizeStarshipNonNegativeInt } from "../scripts/starship-replenish-math.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mediumSizeItem(foodCap=120) {
	return {
		type: "starshipsize",
		name: "Medium",
		system: { foodCap },
		flags: { sw5e: { legacyStarshipSize: { foodCap } } }
	};
}

function starshipBase({ foodSystem, foodFlag, capOverride, items, foodCapMod }={}) {
	const actor = {
		_id: "Ship1",
		name: "Test Ship",
		type: "vehicle",
		items: items ?? [mediumSizeItem(120)],
		system: { attributes: {} },
		flags: {
			sw5e: {
				legacyStarshipActor: { type: "starship", system: { attributes: {} } },
				starship: { food: {} }
			}
		}
	};
	if ( foodSystem !== undefined ) {
		actor.system.attributes.food = foodSystem;
	}
	if ( foodFlag !== undefined ) {
		actor.flags.sw5e.legacyStarshipActor.system.attributes.food = foodFlag;
	}
	if ( capOverride !== undefined ) {
		actor.flags.sw5e.starship.food.capOverride = capOverride;
	}
	if ( foodCapMod !== undefined ) {
		actor.system.attributes.food ??= {};
		actor.system.attributes.food.foodCapMod = foodCapMod;
	}
	return actor;
}

test("hasOwn distinguishes missing vs explicit 0", () => {
	assert.equal(hasOwnStarshipFoodValue({}), false);
	assert.equal(hasOwnStarshipFoodValue({ value: 0 }), true);
	assert.equal(hasOwnStarshipFoodValue({ value: null }), true);
});

test("1. Missing food.value → initialize to Size base 120", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase());
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 120);
	assert.equal(r.update["system.attributes.food.value"], 120);
	assert.equal(r.update["flags.sw5e.legacyStarshipActor.system.attributes.food.value"], 120);
});

test("2. Missing food.value with +40 AE mod → still 120 not 160", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({ foodCapMod: 40 }));
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 120);
});

test("3. Custom base 200 + mod 40 → initialize 200 not 240", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		capOverride: true,
		foodSystem: { foodCap: 200 },
		foodCapMod: 40
	}));
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 200);
});

test("4. Tiny base 0 → initialize 0", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		items: [mediumSizeItem(0)]
	}));
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 0);
	assert.equal(r.initializedZero, true);
});

test("5. Tiny base 0 with +5 mod → initialize 0", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		items: [mediumSizeItem(0)],
		foodCapMod: 5
	}));
	assert.equal(r.nextValue, 0);
});

test("6. Explicit stored food.value 0 (flag) → skip", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodSystem: { value: 0 },
		foodFlag: { value: 0 }
	}));
	assert.equal(r.disposition, "skip");
	assert.equal(r.update, null);
});

test("7. Existing positive food.value → skip", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodSystem: { value: 80 },
		foodFlag: { value: 80 }
	}));
	assert.equal(r.disposition, "skip");
});

test("8. Partially consumed Food → skip", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodFlag: { value: 45 }
	}));
	assert.equal(r.disposition, "skip");
	assert.equal(r.nextValue, 45);
});

test("9. Explicit value greater than effective capacity → skip", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodFlag: { value: 999 },
		foodCapMod: -50
	}));
	assert.equal(r.disposition, "skip");
	assert.equal(r.nextValue, 999);
});

test("10. Missing Size → initialize 0 + missingSize", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({ items: [] }));
	assert.equal(r.disposition, "initialize");
	assert.equal(r.nextValue, 0);
	assert.equal(r.missingSize, true);
});

test("11. Custom override true with valid custom base → custom", () => {
	const base = resolveStarshipFoodCurrentPersistentBase(starshipBase({
		capOverride: true,
		foodSystem: { foodCap: 200 }
	}));
	assert.equal(base.selectedPersistentBase, 200);
});

test("12. Custom override false with dormant custom base → Size", () => {
	const base = resolveStarshipFoodCurrentPersistentBase(starshipBase({
		capOverride: false,
		foodSystem: { foodCap: 200 }
	}));
	assert.equal(base.selectedPersistentBase, 120);
});

test("13. Rerun after initialize → skip (idempotent)", () => {
	const actor = starshipBase();
	const first = resolveStarshipFoodCurrentMigration(actor);
	assert.equal(first.disposition, "initialize");
	applyStarshipFoodCurrentMigration(actor, {});
	const second = resolveStarshipFoodCurrentMigration(actor);
	assert.equal(second.disposition, "skip");
	assert.equal(second.update, null);
});

test("14. System and legacy mirror written together", () => {
	const update = buildStarshipFoodCurrentValueUpdate(120);
	assert.equal(update["system.attributes.food.value"], 120);
	assert.equal(update["flags.sw5e.legacyStarshipActor.system.attributes.food.value"], 120);
	assert.equal(Object.keys(update).length, 2);
});

test("15. No foodCapMod in update payload", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({ foodCapMod: 40 }));
	assert.equal(r.update["system.attributes.food.foodCapMod"], undefined);
	assert.equal(
		r.update["flags.sw5e.legacyStarshipActor.system.attributes.food.foodCapMod"],
		undefined
	);
});

test("16. No effective capacity persisted", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({ foodCapMod: 40 }));
	assert.equal(r.nextValue, 120);
	assert.ok(!Object.keys(r.update).some(k => /effective/i.test(k)));
});

test("17. No Fuel path altered", () => {
	const actor = starshipBase({ foodSystem: undefined });
	actor.system.attributes.fuel = { value: 4, fuelCap: 10 };
	const update = {};
	applyStarshipFoodCurrentMigration(actor, update);
	assert.equal(update["system.attributes.fuel.value"], undefined);
	assert.equal(actor.system.attributes.fuel.value, 4);
});

test("18. Character / NPC / ordinary Vehicle skipped", () => {
	assert.equal(resolveStarshipFoodCurrentMigration({ type: "character" }).reason, "not-starship");
	assert.equal(resolveStarshipFoodCurrentMigration({ type: "npc" }).reason, "not-starship");
	assert.equal(resolveStarshipFoodCurrentMigration({
		type: "vehicle",
		flags: {}
	}).reason, "not-starship");
});

test("19. Active Effects / foodCapMod unchanged on actor", () => {
	const actor = starshipBase({ foodCapMod: 40 });
	const update = {};
	applyStarshipFoodCurrentMigration(actor, update);
	assert.equal(actor.system.attributes.food.foodCapMod, 40);
	assert.equal(update["system.attributes.food.foodCapMod"], undefined);
});

test("20. Restock Cost and cost modes unchanged", () => {
	const actor = starshipBase({
		foodSystem: { cost: 500 }
	});
	actor.flags.sw5e.starship.food.replenishCostMode = "perUnit";
	const update = {};
	applyStarshipFoodCurrentMigration(actor, update);
	assert.equal(actor.system.attributes.food.cost, 500);
	assert.equal(actor.flags.sw5e.starship.food.replenishCostMode, "perUnit");
	assert.equal(update["system.attributes.food.cost"], undefined);
});

test("schema-default system 0 without flag → initialize", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodSystem: { value: 0 }
	}));
	assert.equal(r.disposition, "initialize");
	assert.equal(r.reason, "schema-default-zero");
	assert.equal(r.nextValue, 120);
});

test("system-only positive without flag → skip", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodSystem: { value: 55 }
	}));
	assert.equal(r.disposition, "skip");
	assert.equal(r.nextValue, 55);
});

test("flag malformed null / empty / refuel / negative → initialize", () => {
	for ( const value of [null, "", "refuel", -10] ) {
		const r = resolveStarshipFoodCurrentMigration(starshipBase({
			foodFlag: { value }
		}));
		assert.equal(r.disposition, "initialize", String(value));
		assert.equal(r.malformed, true, String(value));
		assert.equal(r.nextValue, 120, String(value));
	}
});

test("decimal 12.8 → normalize write 12 (not skip)", () => {
	const r = resolveStarshipFoodCurrentMigration(starshipBase({
		foodFlag: { value: 12.8 }
	}));
	assert.equal(r.disposition, "normalize");
	assert.equal(r.nextValue, 12);
	assert.equal(r.update["system.attributes.food.value"], 12);
	assert.equal(r.update["flags.sw5e.legacyStarshipActor.system.attributes.food.value"], 12);
});

test("normalize then rerun → skip", () => {
	const actor = starshipBase({ foodFlag: { value: 12.8 }, foodSystem: { value: 12.8 } });
	applyStarshipFoodCurrentMigration(actor, {});
	const second = resolveStarshipFoodCurrentMigration(actor);
	assert.equal(second.disposition, "skip");
});

test("custom override invalid foodCap falls back to Size", () => {
	const base = resolveStarshipFoodCurrentPersistentBase(starshipBase({
		capOverride: true,
		foodSystem: { foodCap: "nope" }
	}));
	assert.equal(base.customFallback, true);
	assert.equal(base.selectedPersistentBase, 120);
});

test("integral helper and candidate prefer flag", () => {
	assert.equal(isIntegralStarshipFoodStock(12, 12), true);
	assert.equal(isIntegralStarshipFoodStock(12.8, 12), false);
	assert.equal(normalizeStarshipNonNegativeInt(12.8), 12);
	const c = resolveStarshipFoodCurrentCandidate(starshipBase({
		foodSystem: { value: 1 },
		foodFlag: { value: 0 }
	}));
	assert.equal(c.candidateSource, "flag");
	assert.equal(c.candidateRaw, 0);
	assert.equal(isSchemaDefaultOnlyFoodZero({
		candidateSource: "system",
		flagFood: null,
		candidateRaw: 0,
		hasCandidate: true
	}), true);
});

test("report buckets distinguish skip / initialize / normalize", () => {
	const report = createStarshipFoodCurrentMigrationReport();
	const actors = [
		starshipBase({ foodFlag: { value: 10 } }),
		starshipBase(),
		starshipBase({ foodFlag: { value: 3.5 } }),
		{ type: "character", name: "Hero" }
	];
	const audit = auditStarshipFoodCurrent(actors);
	assert.equal(audit.eligibleStarships, 3);
	assert.equal(audit.skippedUnchanged, 1);
	assert.equal(audit.initializedMissing, 1);
	assert.equal(audit.normalizedExisting, 1);
	assert.equal(audit.notStarship, 1);
	assert.ok(report);
});

console.log(`\n${passed} tests passed`);
