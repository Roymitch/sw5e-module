/**
 * Offline tests for Powers Known counting / max resolution and pack powercasting preservation.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	countOwnedPowersKnown,
	powerHasFreeLearn,
	resolvePreparedPowersKnownMax
} from "../scripts/powercasting-known.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

globalThis.CONFIG = {
	DND5E: {
		powerCasting: {
			force: { schools: { lgt: {}, uni: {}, drk: {} } },
			tech: { schools: { tec: {} } }
		}
	}
};

function makePower({ id, name, school, freeLearn = false, activities = 1 }) {
	const props = new Set(freeLearn ? ["freeLearn"] : []);
	const activityMap = {};
	for ( let i = 0; i < activities; i++ ) activityMap[`act${i}`] = { _id: `act${i}` };
	return {
		id,
		_id: id,
		name,
		type: "spell",
		system: {
			school,
			properties: props,
			activities: activityMap
		}
	};
}

function makeActor(spells) {
	return {
		itemTypes: { spell: spells },
		items: spells
	};
}

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`PASS ${name}`);
	} catch (err) {
		console.error(`FAIL ${name}`);
		console.error(err);
		process.exitCode = 1;
	}
}

test("freeLearn property detection", () => {
	assert.equal(powerHasFreeLearn(makePower({ id: "1", name: "A", school: "lgt", freeLearn: true })), true);
	assert.equal(powerHasFreeLearn(makePower({ id: "2", name: "B", school: "lgt", freeLearn: false })), false);
});

test("counts Force and Tech independently", () => {
	const actor = makeActor([
		makePower({ id: "f1", name: "Force Jump", school: "uni" }),
		makePower({ id: "t1", name: "Energy Shield", school: "tec" })
	]);
	assert.equal(countOwnedPowersKnown(actor, "force"), 1);
	assert.equal(countOwnedPowersKnown(actor, "tech"), 1);
});

test("one Item with many Activities counts once", () => {
	const actor = makeActor([
		makePower({ id: "f1", name: "Multi", school: "lgt", activities: 4 })
	]);
	assert.equal(countOwnedPowersKnown(actor, "force"), 1);
});

test("duplicate Item ids count once", () => {
	const p = makePower({ id: "f1", name: "Dup", school: "uni" });
	const actor = makeActor([p, { ...p }]);
	assert.equal(countOwnedPowersKnown(actor, "force"), 1);
});

test("freeLearn powers are possessed but excluded from Powers Known numerator", () => {
	const actor = makeActor([
		makePower({ id: "f1", name: "Granted", school: "uni", freeLearn: true }),
		makePower({ id: "f2", name: "Learned", school: "lgt", freeLearn: false })
	]);
	assert.equal(countOwnedPowersKnown(actor, "force"), 1);
});

test("non-spell and wrong-school items are ignored", () => {
	const actor = {
		itemTypes: {
			spell: [makePower({ id: "t1", name: "Tech", school: "tec" })],
			feat: [{ type: "feat", name: "Forcecasting", system: {} }],
			weapon: [{ type: "weapon", name: "Lightsaber", system: {} }]
		},
		items: []
	};
	assert.equal(countOwnedPowersKnown(actor, "force"), 0);
	assert.equal(countOwnedPowersKnown(actor, "tech"), 1);
});

test("character unspecified max resolves to null (sheet N / —)", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: false,
		sourceKnownMax: null,
		computedPowersKnownMax: 0
	}), null);
});

test("character class-derived max is authoritative", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: false,
		sourceKnownMax: null,
		computedPowersKnownMax: 13
	}), 13);
});

test("character stale source 0 heals to class max when computed > 0", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: false,
		sourceKnownMax: 0,
		computedPowersKnownMax: 17
	}), 17);
});

test("character positive configured override is preserved", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: false,
		sourceKnownMax: 25,
		computedPowersKnownMax: 13
	}), 25);
});

test("NPC unspecified max is null even when computed would be 0", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: true,
		sourceKnownMax: null,
		computedPowersKnownMax: 0
	}), null);
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: true,
		sourceKnownMax: 0,
		computedPowersKnownMax: 0
	}), null);
});

test("NPC positive known.max override is preserved", () => {
	assert.equal(resolvePreparedPowersKnownMax({
		isNPC: true,
		sourceKnownMax: 12,
		computedPowersKnownMax: 0
	}), 12);
});

test("pack cleanPackEntry source no longer unconditionally deletes Actor powercasting", () => {
	const packsPath = path.join(root, "utils", "packs.mjs");
	const src = fs.readFileSync(packsPath, "utf8");
	assert.equal(
		/if\s*\(\s*data\.system\?\.powercasting\s*\)\s*delete\s+data\.system\.powercasting\s*;/.test(src),
		false,
		"unconditional powercasting delete must be removed"
	);
	assert.match(
		src,
		/powercasting/,
		"packs.mjs should still mention powercasting with an Actor-preserving guard"
	);
});

test("Jedi Sage YAML authored pool is full", async () => {
	const yaml = (await import("js-yaml")).default;
	const doc = yaml.load(fs.readFileSync(
		path.join(root, "packs/_source/snv-monsters/humanoid/jedi-knight-sage.yml"),
		"utf8"
	));
	const points = doc.system.powercasting.force.points;
	assert.equal(points.max, 49);
	assert.equal(points.value, 49);
});

if ( !process.exitCode ) console.log(`\n${passed} tests passed`);
