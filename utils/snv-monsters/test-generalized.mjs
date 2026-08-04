/**
 * Tracked generalized-generator unit tests (synthetic fixtures only).
 */
import assert from "node:assert/strict";
import { generateGeneralizedActor } from "./generate-generalized.mjs";
import { createEmptyIrEntry } from "./ir-schema.mjs";
import { detectFeatures, deriveCapability } from "./classify.mjs";
import { resolveCanonicalWeapon, buildCanonicalWeaponIndex } from "./canonical.mjs";
import { assertAllowedOutputRoot } from "./write-guard.mjs";

let passed = 0;
function test(name, fn) {
	try {
		fn();
		passed += 1;
		console.log(`ok - ${name}`);
	} catch ( err ) {
		console.error(`not ok - ${name}`);
		console.error(err);
		process.exitCode = 1;
	}
}

const syntheticBody = `
*Small beast, unaligned*
- Armor Class 13
- Hit Points 22 (4d6+8)
- Speed 30 ft., climb 20 ft.

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 12 (+1) | 16 (+3) | 14 (+2) | 2 (-4) | 12 (+1) | 6 (-2) |

- Damage Resistances kinetic
- Senses blindsight 10 ft., passive Perception 11
- Challenge 1 (200 XP)

### Actions
**Bite.** *Melee Weapon Attack:* +5 to hit, reach 5 ft., one target. *Hit:* 6 (1d6+3) kinetic damage.

### Reactions
**Skitter.** The creature moves 10 ft. without provoking opportunity attacks.
`;

test("feature detection: natural attack, senses, reaction", () => {
	const f = detectFeatures(syntheticBody);
	assert.equal(f.hasBasicScalars, true);
	assert.equal(f.hasAttack, true);
	assert.equal(f.hasReactions, true);
	assert.equal(f.hasUnusualSenseOrMove, true);
});

test("capability: complex mechanics => partially-supported not unsupported-from-allowlist", () => {
	const f = detectFeatures(syntheticBody);
	const c = deriveCapability(f);
	assert.equal(c.capabilityStatus, "partially-supported");
	assert.ok(c.unsupportedMechanics.includes("reaction-activity"));
});

test("generalized generator emits natural weapon + activity without N1 semantic key", () => {
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Cub",
		semanticKey: "snv:Beasts:synthetic-cub",
		normalizedName: "synthetic cub",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "partially-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		unsupportedMechanics: ["reaction-activity"],
		features: detectFeatures(syntheticBody)
	});
	const { actor, exceptions, attacksParsed } = generateGeneralizedActor({ irEntry: ir, body: syntheticBody });
	assert.equal(attacksParsed, 1);
	assert.equal(actor.items.length, 1);
	assert.equal(actor.items[0].system.type.value, "natural");
	assert.equal(actor.system.details.source.custom, "SnV");
	assert.equal(actor.flags.sw5e.snvMonsters.nonproduction, true);
	assert.ok(exceptions.some(e => e.mechanic === "reaction-activity" || e.type === "unsupported-mechanic"));
	assert.throws(() => assertAllowedOutputRoot("packs/_source/snv-monsters"));
});

test("canonical resolution indexes equipment weapons", () => {
	const idx = buildCanonicalWeaponIndex();
	assert.ok(idx.count > 10);
	const rifle = resolveCanonicalWeapon("Blaster Rifle");
	assert.equal(rifle.match, "exact-name");
	const weird = resolveCanonicalWeapon("Totally Fictional Boomstick");
	assert.equal(weird.match, "none");
});

test("save-only and limited-uses flags surface as exceptions on partial emit", () => {
	const body = `
*Medium humanoid*
- Armor Class 15
- Hit Points 40 (8d8)
- Speed 30 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 10 (+0) | 14 (+2) | 12 (+1) | 12 (+1) | 11 (+0) | 10 (+0) |
- Challenge 2 (450 XP)
### Actions
**Shock Wave (Recharge 5–6).** Each creature in a 20-ft cone must succeed on a DC 13 Dexterity saving throw.
`;
	const f = detectFeatures(body);
	assert.equal(f.hasRecharge, true);
	assert.equal(f.hasSave, true);
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Shocker",
		semanticKey: "snv:Humanoids:synthetic-shocker",
		features: f,
		unsupportedMechanics: deriveCapability(f).unsupportedMechanics,
		parseStatus: "parsed-valid",
		capabilityStatus: "partially-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "requires-runtime-validation"
	});
	const { actor, exceptions } = generateGeneralizedActor({ irEntry: ir, body });
	assert.ok(actor.system.attributes.hp.max >= 1);
	assert.ok(exceptions.some(e => /recharge|save-only|unsupported/.test(JSON.stringify(e))));
});

test("explicit unsupported mechanic remains visible", () => {
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Legend",
		semanticKey: "snv:Beasts:synthetic-legend",
		unsupportedMechanics: ["legendary-actions"],
		features: { hasBasicScalars: true, hasLegendary: true, hasAttack: true },
		parseStatus: "parsed-valid",
		capabilityStatus: "partially-supported",
		outputSelection: "not-selected",
		productionReadiness: "not-assessed"
	});
	const body = `
*Large beast*
- Armor Class 17
- Hit Points 100 (8d10+40)
- Speed 40 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 20 (+5) | 14 (+2) | 18 (+4) | 2 (-4) | 12 (+1) | 6 (-2) |
- Challenge 8 (3900 XP)
### Actions
**Bite.** *Melee Weapon Attack:* +9 to hit, reach 5 ft., one target. *Hit:* 16 (2d10+5) kinetic damage.
### Legendary Actions
The beast can take 3 legendary actions.
`;
	const { exceptions } = generateGeneralizedActor({ irEntry: ir, body });
	assert.ok(exceptions.some(e => e.mechanic === "legendary-actions" || e.type === "unsupported-mechanic"));
});

if ( !process.exitCode ) console.log(`\n${passed} generalized tests passed`);
