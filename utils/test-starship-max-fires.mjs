#!/usr/bin/env node
/**
 * Offline tests: Bug 8 / Phase 2D Max Fires per Round (display-only).
 * Formula: ceil(max(1, StrengthModifier) × HardpointSizeMultiplier)
 * Uses RAW SotG constants — not legacy Size-pack hardpointMult.
 */
import assert from "node:assert/strict";
import {
	STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS,
	buildStarshipMaxFiresDisplayContext,
	computeStarshipMaxFiresPerRound,
	deriveStarshipMaxFiresPerRound,
	normalizeStarshipMaxFiresSizeKey,
	resolveStarshipMaxFiresSizeKey
} from "../scripts/starship-max-fires.mjs";
import { isSw5eStarshipActor } from "../scripts/starship-sheet-ids.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function starshipActor({
	size = "med",
	strMod = 0,
	strValue = 10,
	items = [],
	role = null,
	tier = 0,
	weapons = null
} = {}) {
	const list = [...items];
	if ( weapons ) list.push(...weapons);
	if ( role ) list.push(role);
	return {
		type: "vehicle",
		flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
		system: {
			traits: { size },
			abilities: { str: { value: strValue, mod: strMod } },
			details: { tier }
		},
		items: list,
		update: async () => {
			throw new Error("Actor.update must not be called during Max Fires derivation");
		}
	};
}

function ordinaryVehicle(size = "med") {
	return {
		type: "vehicle",
		flags: {},
		system: {
			traits: { size },
			abilities: { str: { value: 14, mod: 2 } }
		},
		items: []
	};
}

function characterActor() {
	return {
		type: "character",
		flags: {},
		system: {
			traits: { size: "med" },
			abilities: { str: { value: 16, mod: 3 } }
		},
		items: []
	};
}

function npcActor() {
	return {
		type: "npc",
		flags: {},
		system: {
			traits: { size: "lg" },
			abilities: { str: { value: 18, mod: 4 } }
		},
		items: []
	};
}

function weaponItem({ name = "Laser Cannon", quantity = 1, activities = 1 } = {}) {
	const activityEntries = {};
	for ( let i = 0; i < activities; i += 1 ) {
		activityEntries[`act${i}`] = { type: "attack", name: `Fire ${i + 1}` };
	}
	return {
		name,
		type: "weapon",
		system: {
			quantity,
			activities: activityEntries
		}
	};
}

// —— A. Size multiplier matrix at minimum Strength (mod ≤ 0) ——
test("A: minimum Strength matrix (mod -2)", () => {
	const cases = [
		["tiny", 1],
		["sm", 1],
		["med", 2],
		["lg", 3],
		["huge", 2],
		["grg", 3]
	];
	for ( const [size, expected] of cases ) {
		assert.equal(computeStarshipMaxFiresPerRound(-2, size), expected, size);
		assert.equal(deriveStarshipMaxFiresPerRound(starshipActor({ size, strMod: -2 })), expected, `derive ${size}`);
	}
});

test("A: zero Strength modifier matrix", () => {
	const cases = [
		["tiny", 1],
		["sm", 1],
		["med", 2],
		["lg", 3],
		["huge", 2],
		["grg", 3]
	];
	for ( const [size, expected] of cases ) {
		assert.equal(computeStarshipMaxFiresPerRound(0, size), expected, size);
	}
});

// —— B. Strength modifier 1 ——
test("B: Strength modifier 1 matrix", () => {
	const cases = [
		["tiny", 1],
		["sm", 1],
		["med", 2],
		["lg", 3],
		["huge", 2],
		["grg", 3]
	];
	for ( const [size, expected] of cases ) {
		assert.equal(computeStarshipMaxFiresPerRound(1, size), expected, size);
	}
});

// —— C. Positive modifiers and rounding ——
test("C: positive modifiers and ceil rounding", () => {
	assert.equal(computeStarshipMaxFiresPerRound(2, "med"), 3);
	assert.equal(computeStarshipMaxFiresPerRound(3, "med"), 5);
	assert.equal(computeStarshipMaxFiresPerRound(2, "lg"), 5);
	assert.equal(computeStarshipMaxFiresPerRound(3, "lg"), 8);
	assert.equal(computeStarshipMaxFiresPerRound(4, "huge"), 8);
	assert.equal(computeStarshipMaxFiresPerRound(4, "grg"), 12);
});

// —— D. Minimum behavior ——
test("D: negative and zero use floor of 1; positive preserved", () => {
	assert.equal(computeStarshipMaxFiresPerRound(-5, "med"), 2);
	assert.equal(computeStarshipMaxFiresPerRound(0, "large"), 3);
	assert.equal(computeStarshipMaxFiresPerRound(2, "medium"), 3);
	assert.equal(computeStarshipMaxFiresPerRound(3, "large"), 8);
});

// —— E. Prepared Strength effects (consume prepared mod; no mutation) ——
test("E: prepared Strength mod path — baseline / add / override / disabled", () => {
	const baseline = starshipActor({ size: "med", strMod: 0, strValue: 10 });
	assert.equal(deriveStarshipMaxFiresPerRound(baseline), 2);

	const withAdd = starshipActor({ size: "med", strMod: 2, strValue: 10 });
	assert.equal(deriveStarshipMaxFiresPerRound(withAdd), 3);
	assert.equal(withAdd.system.abilities.str.value, 10, "underlying score unchanged by derivation");

	const withOverride = starshipActor({ size: "med", strMod: 4, strValue: 10 });
	assert.equal(deriveStarshipMaxFiresPerRound(withOverride), 6);

	const afterDisable = starshipActor({ size: "med", strMod: 0, strValue: 10 });
	assert.equal(deriveStarshipMaxFiresPerRound(afterDisable), 2);
});

test("E: canonical path is system.abilities.str.mod", () => {
	const actor = starshipActor({ size: "lg", strMod: 3, strValue: 8 });
	assert.equal(actor.system.abilities.str.mod, 3);
	assert.equal(deriveStarshipMaxFiresPerRound(actor), 8);
	assert.notEqual(
		Math.floor((actor.system.abilities.str.value - 10) / 2),
		actor.system.abilities.str.mod,
		"prepared mod differs from raw score-derived mod when AE-like override applied"
	);
});

// —— F. Dynamic Size; Role/Tier independence ——
test("F: Size changes Max Fires via RAW map", () => {
	assert.equal(deriveStarshipMaxFiresPerRound(starshipActor({ size: "med", strMod: 2 })), 3);
	assert.equal(deriveStarshipMaxFiresPerRound(starshipActor({ size: "lg", strMod: 2 })), 5);
	assert.equal(deriveStarshipMaxFiresPerRound(starshipActor({ size: "grg", strMod: 2 })), 6);
});

test("F: Role alone does not change Max Fires", () => {
	const roleA = { name: "Role: Shuttle", type: "feat", system: { type: { subtype: "role" } } };
	const roleB = { name: "Role: Freighter", type: "feat", system: { type: { subtype: "role" } } };
	const a = deriveStarshipMaxFiresPerRound(starshipActor({ size: "med", strMod: 1, role: roleA }));
	const b = deriveStarshipMaxFiresPerRound(starshipActor({ size: "med", strMod: 1, role: roleB }));
	assert.equal(a, b);
	assert.equal(a, 2);
});

test("F: Tier alone does not change Max Fires", () => {
	const t0 = deriveStarshipMaxFiresPerRound(starshipActor({ size: "lg", strMod: 0, tier: 0 }));
	const t5 = deriveStarshipMaxFiresPerRound(starshipActor({ size: "lg", strMod: 0, tier: 5 }));
	assert.equal(t0, t5);
	assert.equal(t0, 3);
});

// —— G. Weapon independence ——
test("G: Max Fires independent of weapon count/activities/quantity", () => {
	const base = deriveStarshipMaxFiresPerRound(starshipActor({ size: "med", strMod: 2, weapons: [] }));
	const one = deriveStarshipMaxFiresPerRound(starshipActor({
		size: "med",
		strMod: 2,
		weapons: [weaponItem({ quantity: 1, activities: 1 })]
	}));
	const many = deriveStarshipMaxFiresPerRound(starshipActor({
		size: "med",
		strMod: 2,
		weapons: [
			weaponItem({ name: "A", quantity: 3, activities: 2 }),
			weaponItem({ name: "B", quantity: 5, activities: 4 }),
			weaponItem({ name: "C", quantity: 1, activities: 3 })
		]
	}));
	assert.equal(base, 3);
	assert.equal(one, 3);
	assert.equal(many, 3);
});

// —— H. Scope regression ——
test("H: starship only; character/npc/vehicle excluded", () => {
	assert.equal(isSw5eStarshipActor(starshipActor()), true);
	assert.equal(isSw5eStarshipActor(characterActor()), false);
	assert.equal(isSw5eStarshipActor(npcActor()), false);
	assert.equal(isSw5eStarshipActor(ordinaryVehicle()), false);

	assert.equal(deriveStarshipMaxFiresPerRound(starshipActor({ size: "med", strMod: 0 })), 2);
	assert.equal(deriveStarshipMaxFiresPerRound(characterActor()), null);
	assert.equal(deriveStarshipMaxFiresPerRound(npcActor()), null);
	assert.equal(deriveStarshipMaxFiresPerRound(ordinaryVehicle()), null);

	const shipCtx = buildStarshipMaxFiresDisplayContext(starshipActor({ size: "med", strMod: 0 }));
	assert.equal(shipCtx.show, true);
	assert.equal(shipCtx.value, 2);
	assert.equal(shipCtx.label, "Max Fires/Round");
	assert.equal(shipCtx.ariaLabel, "Max Fires/Round 2");
	assert.equal("playDisplay" in shipCtx, false, "colon-concatenated playDisplay must not be used");
	assert.doesNotMatch(shipCtx.ariaLabel, /:/);

	assert.equal(buildStarshipMaxFiresDisplayContext(characterActor()).show, false);
	assert.equal(buildStarshipMaxFiresDisplayContext(npcActor()).show, false);
	assert.equal(buildStarshipMaxFiresDisplayContext(ordinaryVehicle()).show, false);
});

// —— I. Invalid-data safety ——
test("I: unknown size / non-finite mod → null; no throw; no writes", () => {
	assert.equal(computeStarshipMaxFiresPerRound(2, "colossal"), null);
	assert.equal(computeStarshipMaxFiresPerRound(2, ""), null);
	assert.equal(computeStarshipMaxFiresPerRound(NaN, "med"), null);
	assert.equal(computeStarshipMaxFiresPerRound(Infinity, "med"), null);
	assert.equal(computeStarshipMaxFiresPerRound(undefined, "med"), null);

	const bad = starshipActor({ size: "unknown-size", strMod: 2 });
	assert.equal(deriveStarshipMaxFiresPerRound(bad), null);
	assert.equal(buildStarshipMaxFiresDisplayContext(bad).show, false);

	const actor = starshipActor({ size: "med", strMod: 2 });
	assert.equal(deriveStarshipMaxFiresPerRound(actor), 3);
});

test("I: RAW constant map ownership; legacy hardpointMult unused", () => {
	assert.deepEqual({ ...STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS }, {
		tiny: 1,
		small: 1,
		medium: 1.5,
		large: 2.5,
		huge: 2,
		gargantuan: 3
	});
	const actor = starshipActor({
		size: "med",
		strMod: 0,
		items: [{
			name: "Medium",
			type: "feat",
			flags: { sw5e: { legacyStarshipSize: { hardpointMult: 99, size: "Medium" } } }
		}]
	});
	assert.equal(resolveStarshipMaxFiresSizeKey(actor), "medium");
	assert.equal(deriveStarshipMaxFiresPerRound(actor), 2, "must use RAW 1.5 not pack hardpointMult 99");
});

test("normalize accepts dnd5e and verbose size keys", () => {
	assert.equal(normalizeStarshipMaxFiresSizeKey("lg"), "large");
	assert.equal(normalizeStarshipMaxFiresSizeKey("Large Starship"), "large");
	assert.equal(normalizeStarshipMaxFiresSizeKey("MEDIUM"), "medium");
});

console.log(`\n${passed} tests passed`);
