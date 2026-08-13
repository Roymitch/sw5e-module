#!/usr/bin/env node
/**
 * Offline tests: Foundry 13/14 Active Effect change-collection access during SW5e migration.
 */
import assert from "node:assert/strict";
import {
	LEGACY_SUPERIORITY_EFFECT_KEY_MAP,
	cleanEffectAdvancementSupplantedChanges,
	getMigratableEffectChanges,
	remapSuperiorityEffectKeys
} from "../scripts/effect-change-collection.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const parentWithAdvancement = { system: { advancement: [] } };
const keepChange = { key: "system.abilities.dex.value", mode: 2, value: "2" };
const blacklistedChange = { key: "system.details.species", mode: 2, value: "human" };
const superiorityChange = { key: "system.attributes.super.die", mode: 2, value: "1d8" };

function applyChangeUpdate(effect, update) {
	if ( Object.hasOwn(update, "changes") ) effect.changes = update.changes;
	if ( Object.hasOwn(update, "system.changes") ) {
		effect.system ??= {};
		effect.system.changes = update["system.changes"];
	}
}

function migrateTwice(effect, parent) {
	const first = {};
	remapSuperiorityEffectKeys(effect, first);
	cleanEffectAdvancementSupplantedChanges(effect, first, parent);
	applyChangeUpdate(effect, first);
	const second = {};
	remapSuperiorityEffectKeys(effect, second);
	cleanEffectAdvancementSupplantedChanges(effect, second, parent);
	applyChangeUpdate(effect, second);
	return { first, second };
}

test("omitted changes: no throw, no fabricated changes", () => {
	const effect = { _id: "e1", name: "Empty" };
	const resolved = getMigratableEffectChanges(effect);
	assert.equal(resolved, null);
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update, {});
	assert.equal("changes" in effect, false);
	assert.equal(effect.system, undefined);
});

test("changes: undefined: no throw", () => {
	const effect = { changes: undefined, system: {} };
	assert.equal(getMigratableEffectChanges(effect), null);
	assert.deepEqual(cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement), {});
	assert.deepEqual(remapSuperiorityEffectKeys(effect, {}), {});
});

test("changes: []: no throw, remains empty", () => {
	const effect = { changes: [] };
	const resolved = getMigratableEffectChanges(effect);
	assert.equal(resolved.updateKey, "changes");
	assert.equal(resolved.changes.length, 0);
	assert.deepEqual(cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement), {});
	assert.deepEqual(effect.changes, []);
});

test("top-level unrelated valid entries are preserved", () => {
	const effect = { changes: [{ ...keepChange }] };
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update, {});
	assert.equal(effect.changes[0].key, "system.abilities.dex.value");
});

test("top-level blacklisted key is removed via changes update", () => {
	const effect = { changes: [{ ...keepChange }, { ...blacklistedChange }] };
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update.changes.map(c => c.key), ["system.abilities.dex.value"]);
	assert.equal(update["system.changes"], undefined);
});

test("top-level superiority key is remapped via changes update", () => {
	const effect = { changes: [{ ...superiorityChange }, { ...keepChange }] };
	const update = remapSuperiorityEffectKeys(effect, {});
	assert.equal(update.changes[0].key, LEGACY_SUPERIORITY_EFFECT_KEY_MAP["system.attributes.super.die"]);
	assert.equal(update.changes[1].key, "system.abilities.dex.value");
	assert.equal(update["system.changes"], undefined);
});

test("system.changes: unrelated entries preserved; update writes system.changes", () => {
	const effect = { system: { changes: [{ ...keepChange }] } };
	assert.equal(getMigratableEffectChanges(effect).updateKey, "system.changes");
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update, {});
	assert.equal(effect.system.changes[0].key, "system.abilities.dex.value");
});

test("system.changes: blacklisted key removed without inventing top-level changes", () => {
	const effect = { system: { changes: [{ ...keepChange }, { ...blacklistedChange }] } };
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update["system.changes"].map(c => c.key), ["system.abilities.dex.value"]);
	assert.equal(update.changes, undefined);
});

test("system.changes: superiority key remapped on system.changes", () => {
	const effect = { system: { changes: [{ ...superiorityChange }] } };
	const update = remapSuperiorityEffectKeys(effect, {});
	assert.equal(update["system.changes"][0].key, "system.superiority.die");
	assert.equal(update.changes, undefined);
});

test("malformed non-array changes: skip without inventing data", () => {
	const effect = { changes: {}, system: { changes: { key: "nope" } } };
	assert.equal(getMigratableEffectChanges(effect), null);
	assert.deepEqual(cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement), {});
	assert.deepEqual(effect.changes, {});
});

test("prefer enumerable top-level changes when both arrays exist", () => {
	const effect = {
		changes: [{ ...blacklistedChange }],
		system: { changes: [{ ...keepChange }] }
	};
	const resolved = getMigratableEffectChanges(effect);
	assert.equal(resolved.updateKey, "changes");
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update.changes, []);
	assert.equal(effect.system.changes[0].key, "system.abilities.dex.value");
});

test("no parent advancement: cleaner is a no-op even with blacklisted keys", () => {
	const effect = { changes: [{ ...blacklistedChange }] };
	assert.deepEqual(cleanEffectAdvancementSupplantedChanges(effect, {}, { system: {} }), {});
	assert.equal(effect.changes.length, 1);
});

test("embedded Item-shaped parent with advancement still cleans", () => {
	const item = { _id: "i1", name: "Small Starship", type: "feat", system: { advancement: [{}] } };
	const effect = { _id: "ae1", name: "Small Starship", system: { changes: [{ ...blacklistedChange }, { ...keepChange }] } };
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, item);
	assert.deepEqual(update["system.changes"].map(c => c.key), ["system.abilities.dex.value"]);
});

test("Actor-level effect with no advancement field is not cleaned", () => {
	const actor = { _id: "a1", name: "Hero", type: "character", system: {} };
	const effect = { changes: [{ ...blacklistedChange }] };
	assert.deepEqual(cleanEffectAdvancementSupplantedChanges(effect, {}, actor), {});
});

test("repeated migration is idempotent and does not duplicate", () => {
	const effect = {
		system: {
			changes: [{ ...superiorityChange }, { ...blacklistedChange }, { ...keepChange }]
		}
	};
	const { first, second } = migrateTwice(effect, parentWithAdvancement);
	assert.equal(first["system.changes"].length, 2);
	assert.equal(first["system.changes"][0].key, "system.superiority.die");
	assert.deepEqual(second, {});
	assert.equal(effect.system.changes.length, 2);
});

test("shim-like getter: Array.isArray(changes) wins and writes top-level changes", () => {
	const inner = [{ ...blacklistedChange }, { ...keepChange }];
	const effect = { system: { changes: inner } };
	Object.defineProperty(effect, "changes", {
		get: () => effect.system.changes,
		set: value => { effect.system.changes = value; },
		enumerable: false,
		configurable: true
	});
	const resolved = getMigratableEffectChanges(effect);
	assert.equal(resolved.updateKey, "changes");
	const update = cleanEffectAdvancementSupplantedChanges(effect, {}, parentWithAdvancement);
	assert.deepEqual(update.changes.map(c => c.key), ["system.abilities.dex.value"]);
});

console.log(`\n${passed} tests passed`);
