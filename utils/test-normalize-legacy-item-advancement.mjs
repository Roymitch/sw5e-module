#!/usr/bin/env node
/**
 * P8B-01..05 — Offline regression for normalizeLegacyItemAdvancement.
 * Pure-function coverage only; does not prove Foundry runtime advancement UI.
 */
import assert from "node:assert/strict";
import { normalizeLegacyItemAdvancement } from "../scripts/dnd5e-source-normalization.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function clone(value) {
	return structuredClone(value);
}

check("P8B-01: legacy array becomes object and second call is idempotent", () => {
	const item = {
		_id: "ItemAdv000000001",
		type: "class",
		system: {
			advancement: [
				{
					_id: "AdvId00000000001",
					type: "ItemGrant",
					configuration: { pool: ["languages:standard:basic"] },
					value: {}
				}
			]
		}
	};
	const first = normalizeLegacyItemAdvancement(item);
	assert.equal(first, true);
	assert.equal(Array.isArray(item.system.advancement), false);
	assert.equal(typeof item.system.advancement, "object");
	assert.equal(Object.keys(item.system.advancement).length, 1);
	assert.equal(item.system.advancement.AdvId00000000001.type, "ItemGrant");
	const snapshot = clone(item.system.advancement);
	const second = normalizeLegacyItemAdvancement(item);
	assert.equal(second, false);
	assert.deepEqual(item.system.advancement, snapshot);
});

check("P8B-02: retained object keys equal each entry _id", () => {
	const item = {
		system: {
			advancement: [
				{ _id: "KeyA000000000001", type: "ItemGrant", configuration: {}, value: {} },
				{ _id: "KeyB000000000002", type: "ScaleValue", configuration: {}, value: {} }
			]
		}
	};
	normalizeLegacyItemAdvancement(item);
	for ( const [key, entry] of Object.entries(item.system.advancement) ) {
		assert.equal(key, entry._id);
	}
});

check("P8B-03: duplicate _id last-write wins; no fabricated IDs; single key", () => {
	const first = { _id: "DupId00000000001", type: "ItemGrant", configuration: { pool: ["a"] }, value: {} };
	const second = { _id: "DupId00000000001", type: "ItemGrant", configuration: { pool: ["b"] }, value: {} };
	const item = { system: { advancement: [first, second] } };
	normalizeLegacyItemAdvancement(item);
	const keys = Object.keys(item.system.advancement);
	assert.deepEqual(keys, ["DupId00000000001"]);
	assert.deepEqual(item.system.advancement.DupId00000000001.configuration.pool, ["b"]);
	assert.equal(Object.values(item.system.advancement).every(e => typeof e._id === "string" && e._id), true);
});

check("P8B-04: missing or empty _id entries are omitted; no ID fabricated", () => {
	const item = {
		system: {
			advancement: [
				{ type: "ItemGrant", configuration: {}, value: {} },
				{ _id: "", type: "ItemGrant", configuration: {}, value: {} },
				{ _id: "KeepMe0000000001", type: "ItemGrant", configuration: { keep: true }, value: {} }
			]
		}
	};
	normalizeLegacyItemAdvancement(item);
	const keys = Object.keys(item.system.advancement);
	assert.deepEqual(keys, ["KeepMe0000000001"]);
	assert.equal(item.system.advancement.KeepMe0000000001.configuration.keep, true);
	assert.equal(keys.every(k => k.length > 0), true);
});

check("P8B-05: unknown advancement type and payload are preserved", () => {
	const item = {
		system: {
			advancement: [
				{
					_id: "UnkType000000001",
					type: "Sw5eSyntheticUnknownType",
					configuration: { customPayload: { nested: 7 } },
					value: { retained: true },
					extraField: "keep-me"
				}
			]
		}
	};
	normalizeLegacyItemAdvancement(item);
	const entry = item.system.advancement.UnkType000000001;
	assert.equal(entry.type, "Sw5eSyntheticUnknownType");
	assert.deepEqual(entry.configuration.customPayload, { nested: 7 });
	assert.deepEqual(entry.value, { retained: true });
	assert.equal(entry.extraField, "keep-me");
});

check("non-object array entries are skipped without throwing", () => {
	const item = {
		system: {
			advancement: [
				null,
				"string",
				42,
				{ _id: "OnlyObj000000001", type: "ItemGrant", configuration: {}, value: {} }
			]
		}
	};
	assert.equal(normalizeLegacyItemAdvancement(item), true);
	assert.deepEqual(Object.keys(item.system.advancement), ["OnlyObj000000001"]);
});

check("absent advancement field is a no-op", () => {
	const item = { system: { description: { value: "" } } };
	assert.equal(normalizeLegacyItemAdvancement(item), false);
	assert.equal("advancement" in item.system, false);
});

console.log(`\n${passed} checks passed (P8B-01..05)`);
