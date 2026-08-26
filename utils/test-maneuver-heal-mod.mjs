/**
 * Offline tests for Bug 27B Maneuver Heal Activity ability-key resolution.
 */
import assert from "node:assert/strict";
import { resolveManeuverHealActivityAbility } from "../scripts/patch/maneuver.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const actorAbilities = {
	str: { mod: 2 },
	dex: { mod: 1 },
	con: { mod: 3 },
	int: { mod: 3 },
	wis: { mod: 0 },
	cha: { mod: 6 }
};

check("base ability key present → unchanged", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: "wis",
		itemIsManeuver: true,
		itemAbilityMod: "int",
		actorAbilities
	}), "wis");
});

check("Maneuver + null base + abilityMod int + actor has int → int", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: "int",
		actorAbilities
	}), "int");
});

check("Maneuver + null base + abilityMod cha → cha", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: "cha",
		actorAbilities
	}), "cha");
});

check("Maneuver + abilityMod int but actor lacks int → null", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: "int",
		actorAbilities: { cha: { mod: 6 } }
	}), null);
});

check("Maneuver + numeric abilityMod 3 → null (reject non-key)", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: 3,
		actorAbilities
	}), null);
});

check("non-Maneuver + null base → null", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: false,
		itemAbilityMod: "int",
		actorAbilities
	}), null);
});

check("blank string base treated as absent → fallback key", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: "   ",
		itemIsManeuver: true,
		itemAbilityMod: "int",
		actorAbilities
	}), "int");
});

check("empty string abilityMod → null", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: "",
		actorAbilities
	}), null);
});

check("missing actorAbilities → null", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: "int",
		actorAbilities: null
	}), null);
});

check("whitespace-padded abilityMod key → trimmed key", () => {
	assert.equal(resolveManeuverHealActivityAbility({
		baseAbility: null,
		itemIsManeuver: true,
		itemAbilityMod: " cha ",
		actorAbilities
	}), "cha");
});

console.log(`\n${passed} passed`);
