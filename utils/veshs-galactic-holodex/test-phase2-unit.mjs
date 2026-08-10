import assert from "node:assert/strict";
import fs from "node:fs";
import {
	EXPECTED_ATTACK_NAME_COUNT,
	EXPECTED_BODY_HEADING_COUNT,
	EXPECTED_COMPLETE_ACTOR_COUNT,
	EXPECTED_FORCE_ACTOR_COUNT,
	EXPECTED_TECH_ACTOR_COUNT,
	EXPECTED_TOC_ENTRY_COUNT,
	SOURCE_PATH,
	SOURCE_SHA256
} from "./paths.mjs";
import { resolveCanonicalWeapon } from "./canonical.mjs";
import { resolveCanonicalPower } from "./canonical-powers.mjs";
import { detectFeatures } from "./classify.mjs";
import {
	parseCreatureTypeFromDescriptorPart,
	resolveCreatureTypeFolderLabel
} from "./creature-type-folders.mjs";
import { assertFiniteNumber, assertSafeFormula } from "./numeric-guards.mjs";
import { parseAuthoritativeSource } from "./parse.mjs";
import {
	parseForcecasting,
	parseSuperiorityTrait,
	parseTechcasting
} from "./parse-casting.mjs";
import { parseStatBlock } from "./stat-block.mjs";
import {
	buildAttackNameCensus,
	classifyAttackInstance
} from "./weapon-classification.mjs";

const SOURCE_LINES = fs.readFileSync(SOURCE_PATH, "utf8").replace(/\r\n/g, "\n").split("\n");
const fixture = (start, end) => SOURCE_LINES.slice(start - 1, end).join("\n");

const ACKLAY = fixture(220, 263);
const ALBEK = fixture(264, 314);
const ROGGWART = fixture(2550, 2596);
const GEMINI_CONSPIRATOR = fixture(3432, 3502);
const EMPERORS_WRATH = fixture(4253, 4303);
const GRAND_CHAMPION = fixture(4540, 4597);
const IMPERIAL_CIPHER = fixture(4736, 4789);
const JEDI_BARSENTHOR = fixture(4835, 4896);

let total = 0;
let passed = 0;

function test(name, fn) {
	total += 1;
	try {
		fn();
		passed += 1;
		console.log(`ok - ${name}`);
	} catch (error) {
		console.error(`not ok - ${name}`);
		console.error(error);
		process.exitCode = 1;
	}
}

test("authoritative Holodex parse stays locked to the Phase 0 source baseline", () => {
	const parsed = parseAuthoritativeSource();
	assert.equal(parsed.ok, true);
	assert.equal(parsed.sourceHash, SOURCE_SHA256);
	assert.equal(parsed.sourceCensus.counts.tocEntries, EXPECTED_TOC_ENTRY_COUNT);
	assert.equal(parsed.sourceCensus.counts.bodyHeadings, EXPECTED_BODY_HEADING_COUNT);
	assert.equal(parsed.sourceCensus.counts.completeActors, EXPECTED_COMPLETE_ACTOR_COUNT);
	assert.equal(parsed.forceTechReadiness.forceActorCount, EXPECTED_FORCE_ACTOR_COUNT);
	assert.equal(parsed.forceTechReadiness.techActorCount, EXPECTED_TECH_ACTOR_COUNT);
	assert.equal(parsed.attackCensus.attackNameCount, EXPECTED_ATTACK_NAME_COUNT);
});

test("body blocks inherit TOC sections and preserve known name drift", () => {
	const parsed = parseAuthoritativeSource();
	const acklay = parsed.completeActorBlocks.find(block => block.displayName === "Acklay, Gladiator");
	const gemini = parsed.completeActorBlocks.find(block => block.displayName === "GEMINI Conspirator Droid");
	const guardian = parsed.completeActorBlocks.find(block => block.displayName === "Guardian NS-55 Enforcer");
	const wrath = parsed.completeActorBlocks.find(block => block.displayName === "Emperor's Wrath");
	assert.equal(acklay.sourceSection, "Beastiary");
	assert.equal(gemini.sourceSection, "Droid Shop");
	assert.equal(wrath.sourceSection, "Galaxy's Most Wanted");
	assert.equal(guardian.matchStatus, "name-drift");
	assert.equal(guardian.tocMatch.name, "Guardian NS-55 Enforcer Droid");
});

test("creature type parsing resolves VGH folder taxonomy from descriptor text", () => {
	const aberration = parseCreatureTypeFromDescriptorPart("aberration (sithspawn)");
	assert.equal(aberration.value, "aberration");
	assert.equal(aberration.subtype, "sithspawn");
	assert.equal(resolveCreatureTypeFolderLabel(aberration).label, "Aberration");

	const droid = parseCreatureTypeFromDescriptorPart("droid");
	assert.equal(droid.value, "droid");
	assert.equal(resolveCreatureTypeFolderLabel(droid).label, "Droid");

	const humanoid = parseCreatureTypeFromDescriptorPart("humanoid (dashade)");
	assert.equal(humanoid.value, "humanoid");
	assert.equal(humanoid.subtype, "dashade");
	assert.equal(resolveCreatureTypeFolderLabel(humanoid).label, "Humanoid");

	const custom = parseCreatureTypeFromDescriptorPart("insectoid");
	assert.equal(custom.value, "custom");
	assert.equal(custom.custom, "insectoid");
	assert.equal(resolveCreatureTypeFolderLabel(custom).label, "Custom Type");
});

test("feature detection treats Iokath Superiority as an ordinary trait", () => {
	const features = detectFeatures(GEMINI_CONSPIRATOR);
	assert.equal(features.hasTech, true);
	assert.equal(features.hasForce, false);
	assert.equal(features.hasIokathSuperiority, true);
	assert.equal(features.hasSuperiorityDice, false);
	assert.equal(features.hasSuperiority, false);
});

test("forcecasting parsing tolerates the Albek typo block and standard forcecaster text", () => {
	const albek = parseForcecasting(ALBEK);
	assert.ok(albek, "expected Innate Forcecasting parse for Albek");
	assert.equal(albek.castType, "force");
	assert.equal(albek.mode, "innate");
	assert.equal(albek.abilityKey, "wis");
	assert.equal(albek.saveDc, 13);
	assert.deepEqual(albek.powerNames, [
		"Force Push/Pull",
		"Feedback",
		"Force Disarm",
		"Improved Feedback",
		"Phasestrike",
		"Battle Precognition"
	]);

	const wrath = parseForcecasting(EMPERORS_WRATH);
	assert.ok(wrath, "expected Forcecasting parse for Emperor's Wrath");
	assert.equal(wrath.level, 10);
	assert.equal(wrath.abilityKey, "cha");
	assert.equal(wrath.attackBonus, 9);
	assert.ok(wrath.powerNames.includes("Burse Of Speed"));
	assert.ok(wrath.powerNames.includes("Force Push/Pull"));
});

test("techcasting parsing tolerates malformed VGH tech text and innate fallback", () => {
	const cipher = parseTechcasting(IMPERIAL_CIPHER);
	assert.ok(cipher, "expected Techcasting parse for Imperial Cipher Agent");
	assert.equal(cipher.level, 11);
	assert.equal(cipher.abilityKey, "int");
	assert.equal(cipher.saveDc, 17);
	assert.equal(cipher.attackBonus, 9);
	assert.ok(cipher.powerNames.includes("Concealed Caltrops"));
	assert.ok(cipher.powerNames.includes("Tech Override"));

	const roggwart = parseTechcasting(ROGGWART);
	assert.ok(roggwart, "expected innate tech parse for Roggwart enhancement text");
	assert.equal(roggwart.mode, "innate");
	assert.deepEqual(roggwart.powerNames, ["Pressure Crush"]);
});

test("superiority parsing ignores Iokath Superiority when no dice mechanics exist", () => {
	assert.equal(parseSuperiorityTrait(GEMINI_CONSPIRATOR), null);
});

test("canonical power resolution only aliases names proven against tracked SW5E content", () => {
	const techOverride = resolveCanonicalPower("tech overide", "tech");
	assert.equal(techOverride.match, "exact-name");
	assert.equal(techOverride.canonical.name, "Tech Override");

	const burst = resolveCanonicalPower("burse of speed", "force");
	assert.equal(burst.match, "exact-name");
	assert.equal(burst.canonical.name, "Burst of Speed");

	const phase = resolveCanonicalPower("phasestrike", "force");
	assert.equal(phase.match, "exact-name");
	assert.equal(phase.canonical.name, "Phasestrike");
});

test("scalar parsing handles Holodex stat blocks and SW5E lore skill keys", () => {
	const acklay = parseStatBlock(ACKLAY, { sourceName: "Acklay, Gladiator" });
	assert.equal(acklay.ac.value, 16);
	assert.equal(acklay.ac.calc, "natural");
	assert.equal(acklay.hp.value, 161);
	assert.equal(acklay.hp.formula, "14d12+70");
	assert.equal(acklay.cr, 12);
	assert.equal(acklay.movement.walk, 40);
	assert.equal(acklay.movement.swim, 40);

	const gemini = parseStatBlock(GEMINI_CONSPIRATOR, { sourceName: "GEMINI Conspirator Droid" });
	assert.equal(gemini.proficiencyBonus, 5);
	assert.equal(gemini.skills.lor.value, 1);
	assert.equal(gemini.skills.lor.ability, "int");
	assert.equal(gemini.skills.tec.value, 1);
	assert.equal(gemini.skills.prc.value, 1);
});

test("canonical weapon lookup resolves exact equipment matches", () => {
	const heavyPistol = resolveCanonicalWeapon("Heavy Pistol");
	assert.equal(heavyPistol.match, "exact-name");
	assert.equal(heavyPistol.canonical.name, "Heavy pistol");

	const techstaff = resolveCanonicalWeapon("Techstaff");
	assert.equal(techstaff.match, "exact-name");
	assert.equal(techstaff.canonical.name, "Techstaff");

	const venomous = resolveCanonicalWeapon("Venomous Vibrodagger");
	assert.equal(venomous.match, "none");
});

test("attack census and attack classification distinguish natural, canonical, and source-specific weapons", () => {
	const parsed = parseAuthoritativeSource();
	const census = buildAttackNameCensus(parsed.completeActorBlocks);
	assert.equal(census.attackNameCount, EXPECTED_ATTACK_NAME_COUNT);

	const bite = classifyAttackInstance({
		actorName: "Acklay, Gladiator",
		attackName: "Bite",
		creatureType: "beast",
		sourceSection: "Beastiary"
	});
	assert.equal(bite.classification, "validated-natural-weapon");

	const heavyPistol = classifyAttackInstance({
		actorName: "Grand Champion of the Great Hunt",
		attackName: "Heavy Pistol",
		creatureType: "humanoid",
		sourceSection: "Galaxy's Most Wanted"
	});
	assert.equal(heavyPistol.classification, "canonical-manufactured-weapon");

	const venomous = classifyAttackInstance({
		actorName: "Imperial Cipher Agent",
		attackName: "Venomous Vibrodagger",
		creatureType: "humanoid",
		sourceSection: "Galaxy's Most Wanted"
	});
	assert.equal(venomous.classification, "source-specific-manufactured-weapon");

	const biteRecord = census.attackNames.find(record => record.name === "Bite");
	assert.equal(biteRecord.occurrences, 51);
});

test("numeric guards accept finite values and reject unsafe formulas", () => {
	assert.equal(assertFiniteNumber(17, "path"), 17);
	assert.equal(assertSafeFormula("2d6+5", "formula"), "2d6+5");
	assert.throws(() => assertFiniteNumber(Number.NaN, "path"), /nonfinite/i);
	assert.throws(() => assertSafeFormula("NaN+2", "formula"), /unsafe formula/i);
	assert.throws(() => assertSafeFormula("undefined", "formula"), /unsafe formula/i);
});

console.log(`1..${total}`);
if (process.exitCode) process.exit(process.exitCode);
