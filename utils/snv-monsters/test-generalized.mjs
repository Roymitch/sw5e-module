/**
 * Tracked generalized-generator unit tests (synthetic fixtures only).
 */
import assert from "node:assert/strict";
import { generateGeneralizedActor, parseAfflictionRider, parseChargeDamageKnockdown, parseChargeKnockdownFollowup, parseGrappleRestrainRider, parseOnHitProneRider } from "./generate-generalized.mjs";
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

function singleAttackBody({ name, attackText, hitText = "6 (1d6+3) kinetic damage." }) {
	return `
*Small beast, unaligned*
- Armor Class 13
- Hit Points 22 (4d6+8)
- Speed 30 ft.

| STR | DEX | CON | INT | WIS | CHA |
| --- | --- | --- | --- | --- | --- |
| 12 (+1) | 16 (+3) | 14 (+2) | 2 (-4) | 12 (+1) | 6 (-2) |

- Challenge 1 (200 XP)

### Actions
**${name}.** ${attackText} *Hit:* ${hitText}
`;
}

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

test("fractional challenge ratings emit finite numeric CR values", () => {
	const body = singleAttackBody({
		name: "Bite",
		attackText: "*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target."
	}).replace("Challenge 1 (200 XP)", "Challenge 1/4 (50 XP)");
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Fractional CR",
		semanticKey: "snv:Beasts:synthetic-fractional-cr",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(body)
	});
	const { actor, parsedStatBlock } = generateGeneralizedActor({ irEntry: ir, body });
	assert.equal(actor.system.details.cr, 0.25);
	assert.equal(parsedStatBlock.cr, 0.25);
	assert.equal(typeof actor.system.details.cr, "number");
});

test("C6 Charge damage-plus-knockdown metadata recognizes Moof/Reek and excludes follow-up or damage-only Charges", () => {
	const moof = parseChargeDamageKnockdown(
		"Charge",
		"If the moof moves at least 20 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 11 (2d10) kinetic damage. If the target is a creature, it must succeed on a DC 14 Strength saving throw or be knocked prone."
	);
	assert.equal(moof?.family, "charge-damage-knockdown");
	assert.equal(moof?.triggerAttack, "Gore");
	assert.equal(moof?.extraDamage, "2d10");
	assert.equal(moof?.saveDc, 14);
	assert.equal(moof?.targetRestriction, null);
	assert.equal(moof?.runtimeAutomation, false);

	const reek = parseChargeDamageKnockdown(
		"Charge",
		"If the reek moves at least 20 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 9 (2d8) kinetic damage. If the target is a Large or smaller, it must succeed on a DC 15 Strength saving throw or be knocked prone."
	);
	assert.equal(reek?.targetRestriction, "large-or-smaller");
	assert.equal(reek?.saveDc, 15);

	assert.equal(parseChargeDamageKnockdown(
		"Charge",
		"If the mott moves at least 15 feet straight toward a target and then hits it with a ram attack on the same turn, the target takes an extra 3 (1d6) kinetic damage."
	), null);
	assert.equal(parseChargeDamageKnockdown(
		"Charge",
		"If the dewback moves at least 20 feet straight toward a creature and then hits it with a bite attack on the same turn, that target must succeed on a DC 14 Strength saving throw or be knocked prone. If the target is prone, the dewback can make one claw attack against it as a bonus action."
	), null);
	assert.equal(parseChargeDamageKnockdown(
		"Trampling Charge",
		"If the acklay moves at least 20 feet straight toward a creature and then hits it with a claw attack on the same turn, that target must succeed on a DC 14 Strength saving throw or be knocked prone."
	), null);

	const body = `
*Large beast*
- Armor Class 12
- Hit Points 45 (6d10 + 12)
- Speed 40 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 18 (+4) | 10 (+0) | 14 (+2) | 2 (-4) | 10 (+0) | 5 (-3) |
- Challenge 2 (450 XP)
### Traits
**Charge.** If the moof moves at least 20 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 11 (2d10) kinetic damage. If the target is a creature, it must succeed on a DC 14 Strength saving throw or be knocked prone.
### Actions
**Gore.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 13 (2d8 + 4) kinetic damage.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Moof Charge",
		semanticKey: "snv:Beasts:synthetic-moof-charge",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(body)
	});
	const { actor } = generateGeneralizedActor({
		irEntry: ir,
		body,
		nonproduction: false,
		productionContext: {
			batch: "n3b-p3",
			exactFeatures: {
				passives: ["Charge"],
				nonAttackActions: [],
				weaponAttacks: ["Gore"]
			}
		}
	});
	const charge = actor.items.find(item => item.name === "Charge");
	assert.ok(charge);
	assert.equal(charge.flags.sw5e.snvMonsters.chargeDamageKnockdown?.family, "charge-damage-knockdown");
	assert.equal(charge.flags.sw5e.snvMonsters.chargeDamageKnockdown?.extraDamage, "2d10");
	assert.equal(actor.items.filter(item => item.type === "weapon").length, 1);
});

test("C5 Charge knockdown-followup recognizes Trampling Charge/Charge and excludes C6 damage charges", () => {
	const fathier = parseChargeKnockdownFollowup(
		"Trampling Charge",
		"If the fathier moves at least 20 feet straight toward a creature and then hits it with a hooves attack on the same turn, that target must succeed on a DC 14 Strength saving throw or be knocked prone. If the target is prone, the fathier can make another attack with its hooves against it as a bonus action."
	);
	assert.equal(fathier?.family, "charge-knockdown-followup");
	assert.equal(fathier?.triggerAttack, "Hooves");
	assert.equal(fathier?.followUpAttack, "Hooves");
	assert.equal(fathier?.saveDc, 14);
	assert.equal(fathier?.runtimeAutomation, false);

	const ronto = parseChargeKnockdownFollowup(
		"Trampling Charge",
		"If the ronto moves at least 20 feet straight toward a creature and then hits it with a ram attack on the same turn, that target must succeed on a DC 16 Strength saving throw or be knocked prone. If the target is prone, the ronto can make one stomp attack against it as a bonus action."
	);
	assert.equal(ronto?.triggerAttack, "Ram");
	assert.equal(ronto?.followUpAttack, "Stomp");
	assert.equal(ronto?.sourceTriggerLabelPreserved, "ram");

	const horned = parseChargeKnockdownFollowup(
		"Charge",
		"If the hound moves at least 20 feet straight toward a creature and then hits it with a bite attack on the same turn, that target must succeed on a DC 13 Strength saving throw or be knocked prone. If the target is prone, the hound can make another attack with its tusks against it as a bonus action."
	);
	assert.equal(horned?.triggerAttack, "Bite");
	assert.equal(horned?.followUpAttack, "Tusks");

	assert.equal(parseChargeKnockdownFollowup(
		"Charge",
		"If the moof moves at least 20 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 11 (2d10) kinetic damage. If the target is a creature, it must succeed on a DC 14 Strength saving throw or be knocked prone."
	), null);
	assert.equal(parseChargeKnockdownFollowup(
		"Bite",
		"Melee Weapon Attack: +4 to hit. Hit: 5 (1d6 + 2) kinetic damage, and the target must succeed on a DC 11 Strength saving throw or be knocked prone."
	), null);

	const body = `
*Large beast*
- Armor Class 12
- Hit Points 30 (4d10 + 8)
- Speed 60 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 18 (+4) | 14 (+2) | 14 (+2) | 2 (-4) | 12 (+1) | 8 (-1) |
- Challenge 2 (450 XP)
### Traits
**Trampling Charge.** If the fathier moves at least 20 feet straight toward a creature and then hits it with a hooves attack on the same turn, that target must succeed on a DC 14 Strength saving throw or be knocked prone. If the target is prone, the fathier can make another attack with its hooves against it as a bonus action.
### Actions
**Hooves.** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 11 (2d6 + 4) kinetic damage.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Fathier Charge",
		semanticKey: "snv:Beasts:synthetic-fathier-charge",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(body)
	});
	const { actor } = generateGeneralizedActor({
		irEntry: ir,
		body,
		nonproduction: false,
		productionContext: {
			batch: "n3b-p3",
			exactFeatures: {
				passives: ["Trampling Charge"],
				nonAttackActions: [],
				weaponAttacks: ["Hooves"]
			}
		}
	});
	const charge = actor.items.find(item => item.name === "Trampling Charge");
	assert.ok(charge);
	assert.equal(charge.flags.sw5e.snvMonsters.chargeKnockdownFollowup?.family, "charge-knockdown-followup");
	assert.equal(charge.flags.sw5e.snvMonsters.chargeKnockdownFollowup?.followUpAttack, "Hooves");
});

test("C9 affliction riders recognize disease and paralysis and exclude prone or swallow", () => {
	const scurrier = parseAfflictionRider({
		name: "Bite",
		description: "Hit: 4 (1d4 + 2) kinetic damage, and the target must succeed on a DC 10 Constitution saving throw or become infected with Scurrier Disease. A creature infected with Scurrier Disease's vision becomes blurry."
	});
	assert.equal(scurrier?.family, "affliction-disease");
	assert.equal(scurrier?.saveDc, 10);
	assert.equal(scurrier?.diseaseName, "Scurrier Disease");
	assert.equal(scurrier?.runtimeAutomation, false);

	const vornskr = parseAfflictionRider({
		name: "Tail",
		description: "Hit: 5 (1d6 + 2) kinetic damage plus 7 (2d6) poison damage. If the target is a creature it must also make DC 13 Constitution saving throw. On a failure, a creature is paralyzed for 1 minute. A creature paralyzed in this way can repeat the saving throw at end of each of its turns, ending the effect on itself on a success."
	});
	assert.equal(vornskr?.family, "affliction-paralysis");
	assert.equal(vornskr?.saveDc, 13);
	assert.equal(vornskr?.duration, "1 minute");
	assert.equal(vornskr?.repeatSave, "end-of-turn");

	const dianoga = parseAfflictionRider({
		name: "Bite",
		description: "If the target is a creature, it must succeed on a DC 12 Constitution saving throw or be poisoned for 1 minute. Until the poison ends, the target is paralyzed. The target can repeat the saving throw at the end of each of its turns, ending the poison on itself on a success."
	});
	assert.equal(dianoga?.family, "affliction-poison-paralysis");
	assert.equal(dianoga?.saveDc, 12);
	assert.equal(dianoga?.linkedCondition, "paralyzed");

	assert.equal(parseAfflictionRider({
		name: "Bite",
		description: "If the target is a creature, it must succeed on a DC 12 Strength saving throw or be knocked prone."
	}), null);
	assert.equal(parseAfflictionRider({
		name: "Bite",
		description: "If the target is a Large or smaller creature, it must succeed on a DC 16 Dexterity saving throw or be swallowed. While swallowed, the creature is blinded and restrained."
	}), null);
});

test("C8 grapple/restrain riders recognize escape DC setup and exclude swallow or conditional finishers", () => {
	const tentacles = parseGrappleRestrainRider({
		name: "Tentacles",
		description: "Hit: 4 (1d4 + 2) kinetic damage, and the target is grappled (escape DC 12). Until this grapple ends, the dianoga can't use its tentacles on another target."
	});
	assert.equal(tentacles?.family, "grapple-restrain");
	assert.equal(tentacles?.escapeDc, 12);
	assert.deepEqual(tentacles?.conditions, ["grappled"]);

	const claw = parseGrappleRestrainRider({
		name: "Claw",
		description: "Hit: 11 (2d6 + 4) kinetic damage. The target is grappled (escape DC 15) if that claw isn't already grappling a creature. Until the grapple ends, the creature is restrained."
	});
	assert.equal(claw?.escapeDc, 15);
	assert.deepEqual(claw?.conditions, ["grappled", "restrained"]);

	const biteSave = parseGrappleRestrainRider({
		name: "Bite",
		description: "If the target is a creature, it must succeed on a DC 11 Strength saving throw or be grappled."
	});
	assert.equal(biteSave?.saveDc, 11);
	assert.equal(biteSave?.escapeDc, 11);

	assert.equal(parseGrappleRestrainRider({
		name: "Gnash",
		description: "Melee Weapon Attack: +4 to hit, reach 5 ft. one target grappled by the rat. Hit: 9 (2d6 + 2) kinetic damage."
	}), null);
	assert.equal(parseGrappleRestrainRider({
		name: "Bite",
		description: "If the target is a Large or smaller creature, it must succeed on a DC 16 Dexterity saving throw or be swallowed. While swallowed, the creature is blinded and restrained."
	}), null);
});

test("C7 on-hit prone riders recognize Bite/Stomp/Tail and exclude charge, grapple, and affliction", () => {
	const womp = parseOnHitProneRider({
		name: "Bite",
		description: "Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 10 (2d6 + 3) kinetic damage. If the target is a creature, it must succeed on a DC 13 Strength saving throw or be knocked prone."
	});
	assert.equal(womp?.family, "on-hit-prone");
	assert.equal(womp?.saveDc, 13);
	assert.equal(womp?.targetRestriction, "creature");
	assert.equal(womp?.runtimeAutomation, false);

	const sibian = parseOnHitProneRider({
		name: "Bite",
		description: "Melee Weapon Attack: +4 to hit, reach 5 ft., one target. Hit: 7 (2d4 + 2) kinetic damage. If the target is Large or smaller, it must succeed on a DC 11 Strength saving throw or be knocked prone."
	});
	assert.equal(sibian?.targetRestriction, "large-or-smaller");
	assert.equal(sibian?.saveDc, 11);

	const fambaa = parseOnHitProneRider({
		name: "Stomp",
		description: "Melee Weapon Attack: +8 to hit, reach 10 ft., one target. Hit: 24 (4d8 + 6) kinetic damage, and the target must succeed on a DC 16 Strength saving throw or be knocked prone."
	});
	assert.equal(fambaa?.saveDc, 16);

	const nashtahTail = parseOnHitProneRider({
		name: "Tail",
		description: "Melee Weapon Attack: +6 to hit, reach 10 ft., one target not grappled by the nashtah. Hit: 13 (2d8 + 4) kinetic damage. If the target is a creature, it must succeed on a DC 16 Strength saving throw or be knocked prone."
	});
	assert.equal(nashtahTail?.saveDc, 16);
	assert.match(nashtahTail?.targetingRestriction || "", /not grappled by the nashtah/i);

	assert.equal(parseOnHitProneRider({
		name: "Charge",
		description: "If the moof moves at least 20 feet straight toward a target and then hits it with a gore attack on the same turn, the target takes an extra 11 (2d10) kinetic damage. If the target is a creature, it must succeed on a DC 14 Strength saving throw or be knocked prone."
	}), null);
	assert.equal(parseOnHitProneRider({
		name: "Bite",
		description: "Hit: 15 (2d10 + 4) kinetic damage. The target is grappled (escape DC 16). Until this grapple ends, the target is restrained and the nashtah can't bite another target."
	}), null);
	assert.equal(parseOnHitProneRider({
		name: "Tail",
		description: "Hit: 5 (1d6 + 2) kinetic damage plus 7 (2d6) poison damage. If the target is a creature it must also make DC 13 Constitution saving throw. On a failure, a creature is paralyzed for 1 minute."
	}), null);

	const body = `
*Medium beast*
- Armor Class 13
- Hit Points 22 (4d8 + 4)
- Speed 40 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 14 (+2) | 14 (+2) | 12 (+1) | 2 (-4) | 12 (+1) | 6 (-2) |
- Challenge 1 (200 XP)
### Actions
**Bite.** *Melee Weapon Attack:* +4 to hit, reach 5 ft., one target. *Hit:* 7 (2d4 + 2) kinetic damage. If the target is Large or smaller, it must succeed on a DC 11 Strength saving throw or be knocked prone.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Sibian Bite",
		semanticKey: "snv:Beasts:synthetic-sibian-bite",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(body)
	});
	const { actor } = generateGeneralizedActor({ irEntry: ir, body });
	const bite = actor.items.find(item => item.name === "Bite");
	assert.ok(bite);
	assert.equal(bite.flags.sw5e.snvMonsters.onHitProne?.family, "on-hit-prone");
	assert.equal(bite.flags.sw5e.snvMonsters.onHitProne?.saveDc, 11);
});

test("bounded anatomy natural names emit natural mwak/rwak and keep out-of-scope names non-natural", () => {
	const positiveMelee = ["Bite", "Claw", "Claws", "Slam", "Tentacle", "Tentacles", "Gore", "Sting", "Beak", "Talons", "Hooves", "Tusk", "Tusks", "Tail", "Ram", "Stomp"];
	for ( const attackName of positiveMelee ) {
		const body = singleAttackBody({
			name: attackName,
			attackText: "*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target."
		});
		const ir = createEmptyIrEntry({
			sourceName: `Synthetic ${attackName}`,
			semanticKey: `snv:Beasts:synthetic-${attackName.toLowerCase()}`,
			section: "Beasts",
			parseStatus: "parsed-valid",
			capabilityStatus: "fully-supported",
			outputSelection: "selected-edge-case",
			productionReadiness: "sandbox-only",
			features: detectFeatures(body)
		});
		const { actor } = generateGeneralizedActor({ irEntry: ir, body });
		assert.equal(actor.items.length, 1, attackName);
		assert.equal(actor.items[0].system.type.value, "natural", attackName);
		assert.equal(actor.items[0].system.actionType, "mwak", attackName);
	}

	const spitBody = singleAttackBody({
		name: "Spit",
		attackText: "*Ranged Weapon Attack:* +2 to hit, range 15/30 ft., one target. *Hit:* 2 (1d4) acid damage."
	});
	const spitIr = createEmptyIrEntry({
		sourceName: "Synthetic Spit",
		semanticKey: "snv:Beasts:synthetic-spit",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(spitBody)
	});
	const { actor: spitActor } = generateGeneralizedActor({ irEntry: spitIr, body: spitBody });
	assert.equal(spitActor.items.length, 1);
	assert.equal(spitActor.items[0].system.type.value, "natural");
	assert.equal(spitActor.items[0].system.actionType, "rwak");

	for ( const [attackName, attackText] of [
		["Tail Stinger", "*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target."],
		["Barbed Tail", "*Melee Weapon Attack:* +5 to hit, reach 5 ft., one target."],
		["Acid Spit", "*Ranged Weapon Attack:* +5 to hit, range 30/60 ft., one target."],
		["Venom Spit", "*Ranged Weapon Attack:* +5 to hit, range 30/60 ft., one target."],
		["Regurgitate", "*Ranged Weapon Attack:* +5 to hit, range 30/60 ft., one target."],
		["Stone", "*Ranged Weapon Attack:* +5 to hit, range 30/60 ft., one target."]
	] ) {
		const body = singleAttackBody({ name: attackName, attackText });
		const ir = createEmptyIrEntry({
			sourceName: `Synthetic ${attackName}`,
			semanticKey: `snv:Beasts:synthetic-${attackName.toLowerCase().replace(/\s+/g, "-")}`,
			section: "Beasts",
			parseStatus: "parsed-valid",
			capabilityStatus: "partially-supported",
			outputSelection: "selected-edge-case",
			productionReadiness: "sandbox-only",
			features: detectFeatures(body)
		});
		const { actor } = generateGeneralizedActor({ irEntry: ir, body });
		assert.equal(actor.items.length, 1, attackName);
		assert.notEqual(actor.items[0].system.type.value, "natural", attackName);
	}
});

test("C10 Multiattack nonattack emits description-only feat without attack activity", () => {
	const body = `
*Huge beast*
- Armor Class 14
- Hit Points 126 (12d12 + 48)
- Speed 40 ft.
| STR | DEX | CON | INT | WIS | CHA |
| 22 (+6) | 12 (+1) | 18 (+4) | 2 (-4) | 12 (+1) | 6 (-2) |
- Challenge 7 (2900 XP)
### Actions
**Multiattack.** The beast makes two attacks: one with its bite and one with its tail.
**Bite.** *Melee Weapon Attack:* +9 to hit, reach 10 ft., one target. *Hit:* 22 (3d10 + 6) kinetic damage.
**Tail.** *Melee Weapon Attack:* +9 to hit, reach 10 ft., one target. *Hit:* 28 (4d10 + 6) kinetic damage.
`;
	const ir = createEmptyIrEntry({
		sourceName: "Synthetic Multiattack Beast",
		semanticKey: "snv:Beasts:synthetic-multiattack-beast",
		section: "Beasts",
		parseStatus: "parsed-valid",
		capabilityStatus: "fully-supported",
		outputSelection: "selected-edge-case",
		productionReadiness: "sandbox-only",
		features: detectFeatures(body)
	});
	const { actor } = generateGeneralizedActor({
		irEntry: ir,
		body,
		nonproduction: false,
		productionContext: {
			batch: "n3b-p3",
			exactFeatures: {
				passives: [],
				nonAttackActions: ["Multiattack"],
				weaponAttacks: ["Bite", "Tail"]
			}
		}
	});
	const multi = actor.items.find(item => item.name === "Multiattack");
	assert.ok(multi);
	assert.equal(multi.type, "feat");
	assert.equal(Object.keys(multi.system?.activities || {}).length, 0);
	assert.match(multi.system?.description?.value || "", /two attacks/i);
	assert.equal(actor.items.filter(item => item.type === "weapon").length, 2);
	assert.equal(actor.items.find(item => item.name === "Tail")?.system.type.value, "natural");
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
