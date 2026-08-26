#!/usr/bin/env node
/**
 * Offline tests: Recover Power combined multi-pool allocation + DialogV2 contract.
 * Legacy Central-first helpers remain covered for Regen isolation.
 */
import assert from "node:assert/strict";
import {
	STARSHIP_POWER_DIE_SLOTS,
	getStarshipPowerRecoverySlots,
	getStarshipPowerRecoverySummary
} from "../scripts/starship-data.mjs";
import {
	STARSHIP_POWER_RECOVERY_AMOUNT_FIELD,
	STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_LEGACY,
	STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT,
	buildStarshipCombinedPowerRecoveryDialogContent,
	buildStarshipPowerRecoveryUpdatesFromAllocations,
	buildStarshipPowerRecoveryValueUpdate,
	clampStarshipPowerRecoveryAmount,
	coerceStarshipCombinedPowerRecoveryDialogResult,
	coerceStarshipPowerAllocationDialogResult,
	coerceStarshipPowerRecoveryManualDialogResult,
	normalizeStarshipPowerPoolAllocationQty,
	normalizeStarshipPowerRecoveryAmount,
	planStarshipPowerDiceRecovery,
	qtyFieldNameForPowerPool,
	readStarshipCombinedPowerRecoveryFromForm,
	selectFieldNameForPowerPool,
	starshipCombinedPowerRecoveryDialogCallback,
	validateStarshipCombinedPowerRecoveryAllocation
} from "../scripts/starship-power-recovery.mjs";
import { notifyOrSkipStarshipPowerRecoveryFullCapacity } from "../scripts/starship-power-recovery-notify.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

globalThis.CONFIG = { SW5E: { powerDieSlots: Object.fromEntries(STARSHIP_POWER_DIE_SLOTS.map(k => [k, k])) } };
globalThis.game = {
	i18n: {
		localize: key => key,
		format: (key, data = {}) => Object.entries(data).reduce(
			(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
			key
		)
	}
};
const warnings = [];
globalThis.ui = { notifications: { warn: msg => warnings.push(String(msg)) } };

function mockActor(power) {
	return {
		type: "vehicle",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: { attributes: { power: { die: "d8", ...power } } }
				},
				starship: { ui: {}, powerPeak: {} }
			}
		},
		system: { attributes: { power: { die: "d8", ...power } } },
		items: { contents: [] }
	};
}

function knownStateActor() {
	return mockActor({
		central: { value: 1, max: 4 },
		comms: { value: 0, max: 0 },
		engines: { value: 0, max: 0 },
		sensors: { value: 0, max: 0 },
		shields: { value: 7, max: 15 },
		weapons: { value: 0, max: 0 }
	});
}

function knownSlots() {
	return getStarshipPowerRecoverySlots(knownStateActor());
}

function mockForm(fields) {
	const inputs = {};
	for ( const [name, value] of Object.entries(fields) ) {
		inputs[name] = typeof value === "object" && value !== null
			? value
			: { value, name, checked: false, disabled: false };
	}
	return {
		tagName: "FORM",
		elements: { namedItem: name => inputs[name] ?? null },
		querySelector: sel => {
			const m = sel.match(/\[name=['"]([^'"]+)['"]\]/);
			return m ? (inputs[m[1]] ?? null) : null;
		}
	};
}

function allocationForm({ recovered="1", selected={}, quantities={} } = {}) {
	const fields = { recovered };
	for ( const key of STARSHIP_POWER_DIE_SLOTS ) {
		fields[selectFieldNameForPowerPool(key)] = {
			name: selectFieldNameForPowerPool(key),
			checked: selected[key] === true,
			disabled: selected[`${key}Disabled`] === true,
			value: "on"
		};
		fields[qtyFieldNameForPowerPool(key)] = {
			name: qtyFieldNameForPowerPool(key),
			value: String(quantities[key] ?? 0),
			disabled: selected[key] !== true
		};
	}
	return mockForm(fields);
}

/* —— A. INITIAL STATE / CONTENT —— */

test("A: six pool rows; unchecked; qty 0 disabled; no current/max/headroom/bars/helpers", () => {
	const slots = knownSlots();
	const html = buildStarshipCombinedPowerRecoveryDialogContent({
		slots,
		manualAmountEditable: true,
		fixedRecovered: null
	});
	assert.equal(STARSHIP_POWER_DIE_SLOTS.length, 6);
	for ( const key of STARSHIP_POWER_DIE_SLOTS ) {
		assert.match(html, new RegExp(`data-sw5e-power-pool-select="${key}"`));
		assert.match(html, new RegExp(`data-sw5e-power-pool-qty="${key}"`));
		assert.match(html, new RegExp(`name="qty-${key}"[^>]*value="0"`));
		assert.match(html, new RegExp(`name="qty-${key}"[^>]*disabled`));
	}
	assert.doesNotMatch(html, /\bCurrent\b/);
	assert.doesNotMatch(html, /\bMaximum\b/);
	assert.doesNotMatch(html, /\bMax\b/);
	assert.doesNotMatch(html, /1\s*\/\s*4/);
	assert.doesNotMatch(html, /7\s*\/\s*15/);
	assert.doesNotMatch(html, /headroom/i);
	assert.doesNotMatch(html, /power-bar|meter|progress/i);
	assert.match(html, /name="select-comms"[^>]*disabled/);
	assert.match(html, /name="select-engines"[^>]*disabled/);
	assert.match(html, /name="select-sensors"[^>]*disabled/);
	assert.match(html, /name="select-weapons"[^>]*disabled/);
	assert.doesNotMatch(html, /name="select-central"[^>]*disabled/);
	assert.doesNotMatch(html, /name="select-shields"[^>]*disabled/);
	assert.doesNotMatch(html, /checked/);
});

test("A: formula path shows fixed recovered total; no editable recovered input", () => {
	const html = buildStarshipCombinedPowerRecoveryDialogContent({
		slots: knownSlots(),
		manualAmountEditable: false,
		fixedRecovered: 4
	});
	assert.match(html, /sw5e-starship-power-recovery-available-fixed[^>]*>4</);
	assert.doesNotMatch(html, /name="recovered"/);
});

/* —— B. CHECKBOX / FORM READ —— */

test("B: form read; unchecked qty forced conceptually; central not preselected", () => {
	const form = allocationForm({
		recovered: "4",
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 1 }
	});
	const parsed = readStarshipCombinedPowerRecoveryFromForm(form, { manualAmountEditable: true });
	assert.equal(parsed.selected.central, true);
	assert.equal(parsed.selected.shields, true);
	assert.equal(parsed.selected.comms, false);
	assert.equal(parsed.quantities.central, "3");
	assert.equal(parsed.quantities.shields, "1");
});

/* —— C. MANUAL AMOUNT —— */

test("C: normalize recovered amount + qty; action strings rejected", () => {
	assert.equal(normalizeStarshipPowerRecoveryAmount(1), 1);
	assert.equal(normalizeStarshipPowerRecoveryAmount("4"), 4);
	assert.equal(normalizeStarshipPowerRecoveryAmount(""), null);
	assert.equal(normalizeStarshipPowerRecoveryAmount("0"), null);
	assert.equal(normalizeStarshipPowerRecoveryAmount("-1"), null);
	assert.equal(normalizeStarshipPowerRecoveryAmount("abc"), null);
	assert.equal(normalizeStarshipPowerRecoveryAmount("recover"), null);
	assert.equal(normalizeStarshipPowerRecoveryAmount("3.9"), 3);
	assert.equal(normalizeStarshipPowerPoolAllocationQty("0"), 0);
	assert.equal(normalizeStarshipPowerPoolAllocationQty("-1"), null);
	assert.equal(normalizeStarshipPowerPoolAllocationQty("2.8"), 2);
	assert.equal(coerceStarshipCombinedPowerRecoveryDialogResult("recover"), null);
	assert.equal(coerceStarshipCombinedPowerRecoveryDialogResult(null), null);
	assert.equal(coerceStarshipPowerRecoveryManualDialogResult("recover"), null);
});

/* —— D/E/F. VALIDATION + KNOWN EXAMPLES —— */

test("F: recovered 1 → Central 1 or Shields 1 ok; both 0 invalid", () => {
	const slots = knownSlots();
	assert.equal(getStarshipPowerRecoverySummary(knownStateActor()).totalMissing, 11);

	const c = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { central: true },
		quantities: { central: 1 }
	});
	assert.equal(c.ok, true);
	assert.equal(c.allocations.central, 1);

	const s = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { shields: true },
		quantities: { shields: 1 }
	});
	assert.equal(s.ok, true);
	assert.equal(s.allocations.shields, 1);

	const none = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 0, shields: 0 }
	});
	assert.equal(none.ok, false);
	assert.equal(none.code, "underAllocated");
});

test("F: recovered 4 multi-pool valid and invalid cases", () => {
	const slots = knownSlots();

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 1 }
	}).ok, true);

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { shields: true },
		quantities: { shields: 4 }
	}).ok, true);

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 2, shields: 2 }
	}).ok, true);

	const overCentral = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { central: true },
		quantities: { central: 4 }
	});
	assert.equal(overCentral.ok, false);
	assert.equal(overCentral.code, "exceedsHeadroom");
	assert.equal(overCentral.headroom, 3);

	const under = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 1, shields: 1 }
	});
	assert.equal(under.ok, false);
	assert.equal(under.code, "underAllocated");
	assert.equal(under.remaining, 2);

	const over = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 4,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 2 }
	});
	assert.equal(over.ok, false);
	assert.equal(over.code, "overAllocated");
});

test("F: recovered 11 fills Central+Shields", () => {
	const ok = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 11,
		slots: knownSlots(),
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 8 }
	});
	assert.equal(ok.ok, true);
	assert.equal(ok.recovered, 11);
});

test("D: disabled/unchecked nonzero rejected; negative/non-numeric rejected", () => {
	const slots = knownSlots();
	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: {},
		quantities: { central: 1 }
	}).code, "uncheckedNonzero");

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { comms: true },
		quantities: { comms: 1 }
	}).code, "ineligibleNonzero");

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { central: true },
		quantities: { central: -1 }
	}).code, "invalidQty");

	assert.equal(validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 1,
		slots,
		selected: { central: true },
		quantities: { central: "abc" }
	}).code, "invalidQty");
});

test("E: amount above total headroom clamps recoverable; fill-all path", () => {
	const slots = knownSlots();
	assert.equal(clampStarshipPowerRecoveryAmount(20, 11), 11);
	const ok = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: 20,
		slots,
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 8 }
	});
	assert.equal(ok.ok, true);
	assert.equal(ok.recovered, 11);
});

/* —— G. PERSISTENCE HELPERS —— */

test("G: updates only positive allocations; dual-write values; no max overwrite", () => {
	const slots = knownSlots();
	const updates = buildStarshipPowerRecoveryUpdatesFromAllocations(slots, {
		central: 3,
		shields: 1,
		comms: 0
	});
	assert.deepEqual(updates, { central: 4, shields: 8 });
	const payload = buildStarshipPowerRecoveryValueUpdate(updates);
	assert.equal(payload["system.attributes.power.central.value"], 4);
	assert.equal(payload["flags.sw5e.legacyStarshipActor.system.attributes.power.central.value"], 4);
	assert.equal(payload["system.attributes.power.shields.value"], 8);
	assert.equal(payload["system.attributes.power.central.max"], undefined);
	assert.equal(payload["system.attributes.power.shields.max"], undefined);
});

/* —— H/I. DIALOG CALLBACK CONTRACT —— */

test("I: combined callback uses button.form; returns normalized object; rejects action string", () => {
	warnings.length = 0;
	const form = allocationForm({
		recovered: "4",
		selected: { central: true, shields: true },
		quantities: { central: 3, shields: 1 }
	});
	const result = starshipCombinedPowerRecoveryDialogCallback({}, { form }, {}, {
		slots: knownSlots(),
		manualAmountEditable: true,
		fixedRecovered: null
	});
	assert.equal(result.ok, true);
	assert.equal(result.recovered, 4);
	assert.equal(result.allocations.central, 3);
	assert.equal(result.allocations.shields, 1);
	assert.deepEqual(
		coerceStarshipCombinedPowerRecoveryDialogResult(result),
		result
	);
	assert.equal(coerceStarshipCombinedPowerRecoveryDialogResult("recover"), null);

	warnings.length = 0;
	const bad = starshipCombinedPowerRecoveryDialogCallback({}, { form: allocationForm({
		recovered: "4",
		selected: { central: true },
		quantities: { central: 1 }
	}) }, {}, { slots: knownSlots(), manualAmountEditable: true });
	assert.equal(bad, false);
	assert.ok(warnings.length >= 1);
});

test("I: formula callback uses fixedRecovered; ignores missing recovered field", () => {
	const form = allocationForm({
		selected: { shields: true },
		quantities: { shields: 4 }
	});
	const result = starshipCombinedPowerRecoveryDialogCallback({}, { form }, {}, {
		slots: knownSlots(),
		manualAmountEditable: false,
		fixedRecovered: 4
	});
	assert.equal(result.ok, true);
	assert.equal(result.allocations.shields, 4);
});

/* —— LEGACY + REGEN POLICY —— */

test("legacy Central-first planner preserved for Regen isolation", () => {
	assert.equal(STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT, "prompt");
	assert.equal(STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_LEGACY, "legacyCentralFirst");
	const plan = planStarshipPowerDiceRecovery(knownSlots(), 4);
	assert.equal(plan.mode, "central-then-allocate");
	assert.equal(plan.updates.central, 4);
	assert.equal(plan.toAllocate, 1);
	assert.equal(coerceStarshipPowerAllocationDialogResult("allocate", ["shields"]), null);
});

test("full-capacity notify policy: explicit warn; regen quiet", () => {
	warnings.length = 0;
	notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity: true });
	assert.equal(warnings.length, 1);
	warnings.length = 0;
	notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity: false });
	assert.equal(warnings.length, 0);
});

test("field name constant unchanged", () => {
	assert.equal(STARSHIP_POWER_RECOVERY_AMOUNT_FIELD, "recovered");
});

console.log(`\n${passed} passed`);
