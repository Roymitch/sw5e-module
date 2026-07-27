#!/usr/bin/env node
/**
 * Offline tests: Starship Feature recovery terminology (dropdown + Features column).
 * Display-only; native period values lr/sr/recharge unchanged.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const INVENTORY_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-sheet-inventory.mjs"), "utf8");
const HELPER_SRC = fs.readFileSync(path.join(ROOT, "scripts/starship-feature-recovery-labels.mjs"), "utf8");
const PATCH_SRC = fs.readFileSync(path.join(ROOT, "scripts/patch/starship-feature-recovery-labels.mjs"), "utf8");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "templates/inventory/columns/starship-recovery.hbs"), "utf8");
const MODULE_SRC = fs.readFileSync(path.join(ROOT, "scripts/module.mjs"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

globalThis.foundry = {
	applications: { api: { DialogV2: class DialogV2 {} } },
	utils: {
		deepClone: value => structuredClone(value),
		isEmpty: value => {
			if ( value == null ) return true;
			if ( typeof value !== "object" ) return !value;
			if ( Array.isArray(value) ) return value.length === 0;
			return Object.keys(value).length === 0;
		},
		mergeObject: (a, b) => ({ ...a, ...b })
	}
};
globalThis.game = {
	i18n: {
		localize: key => EN[key] ?? key,
		getListFormatter: () => ({ format: parts => parts.join(", ") })
	}
};
globalThis.CONFIG = {
	DND5E: {
		limitedUsePeriods: {
			lr: { label: "Long Rest", abbreviation: "LR" },
			sr: { label: "Short Rest", abbreviation: "SR" },
			day: { label: "Day", abbreviation: "Day" },
			dawn: { label: "Dawn", abbreviation: "Dawn" },
			dusk: { label: "Dusk", abbreviation: "Dusk" },
			initiative: { label: "Initiative", abbreviation: "Init" },
			turnStart: { label: "Start of Turn", abbreviation: "SoT" },
			turnEnd: { label: "End of Turn", abbreviation: "EoT" },
			turn: { label: "Each Turn", abbreviation: "Turn" }
		}
	},
	Item: { typeLabels: {} }
};
globalThis.libWrapper = { register() {} };
globalThis.Hooks = { on() {} };
globalThis.customElements = { get() { return null; } };

const {
	isSw5eStarshipFeatureItem,
	cloneStarshipRecoveryPeriodChoices,
	buildStarshipRecoveryCompactLabel,
	getStarshipRecoveryPeriodAbbreviation,
	STARSHIP_RECOVERY_PERIOD_LR,
	STARSHIP_RECOVERY_PERIOD_SR,
	STARSHIP_RECOVERY_PERIOD_RECHARGE
} = await import(pathToFileURL(path.join(ROOT, "scripts/starship-feature-recovery-labels.mjs")).href);

const {
	getStarshipFeaturesFeatColumns,
	applyStarshipFeatureRecoveryRowContext
} = await import(pathToFileURL(path.join(ROOT, "scripts/patch/starship-feature-recovery-labels.mjs")).href);

const { filterStarshipCargoContext } = await import(
	pathToFileURL(path.join(ROOT, "scripts/patch/starship-sheet-inventory.mjs")).href
);

function nativeRecoveryOptions() {
	return [
		{ value: "lr", label: "Long Rest", group: "Time" },
		{ value: "sr", label: "Short Rest", group: "Time" },
		{ value: "day", label: "Day", group: "Time" },
		{ value: "dawn", label: "Dawn", group: "Time" },
		{ value: "dusk", label: "Dusk", group: "Time" },
		{ value: "initiative", label: "Initiative", group: "Special" },
		{ value: "turnStart", label: "Start of Turn", group: "Combat" },
		{ value: "turnEnd", label: "End of Turn", group: "Combat" },
		{ value: "turn", label: "Each Turn", group: "Combat" },
		{ value: "recharge", label: "Recharge" }
	];
}

test("localization keys exist for dropdown and abbreviations", () => {
	assert.equal(EN["SW5E.Starship.RecoveryPeriod.RefittingLongRest"], "Refitting (Long Rest)");
	assert.equal(EN["SW5E.Starship.RecoveryPeriod.RechargeShortRest"], "Recharge (Short Rest)");
	assert.equal(EN["SW5E.Starship.RecoveryAbbreviation.Refitting"], "RF");
	assert.equal(EN["SW5E.Starship.RecoveryAbbreviation.Recharge"], "RC");
});

test("native period values remain lr / sr / recharge", () => {
	assert.equal(STARSHIP_RECOVERY_PERIOD_LR, "lr");
	assert.equal(STARSHIP_RECOVERY_PERIOD_SR, "sr");
	assert.equal(STARSHIP_RECOVERY_PERIOD_RECHARGE, "recharge");
});

test("Starship Feature classification uses Item type/value/pack, not parent Actor", () => {
	assert.equal(isSw5eStarshipFeatureItem({ type: "feat", system: { type: { value: "starship" } } }), true);
	assert.equal(isSw5eStarshipFeatureItem({ type: "feat", system: { type: { value: "starshipAction" } } }), true);
	assert.equal(isSw5eStarshipFeatureItem({
		type: "feat",
		system: { type: { value: "" } },
		flags: { core: { sourceId: "Compendium.sw5e-module.starshipfeatures.Item.abc" } }
	}), true);
	assert.equal(isSw5eStarshipFeatureItem({
		type: "feat",
		system: { type: { value: "starship" } },
		pack: "sw5e-module.starshipfeatures"
	}), true);
	assert.equal(isSw5eStarshipFeatureItem({ type: "feat", system: { type: { value: "class" } } }), false);
	assert.equal(isSw5eStarshipFeatureItem({ type: "feat", system: { type: { value: "" } } }), false);
	assert.equal(isSw5eStarshipFeatureItem({ type: "weapon", system: { type: { value: "starship" } } }), false);
});

test("compendium parentless Starship Feature qualifies via pack or type", () => {
	assert.equal(isSw5eStarshipFeatureItem({
		type: "feat",
		pack: "sw5e-module.starshipfeatures",
		system: { type: { value: "starship" } }
	}), true);
	assert.equal(isSw5eStarshipFeatureItem({
		type: "feat",
		pack: "sw5e-module.starshipfeatures",
		system: { type: { value: "" } }
	}), true);
});

test("dropdown clones choices and remaps only lr/sr labels", () => {
	const native = nativeRecoveryOptions();
	const nativeSnapshot = structuredClone(native);
	const cloned = cloneStarshipRecoveryPeriodChoices(native);

	assert.notEqual(cloned, native);
	assert.deepEqual(native, nativeSnapshot, "global/native options must remain unchanged");
	assert.equal(cloned.length, native.length);
	assert.deepEqual(cloned.map(o => o.value), native.map(o => o.value));
	assert.deepEqual(cloned.map(o => o.group), native.map(o => o.group));

	const lr = cloned.find(o => o.value === "lr");
	const sr = cloned.find(o => o.value === "sr");
	const recharge = cloned.find(o => o.value === "recharge");
	const day = cloned.find(o => o.value === "day");

	assert.equal(lr.label, "Refitting (Long Rest)");
	assert.equal(sr.label, "Recharge (Short Rest)");
	assert.equal(recharge.label, "Recharge");
	assert.equal(day.label, "Day");
	assert.equal(native.find(o => o.value === "lr").label, "Long Rest");
	assert.equal(native.find(o => o.value === "sr").label, "Short Rest");
});

test("compact labels: LR→RF, SR→RC, recharge omitted, other periods native", () => {
	assert.equal(getStarshipRecoveryPeriodAbbreviation("lr"), "RF");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("sr"), "RC");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("recharge"), null);
	assert.equal(getStarshipRecoveryPeriodAbbreviation("day"), "Day");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("dawn"), "Dawn");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("dusk"), "Dusk");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("initiative"), "Init");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("turnStart"), "SoT");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("turnEnd"), "EoT");
	assert.equal(getStarshipRecoveryPeriodAbbreviation("turn"), "Turn");
});

test("Features compact label builds from recovery periods without mutating item labels", () => {
	const item = {
		type: "feat",
		system: {
			type: { value: "starship" },
			uses: {
				recovery: [
					{ period: "lr", type: "recoverAll" },
					{ period: "sr", type: "recoverAll" }
				]
			}
		},
		labels: { recovery: "LR, SR", recharge: "" }
	};
	const label = buildStarshipRecoveryCompactLabel(item);
	assert.equal(label, "RF, RC");
	assert.equal(item.labels.recovery, "LR, SR");
});

test("native Recharge-only recovery yields empty compact Recovery label", () => {
	const item = {
		system: {
			uses: { recovery: [{ period: "recharge", formula: "6", type: "recoverAll" }] }
		}
	};
	assert.equal(buildStarshipRecoveryCompactLabel(item), "");
});

test("mixed recharge + long rest keeps RF and omits recharge from Recovery column", () => {
	const item = {
		system: {
			uses: {
				recovery: [
					{ period: "recharge", formula: "6", type: "recoverAll" },
					{ period: "lr", type: "recoverAll" }
				]
			}
		}
	};
	assert.equal(buildStarshipRecoveryCompactLabel(item), "RF");
});

test("row context sets starshipRecoveryLabel only for Starship Features", () => {
	const starship = {
		type: "feat",
		system: { type: { value: "starship" }, uses: { recovery: [{ period: "sr", type: "recoverAll" }] } }
	};
	const character = {
		type: "feat",
		system: { type: { value: "class" }, uses: { recovery: [{ period: "sr", type: "recoverAll" }] } }
	};
	const starshipCtx = {};
	const characterCtx = {};
	applyStarshipFeatureRecoveryRowContext(starship, starshipCtx);
	applyStarshipFeatureRecoveryRowContext(character, characterCtx);
	assert.equal(starshipCtx.starshipRecoveryLabel, "RC");
	assert.equal(characterCtx.starshipRecoveryLabel, undefined);
});

test("Features columns use custom recovery template path", () => {
	const cols = getStarshipFeaturesFeatColumns();
	assert.equal(cols[0].id, "uses");
	assert.equal(cols[1].id, "recovery");
	assert.match(cols[1].template, /starship-recovery\.hbs$/);
	assert.equal(cols[2], "controls");
});

test("recovery template prefers ctx.starshipRecoveryLabel then falls back to entry.labels.recovery", () => {
	assert.match(TEMPLATE, /ctx\.starshipRecoveryLabel/);
	assert.match(TEMPLATE, /entry\.labels\.recovery/);
	assert.doesNotMatch(TEMPLATE, /labels\.recharge/);
});

test("Item sheet wrapper remaps recoveryPeriods without CONFIG mutation", () => {
	assert.match(PATCH_SRC, /_prepareDetailsContext/);
	assert.match(PATCH_SRC, /cloneStarshipRecoveryPeriodChoices/);
	assert.match(PATCH_SRC, /isSw5eStarshipFeatureItem/);
	assert.doesNotMatch(HELPER_SRC, /CONFIG\.DND5E\.limitedUsePeriods/);
	assert.match(MODULE_SRC, /patchStarshipFeatureRecoveryLabels/);
});

test("Features Uses itemContext preservation remains intact", () => {
	assert.doesNotMatch(
		INVENTORY_SRC,
		/for\s*\(\s*const itemId of hiddenIds\s*\)\s*delete itemContext\[itemId\]/
	);
	const context = {
		items: [{ id: "feat1" }],
		sections: [{ items: [{ id: "feat1" }] }],
		features: [{ items: [{ id: "feat1" }] }],
		itemContext: {
			feat1: { uses: { hasUses: true, hasRecharge: true, max: 9, value: 9 } }
		}
	};
	filterStarshipCargoContext(context, new Set(["feat1"]));
	assert.equal(context.items.length, 0);
	assert.ok(context.itemContext.feat1);
	assert.equal(context.itemContext.feat1.uses.max, 9);
});

test("stored recovery selection mapping is display-only (values unchanged)", () => {
	const cloned = cloneStarshipRecoveryPeriodChoices(nativeRecoveryOptions());
	assert.equal(cloned.find(o => o.label === "Refitting (Long Rest)").value, "lr");
	assert.equal(cloned.find(o => o.label === "Recharge (Short Rest)").value, "sr");
	assert.equal(cloned.find(o => o.label === "Recharge").value, "recharge");
});

test("applyStarshipFeatureRecoveryRowContext wired into _prepareItemFeature wrapper", () => {
	assert.match(INVENTORY_SRC, /applyStarshipFeatureRecoveryRowContext\(item, ctx\)/);
	assert.match(INVENTORY_SRC, /getStarshipFeaturesFeatColumns\(\)/);
});

console.log(`\n${passed} passed`);
