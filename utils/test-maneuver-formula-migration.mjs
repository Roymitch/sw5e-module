/**
 * Offline tests for Bug 27C Maneuver formula migration planner.
 */
import assert from "node:assert/strict";
import {
	CANONICAL_HEAL_ACTIVITY_ID,
	CANONICAL_MANEUVER_HEAL_FORMULA,
	classifyManeuverFormula,
	isCanonicalAffectedManeuver,
	normalizeManeuverFormula,
	planManeuverFormulaMigration
} from "../scripts/maneuver-formula-migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const FULL_MAX = `1d@superiority.die + max(
  @abilities.str.mod,
  @abilities.dex.mod,
  @abilities.con.mod,
  @abilities.int.mod,
  @abilities.wis.mod,
  @abilities.cha.mod
)`;

const MENTAL_MAX = "1d@superiority.die + max(@abilities.int.mod, @abilities.wis.mod, @abilities.cha.mod)";
const WIS_CHA_MAX = "1d@superiority.die + max(@abilities.wis.mod, @abilities.cha.mod)";

function baseItem({
	formula = CANONICAL_MANEUVER_HEAL_FORMULA,
	uid = "Maneuvers.name-administer_aid",
	docId = "u1oADGkMWPBiFM9S",
	activityId = CANONICAL_HEAL_ACTIVITY_ID,
	type = "sw5e-module.maneuver",
	parts = null,
	compendiumSource = null
} = {}) {
	const item = {
		_id: docId,
		name: "Administer Aid",
		type,
		flags: {
			"sw5e-importer": { uid }
		},
		system: {
			activities: {}
		}
	};
	if ( activityId ) {
		item.system.activities[activityId] = {
			_id: activityId,
			type: "heal",
			healing: {
				custom: { enabled: true, formula },
				types: ["healing"]
			}
		};
	}
	if ( parts ) item.system.damage = { parts };
	if ( compendiumSource ) {
		item._stats = { compendiumSource };
	}
	return item;
}

check("normalize collapses whitespace", () => {
	assert.equal(
		normalizeManeuverFormula(FULL_MAX),
		"1d@superiority.die+max(@abilities.str.mod,@abilities.dex.mod,@abilities.con.mod,@abilities.int.mod,@abilities.wis.mod,@abilities.cha.mod)"
	);
});

check("classify canonical", () => {
	assert.equal(classifyManeuverFormula(CANONICAL_MANEUVER_HEAL_FORMULA), "canonical");
});

check("classify full max with whitespace", () => {
	assert.equal(classifyManeuverFormula(FULL_MAX), "obsolete-full-max");
});

check("classify mental subset", () => {
	assert.equal(classifyManeuverFormula(MENTAL_MAX), "obsolete-mental-max");
});

check("classify wis/cha subset", () => {
	assert.equal(classifyManeuverFormula(WIS_CHA_MAX), "obsolete-wis-cha-max");
});

check("classify mod-only", () => {
	assert.equal(classifyManeuverFormula("@mod"), "obsolete-mod-only");
});

check("classify unknown custom max", () => {
	assert.equal(classifyManeuverFormula("1d@superiority.die + max(@abilities.str.mod, @abilities.dex.mod)"), "unknown");
});

check("provenance by importer uid", () => {
	assert.equal(isCanonicalAffectedManeuver(baseItem()), true);
});

check("provenance by legacy pack UUID", () => {
	const item = baseItem({ uid: "other" });
	item.flags["sw5e-importer"].uid = "nope";
	item._stats = { compendiumSource: "Compendium.sw5e-module.maneuvers.Item.u1oADGkMWPBiFM9S" };
	assert.equal(isCanonicalAffectedManeuver(item), true);
});

check("name-only false positive rejected", () => {
	assert.equal(isCanonicalAffectedManeuver({
		name: "Administer Aid",
		type: "sw5e-module.maneuver",
		flags: {},
		system: { activities: {} }
	}), false);
});

check("canonical plan has no updates", () => {
	const plan = planManeuverFormulaMigration(baseItem());
	assert.equal(plan.changedFields.length, 0);
	assert.equal(plan.reasons.activity, "already-current");
});

check("full max activity migrates", () => {
	const plan = planManeuverFormulaMigration(baseItem({ formula: FULL_MAX }));
	assert.deepEqual(plan.changedFields, [
		`system.activities.${CANONICAL_HEAL_ACTIVITY_ID}.healing.custom.formula`
	]);
	assert.equal(
		plan.updates[`system.activities.${CANONICAL_HEAL_ACTIVITY_ID}.healing.custom.formula`],
		CANONICAL_MANEUVER_HEAL_FORMULA
	);
});

check("mental max activity migrates", () => {
	const plan = planManeuverFormulaMigration(baseItem({ formula: MENTAL_MAX }));
	assert.equal(plan.reasons.activity, "obsolete-mental-max");
	assert.equal(plan.changedFields.length, 1);
});

check("wis/cha max activity migrates", () => {
	const plan = planManeuverFormulaMigration(baseItem({ formula: WIS_CHA_MAX }));
	assert.equal(plan.reasons.activity, "obsolete-wis-cha-max");
	assert.equal(plan.changedFields.length, 1);
});

check("mod-only on canonical activity migrates", () => {
	const plan = planManeuverFormulaMigration(baseItem({ formula: "@mod" }));
	assert.equal(plan.reasons.activity, "obsolete-mod-only");
	assert.equal(plan.changedFields.length, 1);
});

check("mod-only without provenance preserved", () => {
	const item = baseItem({ formula: "@mod", uid: "homebrew.x", docId: "aaaaaaaaaaaaaaaa" });
	item.flags["sw5e-importer"].uid = "homebrew.x";
	const plan = planManeuverFormulaMigration(item);
	assert.equal(plan.changedFields.length, 0);
	assert.equal(plan.reasons.item, "not-canonical-affected-maneuver");
});

check("homebrew die+mod preserved", () => {
	const plan = planManeuverFormulaMigration(baseItem({ formula: "2d@superiority.die + @mod" }));
	assert.equal(plan.reasons.activity, "unknown-or-custom");
	assert.equal(plan.changedFields.length, 0);
});

check("homebrew +2 preserved", () => {
	const plan = planManeuverFormulaMigration(baseItem({
		formula: "1d@superiority.die + @mod + 2"
	}));
	assert.equal(plan.changedFields.length, 0);
});

check("wrong activity id custom formula preserved", () => {
	const item = baseItem({ formula: "@mod", activityId: "customHeal000000" });
	const plan = planManeuverFormulaMigration(item);
	assert.equal(plan.reasons.activity, "missing-canonical-activity");
	assert.equal(plan.changedFields.length, 0);
});

check("obsolete damage part migrates independently", () => {
	const item = baseItem({
		formula: CANONICAL_MANEUVER_HEAL_FORMULA,
		parts: [[FULL_MAX, "healing"]]
	});
	const plan = planManeuverFormulaMigration(item);
	assert.ok(plan.changedFields.includes("system.damage.parts.0.0"));
	assert.equal(plan.updates["system.damage.parts"][0][0], CANONICAL_MANEUVER_HEAL_FORMULA);
	assert.equal(plan.reasons.activity, "already-current");
});

check("obsolete activity with current parts migrates activity only", () => {
	const item = baseItem({
		formula: "@mod",
		parts: [[CANONICAL_MANEUVER_HEAL_FORMULA, "healing"]]
	});
	const plan = planManeuverFormulaMigration(item);
	assert.deepEqual(plan.changedFields, [
		`system.activities.${CANONICAL_HEAL_ACTIVITY_ID}.healing.custom.formula`
	]);
	assert.equal(plan.reasons.damagePart, "already-current");
});

check("idempotence: second plan empty", () => {
	const item = baseItem({ formula: "@mod" });
	const first = planManeuverFormulaMigration(item);
	assert.equal(first.changedFields.length, 1);
	const path = first.changedFields[0];
	item.system.activities[CANONICAL_HEAL_ACTIVITY_ID].healing.custom.formula = first.updates[path];
	const second = planManeuverFormulaMigration(item);
	assert.equal(second.changedFields.length, 0);
});

check("updates contain only formula paths", () => {
	const plan = planManeuverFormulaMigration(baseItem({
		formula: FULL_MAX,
		parts: [["@mod", "temphp"]]
	}));
	for ( const key of Object.keys(plan.updates) ) {
		assert.ok(
			key.includes("healing.custom.formula") || key === "system.damage.parts",
			`unexpected update key ${key}`
		);
	}
});

console.log(`\n${passed} passed`);
