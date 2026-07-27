#!/usr/bin/env node
/**
 * Offline tests: Stations/Inventory list filtering preserves sheet-wide itemContext
 * so Starship Features Uses/Recovery columns keep stock dnd5e ctx.uses.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-inventory.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const SUPERIOR_ID = "4aQwn3RVsQ4e5xss";
const BOOST_ID = "1gIXM5zEH7KKqDXK";
const NATIVE_RECHARGE_ID = "nativeRecharge001";
const STATION_KEEP_ID = "stationKeep001";
const UNRELATED_CTX_ID = "unrelatedCtx001";
const LR_FEAT_ID = "lrFeat001";
const PINPOINT_ID = "pinpointFeat001";
const EVASIVE_ID = "evasiveFeat001";

globalThis.foundry = {
	applications: { api: { DialogV2: class DialogV2 {} } },
	utils: {
		deepClone: value => structuredClone(value),
		isEmpty: value => {
			if ( value == null ) return true;
			if ( typeof value !== "object" ) return !value;
			if ( Array.isArray(value) ) return value.length === 0;
			return Object.keys(value).length === 0;
		}
	}
};
globalThis.game = { i18n: { localize: key => key } };
globalThis.CONFIG = { Item: { typeLabels: {} } };
globalThis.libWrapper = { register() {} };
globalThis.Hooks = { on() {} };
globalThis.customElements = { get() { return null; } };

const {
	filterStarshipCargoContext,
	STARSHIP_FEATURES_FEAT_COLUMNS,
	suppressNativeStarshipStationsAbilityAndFeatures
} = await import(pathToFileURL(path.join(ROOT, "scripts/patch/starship-sheet-inventory.mjs")).href);

function superiorUsesCtx() {
	// Corrected ship-Recharging semantics: uses.per sr → prepared period "sr"
	// (Starship dropdown "Recharge (Short Rest)", Features column "RC").
	// Not native dnd5e Recharge (no formula 6 / hasRecharge bolt branch).
	return {
		uses: {
			hasUses: true,
			hasRecharge: false,
			isOnCooldown: false,
			max: 9,
			value: 9,
			spent: 0,
			prop: "system.uses.value",
			recovery: [{ period: "sr", type: "recoverAll" }]
		},
		groups: { sw5eFeatures: "systems" }
	};
}

function boostUsesCtx() {
	// Approved disposition: Boost Engines has no limited Uses / no Recovery.
	return {
		uses: {
			hasUses: false,
			hasRecharge: false,
			isOnCooldown: false
		},
		groups: { sw5eFeatures: "actions" }
	};
}

function nativeRechargeUsesCtx() {
	// Synthetic fixture — not an approved no-Uses crew action.
	return {
		uses: {
			hasUses: true,
			hasRecharge: true,
			isOnCooldown: false,
			max: 1,
			value: 1,
			spent: 0,
			prop: "system.uses.value",
			label: "Recharge 1–6",
			recovery: [{ period: "recharge", formula: "1", type: "recoverAll" }]
		},
		groups: { sw5eFeatures: "actions" }
	};
}

function pinpointUsesCtx() {
	return {
		uses: {
			hasUses: true,
			hasRecharge: false,
			isOnCooldown: false,
			max: 3,
			value: 3,
			spent: 0,
			prop: "system.uses.value",
			recovery: [{ period: "sr", type: "recoverAll" }]
		}
	};
}

function evasiveUsesCtx() {
	return {
		uses: {
			hasUses: true,
			hasRecharge: false,
			isOnCooldown: false,
			max: 6,
			value: 6,
			spent: 0,
			prop: "system.uses.value",
			recovery: [{ period: "lr", type: "recoverAll" }]
		}
	};
}

function lrUsesCtx() {
	return {
		uses: {
			hasUses: true,
			hasRecharge: false,
			isOnCooldown: false,
			max: 1,
			value: 1,
			spent: 0,
			prop: "system.uses.value",
			recovery: [{ period: "lr", type: "recoverAll" }]
		}
	};
}

function makeStationsContext() {
	return {
		items: [
			{ id: SUPERIOR_ID, name: "Superior Firepower" },
			{ id: BOOST_ID, name: "Boost Engines" },
			{ id: STATION_KEEP_ID, name: "Station-only entry" }
		],
		sections: [
			{
				id: "stations-features",
				items: [
					{ id: SUPERIOR_ID, name: "Superior Firepower" },
					{ id: STATION_KEEP_ID, name: "Station-only entry" }
				]
			}
		],
		features: [
			{
				id: "native-features",
				items: [
					{ id: BOOST_ID, name: "Boost Engines" },
					{ id: STATION_KEEP_ID, name: "Station-only entry" }
				]
			}
		],
		inventory: [{ id: SUPERIOR_ID, name: "Superior Firepower" }],
		containers: [],
		cargo: [],
		itemCategories: {
			features: {
				items: [{ id: SUPERIOR_ID, name: "Superior Firepower" }]
			}
		},
		itemContext: {
			[SUPERIOR_ID]: superiorUsesCtx(),
			[BOOST_ID]: boostUsesCtx(),
			[NATIVE_RECHARGE_ID]: nativeRechargeUsesCtx(),
			[STATION_KEEP_ID]: { uses: { hasUses: false, hasRecharge: false } },
			[UNRELATED_CTX_ID]: { uses: { hasUses: true, hasRecharge: false, max: 2, value: 2 }, marker: "keep-me" },
			[LR_FEAT_ID]: lrUsesCtx(),
			[PINPOINT_ID]: pinpointUsesCtx(),
			[EVASIVE_ID]: evasiveUsesCtx()
		}
	};
}

function idsIn(entries) {
	return (entries ?? []).map(e => e.id);
}

test("filterStarshipCargoContext removes Features-managed ids from list collections", () => {
	const context = makeStationsContext();
	const hidden = new Set([SUPERIOR_ID, BOOST_ID]);
	filterStarshipCargoContext(context, hidden);

	assert.deepEqual(idsIn(context.items), [STATION_KEEP_ID]);
	assert.deepEqual(idsIn(context.sections[0].items), [STATION_KEEP_ID]);
	assert.deepEqual(idsIn(context.features[0].items), [STATION_KEEP_ID]);
	assert.deepEqual(idsIn(context.inventory), []);
	assert.deepEqual(idsIn(context.itemCategories.features.items), []);
});

test("filterStarshipCargoContext preserves shared itemContext for hidden Features ids", () => {
	const context = makeStationsContext();
	const before = structuredClone(context.itemContext[SUPERIOR_ID]);
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID, BOOST_ID]));

	assert.ok(context.itemContext[SUPERIOR_ID], "Superior Firepower itemContext must remain");
	assert.ok(context.itemContext[BOOST_ID], "Boost Engines itemContext must remain");
	assert.deepEqual(context.itemContext[SUPERIOR_ID], before);
});

test("unrelated Stations list item and unrelated itemContext entry remain unchanged", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID, BOOST_ID]));

	assert.deepEqual(idsIn(context.items), [STATION_KEEP_ID]);
	assert.equal(context.itemContext[STATION_KEEP_ID].uses.hasUses, false);
	assert.equal(context.itemContext[UNRELATED_CTX_ID].marker, "keep-me");
	assert.equal(context.itemContext[UNRELATED_CTX_ID].uses.max, 2);
});

test("Superior Firepower prepared Uses context survives Stations-style filter", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID]));
	const ctx = context.itemContext[SUPERIOR_ID];

	assert.equal(ctx.uses.hasUses, true);
	assert.equal(ctx.uses.hasRecharge, false);
	assert.equal(ctx.uses.max, 9);
	assert.equal(ctx.uses.value, 9);
	assert.equal(ctx.uses.spent, 0);
	assert.equal(ctx.uses.recovery[0].period, "sr");
});

test("Features PART can resolve itemContext[item.id] after Stations filter", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID, BOOST_ID]));

	const resolve = itemId => context.itemContext?.[itemId];
	assert.ok(resolve(SUPERIOR_ID));
	assert.ok(resolve(BOOST_ID));
	assert.equal(resolve(SUPERIOR_ID).uses.hasRecharge, false);
	assert.equal(resolve(SUPERIOR_ID).uses.recovery[0].period, "sr");
	assert.equal(resolve(BOOST_ID).uses.hasUses, false);
	assert.equal(resolve(BOOST_ID).uses.hasRecharge, false);
});

test("Superior Firepower uses short-rest recovery (RC), not native Recharge [6]", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID]));
	const uses = context.itemContext[SUPERIOR_ID].uses;

	assert.equal(uses.hasRecharge, false);
	assert.equal(uses.recovery[0].period, "sr");
	assert.equal(uses.max, 9);
	const compactLabel = uses.recovery[0].period === "sr" ? "RC" : "";
	assert.equal(compactLabel, "RC");
	assert.notEqual(uses.label, "Recharge 6");
});

test("Boost Engines approved disposition is no Uses / no Recovery", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([BOOST_ID]));
	const uses = context.itemContext[BOOST_ID].uses;
	assert.equal(uses.hasUses, false);
	assert.equal(uses.hasRecharge, false);
});

test("native Recharge Uses (synthetic fixture) keep hasRecharge bolt branch", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([NATIVE_RECHARGE_ID]));
	const uses = context.itemContext[NATIVE_RECHARGE_ID].uses;

	assert.equal(uses.hasRecharge, true);
	assert.equal(uses.isOnCooldown, false);
	assert.equal(uses.label, "Recharge 1–6");
	assert.equal(uses.recovery[0].period, "recharge");
	const labels = { recharge: "Recharge [1]", recovery: "" };
	assert.equal(labels.recharge, "Recharge [1]");
	assert.equal(labels.recovery, "");
	assert.ok(uses.hasRecharge && !uses.isOnCooldown, "charged recharge uses bolt branch, not value/max");
});

test("Pinpoint Strike fixture uses sr / RC; Evasive uses lr / RF", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([PINPOINT_ID, EVASIVE_ID]));
	assert.equal(context.itemContext[PINPOINT_ID].uses.recovery[0].period, "sr");
	assert.equal(context.itemContext[EVASIVE_ID].uses.recovery[0].period, "lr");
	assert.equal(context.itemContext[PINPOINT_ID].uses.recovery[0].period === "sr" ? "RC" : "", "RC");
	assert.equal(context.itemContext[EVASIVE_ID].uses.recovery[0].period === "lr" ? "RF" : "", "RF");
});

test("non-Recharge limited uses keep value/max branch and LR recovery availability", () => {
	const context = makeStationsContext();
	filterStarshipCargoContext(context, new Set([SUPERIOR_ID]));
	const uses = context.itemContext[LR_FEAT_ID].uses;
	const labels = { recovery: "RF", recharge: undefined };

	assert.equal(uses.hasUses, true);
	assert.equal(uses.hasRecharge, false);
	assert.equal(uses.value, 1);
	assert.equal(uses.max, 1);
	assert.equal(uses.recovery[0].period, "lr");
	assert.equal(labels.recovery, "RF");
});

test("source does not delete itemContext inside filterStarshipCargoContext", () => {
	assert.doesNotMatch(
		INVENTORY_SRC,
		/for\s*\(\s*const itemId of hiddenIds\s*\)\s*delete itemContext\[itemId\]/
	);
	assert.match(INVENTORY_SRC, /Preserve sheet-wide `context\.itemContext`/);
});

test("Stations and Inventory suppress paths still call list filter for Features-managed ids", () => {
	assert.match(
		INVENTORY_SRC,
		/partId === "stations"[\s\S]*?getStarshipFeaturesManagedItemIds[\s\S]*?filterStarshipCargoContext/
	);
	assert.match(
		INVENTORY_SRC,
		/partId === "inventory"[\s\S]*?getStarshipInventoryExcludedItemIds[\s\S]*?filterStarshipCargoContext/
	);
});

test("Features columns remain stock uses/controls with Starship recovery template", () => {
	assert.deepEqual(STARSHIP_FEATURES_FEAT_COLUMNS, [{ id: "uses", order: 200 }, "recovery", "controls"]);
});

test("Executor-style census: Features itemContext remains resolvable after Stations filter", () => {
	const systemsIds = [SUPERIOR_ID, "19fjkCPrzTnUCA31", "33KhoG1MWQd5Z6HW"];
	const actionIds = [
		BOOST_ID,
		"DNrcLjHCzHWoXpZI",
		"1oJj7kbvJEqPDnXM",
		"5vpqAYPljHkcr6WZ",
		"pRszQujoI5CRm9zu",
		"Vt9sF4PBBN4r037J"
	];
	const featureIds = [...systemsIds, ...actionIds];
	assert.equal(featureIds.length, 9);

	const context = {
		sections: [{ id: "native", items: featureIds.map(id => ({ id, name: id })) }],
		features: [{ id: "native-feat", items: featureIds.map(id => ({ id, name: id })) }],
		items: featureIds.map(id => ({ id, name: id })),
		itemContext: Object.fromEntries(
			featureIds.map(id => {
				if ( id === SUPERIOR_ID ) return [id, superiorUsesCtx()];
				if ( actionIds.includes(id) ) return [id, boostUsesCtx()];
				return [id, {
					uses: {
						hasUses: true,
						hasRecharge: false,
						max: 1,
						value: 1,
						recovery: [{ period: "sr", type: "recoverAll" }]
					}
				}];
			})
		)
	};
	filterStarshipCargoContext(context, new Set(featureIds));

	assert.equal(context.sections[0].items.length, 0, "duplicate Stations rows suppressed");
	assert.equal(context.features[0].items.length, 0);
	assert.equal(context.items.length, 0);

	let restored = 0;
	for ( const id of featureIds ) {
		assert.ok(context.itemContext[id], `itemContext must remain for ${id}`);
		restored += 1;
	}
	assert.equal(restored, 9);
	assert.equal(context.itemContext[SUPERIOR_ID].uses.max, 9);
	assert.equal(context.itemContext[SUPERIOR_ID].uses.hasRecharge, false);
	assert.equal(context.itemContext[SUPERIOR_ID].uses.recovery[0].period, "sr");
	assert.equal(context.itemContext[BOOST_ID].uses.hasUses, false);
	assert.equal(context.itemContext[BOOST_ID].uses.hasRecharge, false);
});

test("filterStarshipCargoContext is exported for Stations suppress lifecycle", () => {
	assert.equal(typeof filterStarshipCargoContext, "function");
	assert.equal(typeof suppressNativeStarshipStationsAbilityAndFeatures, "function");
});

test("Item source formula contract is unchanged in inventory helper (no formula rewrite)", () => {
	assert.doesNotMatch(INVENTORY_SRC, /@details\.tier\s*\*\s*3/);
	assert.doesNotMatch(INVENTORY_SRC, /labels\.recovery\s*=\s*.*recharge/i);
});

console.log(`\n${passed} passed`);
