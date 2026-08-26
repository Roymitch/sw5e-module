#!/usr/bin/env node
/**
 * Offline tests: Phase 3C / Bug 13 Starship Armor categorizer feat-gate.
 */
import assert from "node:assert/strict";
import {
	categorizeStarshipItems,
	getStarshipFeaturesManagedItemIds,
	getStarshipInventoryExcludedItemIds,
	resolveStarshipItemGroup
} from "../scripts/starship-sheet-categorize.mjs";

globalThis.game = {
	i18n: {
		localize(key) {
			return key;
		}
	}
};

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function item(partial) {
	return {
		id: partial.id ?? "ItemId",
		type: partial.type,
		system: { type: { value: partial.featType ?? "" }, ...(partial.system ?? {}) },
		flags: partial.flags ?? {}
	};
}

test("armor equipment with subtype starship → equipment (not systems)", () => {
	const armor = item({
		id: "armor1",
		type: "equipment",
		featType: "starship",
		flags: { core: { sourceId: "Compendium.sw5e-module.starships.Armor1" } }
	});
	assert.equal(resolveStarshipItemGroup(armor), "equipment");
});

test("feat with subtype starship → systems", () => {
	const feat = item({
		id: "feat1",
		type: "feat",
		featType: "starship",
		flags: { core: { sourceId: "Compendium.sw5e-module.starshipfeatures.Feat1" } }
	});
	assert.equal(resolveStarshipItemGroup(feat), "systems");
});

test("hyperdrive equipment subtype hyper → equipment", () => {
	const hyper = item({ id: "hyper1", type: "equipment", featType: "hyper" });
	assert.equal(resolveStarshipItemGroup(hyper), "equipment");
});

test("feat starshipAction → actions; equipment with same subtype does not", () => {
	const action = item({ id: "act1", type: "feat", featType: "starshipAction" });
	const fake = item({ id: "fake1", type: "equipment", featType: "starshipAction" });
	assert.equal(resolveStarshipItemGroup(action), "actions");
	assert.equal(resolveStarshipItemGroup(fake), "equipment");
});

test("categorizeStarshipItems: armor in equipment; feat in features; inventory exclusion", () => {
	const armor = item({ id: "armor1", type: "equipment", featType: "starship" });
	const feat = item({ id: "feat1", type: "feat", featType: "starship" });
	const hyper = item({ id: "hyper1", type: "equipment", featType: "hyper" });
	const actor = { items: [armor, feat, hyper] };
	const groups = categorizeStarshipItems(actor);
	assert.deepEqual(groups.equipment.items.map(i => i.id).sort(), ["armor1", "hyper1"]);
	assert.deepEqual(groups.features.items.map(i => i.id), ["feat1"]);
	assert.equal(groups.features.items.some(i => i.id === "armor1"), false);
	const featuresManaged = getStarshipFeaturesManagedItemIds(actor, groups);
	assert.equal(featuresManaged.has("feat1"), true);
	assert.equal(featuresManaged.has("armor1"), false);
	const inventoryExcluded = getStarshipInventoryExcludedItemIds(actor, groups);
	assert.equal(inventoryExcluded.has("armor1"), false);
	assert.equal(inventoryExcluded.has("feat1"), true);
});

test("pack starshipfeatures still routes to systems without feat type", () => {
	const fromPack = item({
		id: "packFeat",
		type: "loot",
		featType: "",
		flags: { core: { sourceId: "Compendium.sw5e-module.starshipfeatures.X" } }
	});
	assert.equal(resolveStarshipItemGroup(fromPack), "systems");
});

console.log(`\n${passed} tests passed`);
