/**
 * Generalized IR -> actor YAML with scaffolded dnd5e 5.2.5 shapes.
 * The N2 edge-case path still emits sandbox IDs by default; the bounded N3a
 * production path can inject approved IDs, art, and exact feature accounting.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { loadAndCloneCanonicalWeapon } from "./canonical.mjs";
import { stripBlockquotes } from "./classify.mjs";
import { resolvePinnedItemIdentity } from "./identity.mjs";
import { COMMITTED_PACK_SOURCE, ROOT } from "./paths.mjs";

const SIZE_TO_CODE = {
	tiny: "tiny",
	small: "sm",
	medium: "med",
	large: "lg",
	huge: "huge",
	gargantuan: "grg"
};

const SIZE_TO_TOKEN_DIMENSIONS = {
	tiny: { width: 1, height: 1 },
	sm: { width: 1, height: 1 },
	med: { width: 1, height: 1 },
	lg: { width: 2, height: 2 },
	huge: { width: 3, height: 3 },
	grg: { width: 4, height: 4 }
};

const SKILL_KEY_MAP = {
	Acrobatics: "acr",
	"Animal Handling": "ani",
	Arcana: "arc",
	Athletics: "ath",
	Deception: "dec",
	History: "his",
	Insight: "ins",
	Intimidation: "itm",
	Investigation: "inv",
	Medicine: "med",
	Nature: "nat",
	Perception: "prc",
	Performance: "prf",
	Persuasion: "per",
	Piloting: "pil",
	Religion: "rel",
	"Sleight of Hand": "slt",
	Stealth: "ste",
	Survival: "sur"
};

const NATURAL_MELEE_WEAPON_NAMES = new Set([
	"bite",
	"claw",
	"claws",
	"slam",
	"tentacle",
	"gore",
	"sting",
	"beak",
	"talons",
	"hooves",
	"tusk",
	"tusks",
	"tail",
	"ram",
	"stomp"
]);

const NATURAL_RANGED_WEAPON_NAMES = new Set([
	"spit"
]);

function isNaturalWeaponAttackName(name) {
	const key = String(name || "").trim().toLowerCase();
	return NATURAL_MELEE_WEAPON_NAMES.has(key) || NATURAL_RANGED_WEAPON_NAMES.has(key);
}

let SCAFFOLDS = null;

function tempId(seed) {
	return crypto.createHash("sha256").update(`n2-sandbox:${seed}`).digest("hex").slice(0, 16);
}

function deepClone(value) {
	return structuredClone(value);
}

function walkYamlFiles(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) out.push(fullPath);
	}
	return out;
}

function loadScaffolds() {
	if ( !SCAFFOLDS ) {
		// Pin the scaffold source to a pre-N3 committed prototype so adding new
		// N3a YAML files cannot change generated output order or hashes.
		const preferredActorPath = path.join(COMMITTED_PACK_SOURCE, "beasts", "aiwha.yml");
		const actorPath = fs.existsSync(preferredActorPath)
			? preferredActorPath
			: walkYamlFiles(COMMITTED_PACK_SOURCE)
				.find(filePath => filePath.includes(`${path.sep}beasts${path.sep}`));
		if ( !actorPath ) throw new Error("[snv-monsters] unable to locate committed beast scaffold");
		const actor = yaml.load(fs.readFileSync(actorPath, "utf8"));
		const feat = actor.items?.find(item => item.type === "feat");
		const weapon = actor.items?.find(item => item.type === "weapon" && item.system?.activities);
		if ( !feat || !weapon ) {
			throw new Error("[snv-monsters] unable to derive feat/weapon scaffolds from committed pack source");
		}
		SCAFFOLDS = { actor, feat, weapon };
	}
	return {
		actor: deepClone(SCAFFOLDS.actor),
		feat: deepClone(SCAFFOLDS.feat),
		weapon: deepClone(SCAFFOLDS.weapon)
	};
}

function cleanFormula(formula) {
	return String(formula || "").replace(/\s+/g, "");
}

function titleCase(value) {
	return String(value || "").replace(/\b\w/g, character => character.toUpperCase());
}

function toHtmlParagraph(text) {
	const normalized = String(text || "")
		.replace(/\s+/g, " ")
		.replace(/\s+\./g, ".")
		.trim();
	return normalized ? `<p>${normalized}</p>` : "";
}

function parseHp(text) {
	const match = text.match(/Hit Points\**\s+(\d+)(?:\s*\(([^)]+)\))?/i);
	return {
		value: match ? Number(match[1]) : 1,
		formula: match?.[2]?.trim() || ""
	};
}

function parseAc(text) {
	const match = text.match(/Armor Class\**\s+(\d+)(?:\s*\(([^)]+)\))?/i);
	const note = match?.[2]?.trim() || "";
	return {
		value: match ? Number(match[1]) : 10,
		note,
		calc: /natural/i.test(note) ? "natural" : "flat"
	};
}

function parseCr(text) {
	const match = text.match(/Challenge\**\s+([0-9/]+)/i);
	if ( !match ) return "0";
	const raw = match[1];
	// Fractional CRs must be numeric (0.25) so YAML cannot emit sexagesimal `1/4`
	// and dnd5e Actor5e validation receives a finite number.
	if ( raw.includes("/") ) {
		const [numerator, denominator] = raw.split("/").map(Number);
		if ( !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0 ) return 0;
		return numerator / denominator;
	}
	// Preserve integer CR strings for existing N3a deterministic parity (`'0'`, `'2'`).
	return raw;
}

function parseProficiencyBonus(text) {
	const match = text.match(/Proficiency Bonus:\**\s*\+?(\d+)/i);
	return match ? Number(match[1]) : 2;
}

function parseDescriptor(text) {
	const lines = stripBlockquotes(text).split("\n").map(line => line.trim());
	const descriptorLine = lines.find(line => /^\*[^*]+\*$/.test(line));
	if ( !descriptorLine ) {
		return { size: "med", type: "custom", alignment: "", raw: "" };
	}
	const descriptor = descriptorLine.replace(/^\*|\*$/g, "").trim();
	const sizeMatch = descriptor.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
	const size = SIZE_TO_CODE[sizeMatch?.[1]?.toLowerCase() || "medium"] || "med";
	const afterSize = descriptor.replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+/i, "");
	const [typePart, alignmentPart = ""] = afterSize.split(/\s*,\s*/, 2);
	const normalizedType = /beast/i.test(typePart) ? "beast" : "custom";
	return {
		size,
		type: normalizedType,
		alignment: titleCase(alignmentPart || ""),
		raw: descriptor
	};
}

function parseAbilities(text) {
	const lines = stripBlockquotes(text).split("\n").map(line => line.trim());
	const row = lines.find(line => /\|(?:\s*\d+\s*\([^)]+\)\s*\|){6}/.test(line));
	const defaults = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	if ( !row ) return defaults;
	const values = row.split("|").map(cell => cell.trim()).filter(Boolean);
	const keys = ["str", "dex", "con", "int", "wis", "cha"];
	return keys.reduce((accumulator, key, index) => {
		const cell = values[index] || "";
		const match = cell.match(/(\d+)/);
		accumulator[key] = match ? Number(match[1]) : defaults[key];
		return accumulator;
	}, {});
}

function abilityMod(score) {
	return Math.floor((Number(score) - 10) / 2);
}

function parseMovement(text) {
	const movement = {
		walk: 0,
		burrow: 0,
		climb: 0,
		fly: 0,
		swim: 0,
		units: "ft",
		hover: false
	};
	const match = text.match(/Speed\**\s+([^\n]+)/i);
	if ( !match ) return movement;
	for ( const part of match[1].split(",").map(segment => segment.trim()) ) {
		const typed = part.match(/^(burrow|climb|fly|swim)\s+(\d+)\s*ft\.?/i);
		if ( typed ) {
			movement[typed[1].toLowerCase()] = Number(typed[2]);
			continue;
		}
		const walk = part.match(/^(\d+)\s*ft\.?/i);
		if ( walk ) movement.walk = Number(walk[1]);
	}
	return movement;
}

function parseSenses(text) {
	const senses = {
		darkvision: 0,
		blindsight: 0,
		tremorsense: 0,
		truesight: 0,
		units: "ft",
		special: ""
	};
	const match = text.match(/Senses\**\s+([^\n]+)/i);
	if ( !match ) return senses;
	for ( const part of match[1].split(",").map(segment => segment.trim()) ) {
		if ( /^passive Perception\b/i.test(part) ) continue;
		const typed = part.match(/^(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*ft\.?/i);
		if ( typed ) senses[typed[1].toLowerCase()] = Number(typed[2]);
	}
	return senses;
}

function parseSkills(text, abilities, proficiencyBonus) {
	const skills = {};
	const match = text.match(/Skills\**\s+([^\n]+)/i);
	if ( !match ) return skills;
	for ( const entry of match[1].split(",").map(part => part.trim()).filter(Boolean) ) {
		const skillMatch = entry.match(/^(.+?)\s+([+-]\d+)$/);
		if ( !skillMatch ) continue;
		const skillKey = SKILL_KEY_MAP[skillMatch[1].trim()];
		if ( !skillKey ) continue;
		const abilityKey = {
			ath: "str",
			ste: "dex",
			prc: "wis",
			sur: "wis"
		}[skillKey] || skillKey;
		const totalBonus = Number(skillMatch[2]);
		const delta = totalBonus - abilityMod(abilities[abilityKey]);
		let value = 0;
		let checkBonus = "";
		if ( delta === 0 ) value = 0;
		else if ( delta === proficiencyBonus ) value = 1;
		else if ( delta === proficiencyBonus * 2 ) value = 2;
		else if ( delta === Math.floor(proficiencyBonus / 2) ) value = 0.5;
		else checkBonus = String(delta);
		skills[skillKey] = { value, checkBonus };
	}
	return skills;
}

function parseFeatureEntries(text) {
	const entries = [];
	const lines = stripBlockquotes(text)
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map(line => line.trim());
	let section = "traits";
	let current = null;
	const flush = () => {
		if ( !current ) return;
		current.text = current.text.trim();
		if ( current.text ) entries.push(current);
		current = null;
	};
	for ( const line of lines ) {
		if ( /^###\s+Actions\b/i.test(line) ) {
			flush();
			section = "actions";
			continue;
		}
		if ( /^###\s+Reactions\b/i.test(line) ) {
			flush();
			section = "reactions";
			continue;
		}
		if ( /^###\s+Bonus Actions\b/i.test(line) ) {
			flush();
			section = "bonus-actions";
			continue;
		}
		if ( /^###\s+Legendary Actions\b/i.test(line) ) {
			flush();
			section = "legendary-actions";
			continue;
		}
		if ( !line || line === "___" || line === "\\pagebreakNum" || /^\|/.test(line) || /^##\s+/.test(line) || /^- \*\*/.test(line) ) {
			flush();
			continue;
		}
		const named = line.match(/^\*{2,3}([^*]+?)\.\*{2,3}\s*(.*)$/);
		if ( named ) {
			flush();
			current = { section, name: named[1].trim(), text: named[2].trim() };
			continue;
		}
		if ( current ) current.text += ` ${line}`;
	}
	flush();
	return entries;
}

function parseTargetCount(text) {
	const lower = String(text || "").toLowerCase();
	if ( /\bone target\b/.test(lower) ) return "1";
	if ( /\btwo targets\b/.test(lower) ) return "2";
	if ( /\bthree targets\b/.test(lower) ) return "3";
	return "";
}

function parseDamageFormula(hitText) {
	const parenthetical = hitText.match(/\(([^)]+)\)\s+([a-zA-Z]+)\s+damage/i);
	if ( parenthetical ) return { formula: cleanFormula(parenthetical[1]), type: parenthetical[2].toLowerCase() };
	const dice = hitText.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-zA-Z]+)\s+damage/i);
	if ( dice ) return { formula: cleanFormula(dice[1]), type: dice[2].toLowerCase() };
	const flat = hitText.match(/(\d+)\s+([a-zA-Z]+)\s+damage/i);
	if ( flat ) return { formula: flat[1], type: flat[2].toLowerCase() };
	return { formula: "", type: "" };
}

function activityDamageParts(formula, damageType) {
	if ( !formula || !damageType ) return [];
	const match = formula.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
	if ( match ) {
		return [{
			number: Number(match[1]),
			denomination: Number(match[2]),
			bonus: match[3] || "",
			types: [damageType],
			custom: { enabled: false, formula: "" },
			scaling: { mode: "", number: null, formula: "" }
		}];
	}
	return [{
		number: null,
		denomination: null,
		bonus: formula,
		types: [damageType],
		custom: { enabled: false, formula: "" },
		scaling: { mode: "", number: null, formula: "" }
	}];
}

function parseAttackEntry(entry) {
	const attackMatch = entry.text.match(
		/\*?(Melee|Ranged) Weapon Attack:\*?\s*([+-]\d+)\s*to hit,\s*(.*?)\.\s*\*?Hit:\*?\s*([^]+)$/i
	);
	if ( !attackMatch ) return null;
	const targetingClause = attackMatch[3].trim();
	const hitText = attackMatch[4].replace(/\s+/g, " ").trim().replace(/\.*$/, "");
	const reachMatch = targetingClause.match(/reach\s+(\d+)\s*ft\.?/i);
	const rangeMatch = targetingClause.match(/range\s+(\d+)(?:\/(\d+))?\s*ft\.?/i);
	const damage = parseDamageFormula(hitText);
	return {
		name: entry.name,
		section: entry.section,
		description: entry.text,
		kind: attackMatch[1].toLowerCase(),
		bonus: attackMatch[2],
		flatBonus: String(attackMatch[2]).replace(/^\+/, ""),
		reach: reachMatch ? Number(reachMatch[1]) : null,
		range: rangeMatch ? Number(rangeMatch[1]) : null,
		long: rangeMatch?.[2] ? Number(rangeMatch[2]) : null,
		targetCount: parseTargetCount(targetingClause),
		targetType: /target/i.test(targetingClause) ? "creature" : "",
		hit: hitText,
		damageFormula: damage.formula,
		damageType: damage.type
	};
}

function parseAttacks(text) {
	const entries = parseFeatureEntries(text)
		.filter(entry => entry.section === "actions")
		.map(parseAttackEntry)
		.filter(Boolean);
	if ( entries.length ) return entries;
	const attacks = [];
	const patterns = [
		/\*\*\*([^*]+)\.\*\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\.?/gi,
		/\*\*([^*]+)\.\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:\*\s*([^.]+)\.?/gi
	];
	for ( const pattern of patterns ) {
		let match;
		while ( (match = pattern.exec(text)) ) {
			const name = match[1].replace(/\*+/g, "").trim();
			if ( attacks.some(attack => attack.name.toLowerCase() === name.toLowerCase()) ) continue;
			const damage = parseDamageFormula(match[4].trim());
			attacks.push({
				name,
				kind: match[2].toLowerCase(),
				bonus: match[3],
				flatBonus: String(match[3]).replace(/^\+/, ""),
				description: match[4].trim(),
				hit: match[4].trim(),
				reach: null,
				range: null,
				long: null,
				targetCount: "",
				targetType: "",
				damageFormula: damage.formula,
				damageType: damage.type
			});
		}
	}
	return attacks;
}

function resolveFeatureImage(name, type, actorImg) {
	if ( type === "weapon" ) {
		if ( /bite/i.test(name) ) return "modules/sw5e-module/icons/packs/Naturals/Teeth.webp";
		if ( /claw/i.test(name) ) return "modules/sw5e-module/icons/packs/Naturals/Claws.webp";
		return actorImg || "icons/svg/sword.svg";
	}
	const exactTrait = `modules/sw5e-module/icons/packs/Monster Traits/${name}.webp`;
	const exactTraitPath = path.join(ROOT, exactTrait.replace("modules/sw5e-module/", "").replace(/\//g, path.sep));
	if ( fs.existsSync(exactTraitPath) ) return exactTrait;
	const fallbackMap = new Map([
		["Sure-Footed", "modules/sw5e-module/icons/packs/Monster Traits/Sure-footed.webp"],
		["Keen Hearing and Smell", "modules/sw5e-module/icons/packs/Monster Traits/Keen Senses.webp"],
		["Keen Hearing and Sight", "modules/sw5e-module/icons/packs/Monster Traits/Keen Senses.webp"]
	]);
	return fallbackMap.get(name) || actorImg || "icons/svg/mystery-man.svg";
}

function activationTypeForFeature(section, text) {
	if ( section === "actions" ) return "action";
	if ( /bonus action/i.test(text) ) return "bonus";
	if ( /\breaction\b/i.test(text) ) return "reaction";
	return "";
}

/**
 * Recognize bounded C7 on-hit Strength-save prone riders on the attack line itself.
 * Excludes charge/move triggers (C5/C6), grapple/restrain setups (C8), and affliction riders (C9).
 */
export function parseOnHitProneRider(attack) {
	const text = String(attack?.description || attack?.hit || "");
	if ( !text ) return null;
	if ( /moves at least\s+\d+\s+feet/i.test(text) ) return null;
	if ( /\bgrappled\b/i.test(text) && /\brestrained\b/i.test(text) ) return null;
	if ( /\bConstitution saving throw\b/i.test(text) ) return null;
	if ( /\b(paralyzed|poisoned|diseased)\b/i.test(text) ) return null;
	const match = text.match(
		/(?:If the target is (?:a )?(creature|Large or smaller)(?:,?\s*it)?|and the target) must succeed on a DC\s+(\d+)\s+Strength saving throw or be knocked prone/i
	);
	if ( !match ) return null;
	const restrictionRaw = match[1] || null;
	const targetingRestrictionMatch = text.match(/one target not grappled by the [^.]+/i);
	return {
		family: "on-hit-prone",
		attackName: titleCase(String(attack?.name || "").trim()),
		saveAbility: "str",
		saveDc: Number(match[2]),
		condition: "prone",
		targetRestriction: restrictionRaw && /large or smaller/i.test(restrictionRaw)
			? "large-or-smaller"
			: (restrictionRaw && /creature/i.test(restrictionRaw) ? "creature" : null),
		targetingRestriction: targetingRestrictionMatch ? targetingRestrictionMatch[0].trim() : null,
		runtimeAutomation: false
	};
}

/**
 * Recognize bounded C9 affliction riders on attack lines:
 * Con-save disease infection (long/progression) or Con-save paralysis with repeat saves.
 * Excludes C7 Strength prone, C8 grapple/restrain, and swallow-state text.
 */
export function parseAfflictionRider(attack) {
	const text = String(attack?.description || attack?.hit || "");
	if ( !text ) return null;
	if ( /\bswallowed\b/i.test(text) ) return null;
	if ( /\bgrappled\b/i.test(text) && /\brestrained\b/i.test(text) ) return null;
	if ( /\bStrength saving throw\b/i.test(text) && /\bknocked prone\b/i.test(text) ) return null;

	const disease = text.match(
		/DC\s+(\d+)\s+Constitution saving throw or become infected with ([^.]+)\./i
	);
	if ( disease ) {
		return {
			family: "affliction-disease",
			attackName: titleCase(String(attack?.name || "").trim()),
			saveAbility: "con",
			saveDc: Number(disease[1]),
			condition: "diseased",
			diseaseName: disease[2].trim(),
			durationClass: "long-rest-progression",
			runtimeAutomation: false
		};
	}

	const paralysis = text.match(
		/DC\s+(\d+)\s+Constitution saving throw\.?\s*On a failure,? (?:a |the )?creature is paralyzed for ([^.]+)\.\s*A creature paralyzed in this way can repeat the saving throw at end of each of its turns/i
	);
	if ( paralysis ) {
		return {
			family: "affliction-paralysis",
			attackName: titleCase(String(attack?.name || "").trim()),
			saveAbility: "con",
			saveDc: Number(paralysis[1]),
			condition: "paralyzed",
			duration: paralysis[2].trim(),
			repeatSave: "end-of-turn",
			runtimeAutomation: false
		};
	}

	return null;
}

/**
 * Recognize the bounded C6 Charge family only:
 * move + named attack hit + extra damage + Strength save or prone,
 * with no named bonus follow-up attack (C5) and no plain on-hit prone rider (C7).
 */
export function parseChargeDamageKnockdown(featureName, description) {
	if ( String(featureName || "").trim().toLowerCase() !== "charge" ) return null;
	const text = String(description || "");
	if ( /trampling charge/i.test(text) ) return null;
	if ( /\bbonus action\b/i.test(text) ) return null;
	if ( /\bif the target is prone\b/i.test(text) && /\bcan make\b/i.test(text) ) return null;
	const match = text.match(
		/moves at least\s+(\d+)\s+feet(?:\s+straight)?\s+toward a target(?:\s+and then|\s+and)\s+hits it with an?\s+([A-Za-z][A-Za-z '-]*?)\s+attack on (?:the same |that )?turn,\s*(?:the|that) target takes an extra\s+\d+\s*\(([^)]+)\)\s+([a-z]+)\s+damage\.\s*If the target is a(?:\s+(Large or smaller))?(?:\s*creature)?,?\s*it must succeed on a DC\s+(\d+)\s+Strength saving throw or be knocked prone\./i
	);
	if ( !match ) return null;
	return {
		family: "charge-damage-knockdown",
		moveFeet: Number(match[1]),
		triggerAttack: titleCase(match[2].trim()),
		extraDamage: cleanFormula(match[3]),
		damageType: String(match[4] || "").toLowerCase(),
		saveAbility: "str",
		saveDc: Number(match[6]),
		condition: "prone",
		targetRestriction: match[5] && /large or smaller/i.test(match[5]) ? "large-or-smaller" : null,
		runtimeAutomation: false
	};
}

/**
 * Recognize the bounded C5 Charge / Trampling Charge family only:
 * move + named trigger attack hit + Strength save or prone + named bonus follow-up attack if prone.
 * Excludes C6 extra-damage charges and C7 plain on-hit prone riders.
 */
export function parseChargeKnockdownFollowup(featureName, description) {
	const name = String(featureName || "").trim().toLowerCase();
	if ( name !== "charge" && name !== "trampling charge" ) return null;
	const text = String(description || "");
	if ( /takes an extra\s+\d+\s*\(/i.test(text) ) return null;
	const match = text.match(
		/moves at least\s+(\d+)\s+feet(?:\s+straight)?\s+toward a creature(?:\s+and then|\s+and)\s+hits it with an?\s+([A-Za-z][A-Za-z '-]*?)\s+attack on (?:the same |that )?turn,\s*(?:that|the) target must succeed on a DC\s+(\d+)\s+Strength saving throw or be knocked prone\.\s*If the target is prone,\s*(?:the|it)\s+[^.]*?\b(?:can make (?:another|one) attack with its ([A-Za-z][A-Za-z '-]*?)|can make (?:another|one) ([A-Za-z][A-Za-z '-]*?) attack)\b[^.]*\bas a bonus action/i
	);
	if ( !match ) return null;
	const followUpRaw = (match[4] || match[5] || "").trim();
	return {
		family: "charge-knockdown-followup",
		featureName: titleCase(String(featureName || "").trim()),
		moveFeet: Number(match[1]),
		triggerAttack: titleCase(match[2].trim()),
		saveAbility: "str",
		saveDc: Number(match[3]),
		condition: "prone",
		followUpAttack: titleCase(followUpRaw),
		followUpActivation: "bonus",
		sourceTriggerLabelPreserved: match[2].trim(),
		runtimeAutomation: false
	};
}

function buildFeatItem({ featScaffold, actorId, itemId, name, description, img, sourceSection, nonproduction, approvedBatch = null }) {
	const item = deepClone(featScaffold);
	item._id = itemId;
	item._key = `!actors.items!${actorId}.${itemId}`;
	item.name = name;
	item.img = img;
	item.effects = [];
	item.folder = null;
	item.flags = item.flags || {};
	item.flags.sw5e = item.flags.sw5e || {};
	const chargeDamageKnockdown = parseChargeDamageKnockdown(name, description);
	const chargeKnockdownFollowup = parseChargeKnockdownFollowup(name, description);
	item.flags.sw5e.snvMonsters = {
		prototype: nonproduction,
		classification: "non-weapon",
		kind: sourceSection === "actions" ? "featAction" : "featPassiveOrRider",
		sourceSection,
		prePublication: nonproduction,
		trackedPack: "snv-monsters",
		sandboxTemp: nonproduction,
		approvedBatch: nonproduction ? null : approvedBatch,
		...(chargeDamageKnockdown ? { chargeDamageKnockdown } : {}),
		...(chargeKnockdownFollowup ? { chargeKnockdownFollowup } : {})
	};
	const activationType = activationTypeForFeature(sourceSection, description);
	item.system.description.value = toHtmlParagraph(description);
	item.system.description.chat = "";
	item.system.source.custom = "SnV";
	item.system.activation.type = activationType;
	item.system.activation.cost = activationType ? 1 : null;
	item.system.activation.condition = "";
	item.system.damage.parts = [];
	item.system.damage.versatile = "";
	item.system.formula = "";
	item.system.uses.value = null;
	item.system.uses.max = "";
	item.system.uses.per = null;
	item.system.uses.recovery = "";
	item.system.uses.prompt = true;
	item.system.consume.type = "";
	item.system.consume.target = null;
	item.system.consume.amount = null;
	item.system.consume.scale = false;
	item.system.ability = "";
	item.system.actionType = "";
	item.system.chatFlavor = "";
	item.system.save.ability = "";
	item.system.save.dc = null;
	item.system.save.scaling = "spell";
	item.system.recharge.value = null;
	item.system.recharge.charged = false;
	item.system.attack.bonus = "";
	item.system.attack.flat = false;
	item.system.properties = [];
	return item;
}

function buildWeaponItem({ weaponScaffold, actorId, itemId, activityId, attack, description, img, isNatural, nonproduction, approvedBatch = null }) {
	const item = deepClone(weaponScaffold);
	const activityTemplate = deepClone(Object.values(weaponScaffold.system.activities || {})[0]);
	item._id = itemId;
	item._key = `!actors.items!${actorId}.${itemId}`;
	item.name = attack.name;
	item.img = img;
	item.effects = [];
	item.folder = null;
	item.flags = item.flags || {};
	item.flags.sw5e = item.flags.sw5e || {};
	const onHitProne = parseOnHitProneRider({
		...attack,
		description: description || attack.description || attack.hit,
		hit: description || attack.hit
	});
	const afflictionRider = parseAfflictionRider({
		...attack,
		description: description || attack.description || attack.hit,
		hit: description || attack.hit
	});
	item.flags.sw5e.snvMonsters = {
		prototype: nonproduction,
		classification: isNatural ? "natural" : "source-specific",
		kind: isNatural ? "weaponNatural" : "weaponSourceSpecific",
		sourceActionNames: [attack.name],
		duplicateActionProhibited: true,
		canonicalWeaponSource: null,
		ammoSource: null,
		prePublication: nonproduction,
		trackedPack: "snv-monsters",
		sandboxTemp: nonproduction,
		approvedBatch: nonproduction ? null : approvedBatch,
		...(onHitProne ? { onHitProne } : {}),
		...(afflictionRider ? { afflictionRider } : {})
	};
	item.system.description.value = toHtmlParagraph(description);
	item.system.description.chat = "";
	item.system.source.custom = "SnV";
	item.system.activation.type = "action";
	item.system.activation.cost = 1;
	item.system.activation.condition = "";
	item.system.range.value = attack.reach ?? attack.range;
	item.system.range.long = attack.long ?? null;
	item.system.range.units = attack.reach || attack.range ? "ft" : "";
	item.system.uses.value = null;
	item.system.uses.max = "";
	item.system.uses.per = null;
	item.system.uses.recovery = "";
	item.system.uses.prompt = true;
	item.system.consume.type = "";
	item.system.consume.target = null;
	item.system.consume.amount = null;
	item.system.consume.scale = false;
	item.system.ability = attack.kind === "ranged" ? "dex" : "str";
	item.system.actionType = attack.kind === "ranged" ? "rwak" : "mwak";
	item.system.chatFlavor = "";
	item.system.damage.parts = attack.damageFormula && attack.damageType ? [[attack.damageFormula, attack.damageType]] : [];
	item.system.damage.versatile = "";
	item.system.formula = "";
	item.system.save.ability = "";
	item.system.save.dc = null;
	item.system.save.scaling = "spell";
	item.system.ammo.target = null;
	item.system.ammo.value = null;
	item.system.ammo.use = null;
	item.system.ammo.types = [];
	item.system.properties = [];
	item.system.proficient = 1;
	item.system.type.value = isNatural ? "natural" : "simpleM";
	item.system.type.subtype = "";
	item.system.type.baseItem = "";
	item.system.attackBonus = attack.flatBonus;
	item.system.attack.bonus = "";
	item.system.attack.flat = false;
	item.system.activities = {
		[activityId]: {
			...activityTemplate,
			_id: activityId,
			type: "attack",
			activation: {
				type: "action",
				value: 1,
				condition: "",
				override: false
			},
			attack: {
				ability: "",
				bonus: attack.flatBonus,
				flat: true,
				type: {
					classification: "weapon",
					value: attack.kind
				},
				critical: {}
			},
			damage: {
				critical: {},
				includeBase: false,
				parts: activityDamageParts(attack.damageFormula, attack.damageType)
			},
			description: {},
			duration: {
				units: "inst",
				concentration: false,
				override: false
			},
			effects: [],
			range: {
				override: false,
				units: attack.reach || attack.range ? "ft" : "",
				value: attack.reach ? String(attack.reach) : (attack.range ? String(attack.range) : "")
			},
			target: {
				template: {
					contiguous: false,
					units: "ft",
					type: ""
				},
				affects: {
					choice: false,
					type: attack.targetType,
					count: attack.targetCount
				},
				override: false,
				prompt: true
			},
			consumption: {
				targets: [],
				scaling: { allowed: false },
				spellSlot: true
			},
			uses: {
				spent: 0,
				max: "",
				recovery: []
			},
			sort: 0
		}
	};
	return item;
}

function buildActorFromScaffold(actorScaffold, { irEntry, actorId, parsed, artwork, nonproduction, productionBatch = null, productionMetadata = null }) {
	const actor = deepClone(actorScaffold);
	const tokenDimensions = SIZE_TO_TOKEN_DIMENSIONS[parsed.descriptor.size] || SIZE_TO_TOKEN_DIMENSIONS.med;
	const metadata = productionMetadata || {
		outputSelection: "selected-n1-parity",
		productionReadiness: "prototype-validated",
		packPhase: "n3a-tracked"
	};
	const outputSelection = nonproduction ? irEntry.outputSelection : metadata.outputSelection;
	const productionReadiness = nonproduction ? irEntry.productionReadiness : metadata.productionReadiness;
	actor._id = actorId;
	actor._key = `!actors!${actorId}`;
	actor.name = irEntry.sourceName;
	actor.type = "npc";
	actor.img = artwork?.avatarPath || "systems/dnd5e/icons/svg/actors/npc.svg";
	actor.folder = artwork?.folderId || null;
	actor.effects = [];
	actor.items = [];
	actor.prototypeToken.name = irEntry.sourceName;
	actor.prototypeToken.width = tokenDimensions.width;
	actor.prototypeToken.height = tokenDimensions.height;
	actor.prototypeToken.texture.src = artwork?.tokenPath || artwork?.avatarPath || actor.img;
	actor.system.abilities.str.value = parsed.abilities.str;
	actor.system.abilities.dex.value = parsed.abilities.dex;
	actor.system.abilities.con.value = parsed.abilities.con;
	actor.system.abilities.int.value = parsed.abilities.int;
	actor.system.abilities.wis.value = parsed.abilities.wis;
	actor.system.abilities.cha.value = parsed.abilities.cha;
	actor.system.attributes.ac.flat = parsed.ac.value;
	actor.system.attributes.ac.calc = parsed.ac.calc;
	actor.system.attributes.ac.formula = "";
	actor.system.attributes.hp.value = parsed.hp.value;
	actor.system.attributes.hp.max = parsed.hp.value;
	actor.system.attributes.hp.temp = 0;
	actor.system.attributes.hp.tempmax = 0;
	actor.system.attributes.hp.formula = parsed.hp.formula;
	actor.system.attributes.movement.burrow = parsed.movement.burrow;
	actor.system.attributes.movement.climb = parsed.movement.climb;
	actor.system.attributes.movement.fly = parsed.movement.fly;
	actor.system.attributes.movement.swim = parsed.movement.swim;
	actor.system.attributes.movement.walk = parsed.movement.walk;
	actor.system.attributes.movement.units = parsed.movement.units;
	actor.system.attributes.movement.hover = parsed.movement.hover;
	actor.system.attributes.senses.darkvision = parsed.senses.darkvision;
	actor.system.attributes.senses.blindsight = parsed.senses.blindsight;
	actor.system.attributes.senses.tremorsense = parsed.senses.tremorsense;
	actor.system.attributes.senses.truesight = parsed.senses.truesight;
	actor.system.attributes.senses.units = parsed.senses.units;
	actor.system.attributes.senses.special = parsed.senses.special;
	actor.system.details.biography.value = "";
	actor.system.details.biography.public = "";
	actor.system.details.alignment = parsed.descriptor.alignment;
	actor.system.details.type.value = parsed.descriptor.type;
	actor.system.details.type.subtype = "";
	actor.system.details.type.swarm = "";
	actor.system.details.type.custom = "";
	actor.system.details.cr = parsed.cr;
	actor.system.details.source.custom = "SnV";
	actor.system.details.powerForceLevel = 0;
	actor.system.details.powerTechLevel = 0;
	actor.system.details.superiorityLevel = 0;
	actor.system.traits.size = parsed.descriptor.size;
	actor.system.traits.languages.value = [];
	actor.system.traits.languages.custom = "-";
	for ( const skill of Object.values(actor.system.skills || {}) ) {
		skill.value = 0;
		skill.bonuses.check = "";
		skill.bonuses.passive = "";
	}
	for ( const [skillKey, config] of Object.entries(parsed.skills) ) {
		if ( !actor.system.skills?.[skillKey] ) continue;
		actor.system.skills[skillKey].value = config.value;
		actor.system.skills[skillKey].bonuses.check = config.checkBonus;
		actor.system.skills[skillKey].bonuses.passive = "";
	}
	actor.flags = actor.flags || {};
	actor.flags.sw5e = actor.flags.sw5e || {};
	actor.flags.sw5e.snvMonsters = {
		prototype: nonproduction,
		temporaryId: nonproduction,
		notProductionIdentity: nonproduction,
		sourceEntry: irEntry.sourceName,
		sourceSection: irEntry.section,
		sourceOrder: irEntry.sourceOrder,
		sourceHash: irEntry.rawSourceHash,
		semanticKey: irEntry.semanticKey,
		generatorVersion: irEntry.generatorVersion,
		schemaVersion: irEntry.schemaVersion,
		parseStatus: irEntry.parseStatus,
		capabilityStatus: irEntry.capabilityStatus,
		outputSelection,
		productionReadiness,
		nonproduction,
		sandboxTemp: nonproduction,
		unsupportedMechanics: irEntry.unsupportedMechanics || [],
		generatedStatus: nonproduction ? "prototype" : "production",
		manualOverrideStatus: false,
		artwork: artwork ? {
			path: artwork.avatarPath,
			tokenPath: artwork.tokenPath,
			approval: artwork.approvalStatus || "approved",
			source: "module-existing",
			loreConfidence: artwork.loreAccuracy || "supported-by-exact-local-folder-name"
		} : {
			path: actor.img,
			approval: "fallback",
			source: "generator-default"
		},
		lastGeneratedHash: irEntry.rawSourceHash,
		prePublication: nonproduction,
		trackedPack: "snv-monsters",
		collectionId: "sw5e-module.snv-monsters",
		packPhase: nonproduction ? "n2-sandbox" : metadata.packPhase,
		reviewState: nonproduction ? "sandbox" : "offline-generated-awaiting-validation",
		worldCleanupFlag: nonproduction ? "snv-n2-sandbox-test" : ""
	};
	return actor;
}

function parseStatBlock(text) {
	const descriptor = parseDescriptor(text);
	const abilities = parseAbilities(text);
	const proficiencyBonus = parseProficiencyBonus(text);
	return {
		descriptor,
		ac: parseAc(text),
		hp: parseHp(text),
		cr: parseCr(text),
		proficiencyBonus,
		abilities,
		movement: parseMovement(text),
		senses: parseSenses(text),
		skills: parseSkills(text, abilities, proficiencyBonus),
		featureEntries: parseFeatureEntries(text)
	};
}

/**
 * Build an NPC actor from IR + raw body text.
 */
export function generateGeneralizedActor({ irEntry, body, actorId = null, nonproduction = true, productionContext = null }) {
	const text = stripBlockquotes(body);
	const id = actorId || tempId(irEntry.semanticKey || irEntry.sourceName);
	const parsed = parseStatBlock(text);
	const entriesByName = new Map(parsed.featureEntries.map(entry => [entry.name, entry]));
	const attacks = parseAttacks(text);
	const attacksByName = new Map(attacks.map(attack => [attack.name, attack]));
	const { actor: actorScaffold, feat: featScaffold, weapon: weaponScaffold } = loadScaffolds();
	const actor = buildActorFromScaffold(actorScaffold, {
		irEntry,
		actorId: id,
		parsed,
		artwork: productionContext?.artwork || null,
		nonproduction,
		productionBatch: productionContext?.batch || null,
		productionMetadata: productionContext?.metadata || null
	});
	const items = [];
	const exceptions = [];
	const exactFeatures = productionContext?.exactFeatures || null;
	const identityActor = productionContext?.identityActor || null;

	const addFeat = (name, sourceSection) => {
		const entry = entriesByName.get(name);
		if ( !entry ) {
			if ( exactFeatures ) throw new Error(`[snv-monsters] missing required source feature ${irEntry.sourceName}/${name}`);
			return;
		}
		const itemIdentity = identityActor ? resolvePinnedItemIdentity(identityActor, name, "feat") : null;
		items.push(buildFeatItem({
			featScaffold,
			actorId: id,
			itemId: itemIdentity?.id || tempId(`${id}:${name}`),
			name,
			description: entry.text,
			img: resolveFeatureImage(name, "feat", actor.img),
			sourceSection,
			nonproduction,
			approvedBatch: productionContext?.batch || null
		}));
	};

	const addWeapon = attack => {
		const isNatural = isNaturalWeaponAttackName(attack.name);
		const itemIdentity = identityActor ? resolvePinnedItemIdentity(identityActor, attack.name, "weapon") : null;
		const activityId = itemIdentity ? Object.values(itemIdentity.activities || {})[0]?.id : tempId(`${id}:${attack.name}:attack`);
		const canon = !isNatural ? loadAndCloneCanonicalWeapon(attack.name) : { ok: false };
		if ( canon.ok ) {
			const weaponDoc = canon.clone;
			weaponDoc._id = itemIdentity?.id || tempId(`${id}:${attack.name}`);
			weaponDoc.name = attack.name;
			weaponDoc._key = `!actors.items!${id}.${weaponDoc._id}`;
			weaponDoc.flags = weaponDoc.flags || {};
			weaponDoc.flags.sw5e = weaponDoc.flags.sw5e || {};
			weaponDoc.flags.sw5e.snvMonsters = {
				classification: "manufactured",
				kind: "weaponCarried",
				canonicalMatch: canon.resolved.canonical.path,
				ammoModel: "itemUses",
				sandboxTemp: nonproduction,
				prePublication: nonproduction,
				trackedPack: "snv-monsters"
			};
			items.push(weaponDoc);
			exceptions.push({
				type: "canonical-clone-with-overrides",
				weapon: attack.name,
				canonical: canon.resolved.canonical.path
			});
			return;
		}
		if ( !isNatural ) {
			if ( exactFeatures ) {
				throw new Error(`[snv-monsters] non-natural attack blocked in exact production batch: ${irEntry.sourceName}/${attack.name}`);
			}
			exceptions.push({
				type: "canonical-item-match-absent",
				weapon: attack.name,
				reason: canon.resolved?.reason || "no-match"
			});
		}
		items.push(buildWeaponItem({
			weaponScaffold,
			actorId: id,
			itemId: itemIdentity?.id || tempId(`${id}:${attack.name}`),
			activityId: activityId || tempId(`${id}:${attack.name}:attack`),
			attack,
			description: entriesByName.get(attack.name)?.text || attack.description || attack.hit,
			img: resolveFeatureImage(attack.name, "weapon", actor.img),
			isNatural,
			nonproduction,
			approvedBatch: productionContext?.batch || null
		}));
	};

	if ( exactFeatures ) {
		for ( const name of exactFeatures.passives || [] ) addFeat(name, "traits");
		for ( const name of exactFeatures.nonAttackActions || [] ) addFeat(name, "actions");
		for ( const name of exactFeatures.weaponAttacks || [] ) {
			const attack = attacksByName.get(name);
			if ( !attack ) throw new Error(`[snv-monsters] missing required source attack ${irEntry.sourceName}/${name}`);
			addWeapon(attack);
		}
	} else {
		for ( const attack of attacks ) addWeapon(attack);
	}

	if ( irEntry.features?.hasSave && !attacks.length ) {
		exceptions.push({ type: "save-only-action-not-fully-emitted", note: "save text detected; skeleton actor scalars only" });
	}
	for ( const mechanic of irEntry.unsupportedMechanics || [] ) {
		exceptions.push({ type: "unsupported-mechanic", mechanic });
	}

	actor.items = items;
	return {
		actor,
		exceptions,
		attacksParsed: attacks.length,
		parsedStatBlock: {
			ac: parsed.ac.value,
			hp: parsed.hp.value,
			cr: parsed.cr,
			size: parsed.descriptor.size
		}
	};
}
