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
import { parseCreatureTypeFromDescriptorPart, folderIdForCreatureType, resolveCreatureTypeFolderLabel } from "./creature-type-folders.mjs";
import { embedForceTechPowers, embedSuperiorityManeuvers } from "./embed-casting.mjs";
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
	Survival: "sur",
	Technology: "tec"
};

/** dnd5e / SW5e default ability per skill key. */
const SKILL_ABILITY_MAP = Object.freeze({
	acr: "dex",
	ani: "wis",
	arc: "int",
	ath: "str",
	dec: "cha",
	his: "int",
	ins: "wis",
	itm: "cha",
	inv: "int",
	med: "wis",
	nat: "int",
	prc: "wis",
	prf: "cha",
	per: "cha",
	pil: "int",
	rel: "int",
	slt: "dex",
	ste: "dex",
	sur: "wis",
	tec: "int"
});

/**
 * Fail closed when a generated numeric value is nonfinite.
 * @param {unknown} value
 * @param {string} path
 * @param {object} [context]
 */
export function assertFiniteNumber(value, path, context = {}) {
	if ( typeof value === "number" && Number.isFinite(value) ) return value;
	const detail = Object.entries(context).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
	throw new Error(`[snv-monsters] nonfinite numeric at ${path}${detail ? ` (${detail})` : ""}: ${String(value)}`);
}

/**
 * Fail closed when a formula string would evaluate with NaN / Infinity terms.
 * @param {string} formula
 * @param {string} path
 * @param {object} [context]
 */
export function assertSafeFormula(formula, path, context = {}) {
	const text = formula == null ? "" : String(formula);
	if ( text === "" ) return text;
	if ( /\bNaN\b/i.test(text) || /\bInfinity\b/i.test(text) || /\bundefined\b/i.test(text) ) {
		const detail = Object.entries(context).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ");
		throw new Error(`[snv-monsters] unsafe formula at ${path}${detail ? ` (${detail})` : ""}: ${JSON.stringify(text)}`);
	}
	return text;
}

const NATURAL_MELEE_WEAPON_NAMES = new Set([
	"bite",
	"claw",
	"claws",
	"slam",
	"tentacle",
	"tentacles",
	"gore",
	"sting",
	"beak",
	"talons",
	"hooves",
	"tusk",
	"tusks",
	"tail",
	"ram",
	"stomp",
	"gnash",
	"crush",
	"gigantic claw",
	"attach",
	"strangling tentacle",
	"pseudopod",
	"tendril"
]);

const NATURAL_RANGED_WEAPON_NAMES = new Set([
	"spit",
	"regurgitate",
	"throw boulder",
	"stone",
	"leap attack"
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
		const preferredActorPath = path.join(COMMITTED_PACK_SOURCE, "beast", "aiwha.yml");
		const actorPath = fs.existsSync(preferredActorPath)
			? preferredActorPath
			: walkYamlFiles(COMMITTED_PACK_SOURCE)
				.find(filePath => filePath.includes(`${path.sep}beast${path.sep}`));
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
		return { size: "med", type: "custom", subtype: "", swarm: "", custom: "", alignment: "", raw: "" };
	}
	const descriptor = descriptorLine.replace(/^\*|\*$/g, "").trim();
	const sizeMatch = descriptor.match(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/i);
	const size = SIZE_TO_CODE[sizeMatch?.[1]?.toLowerCase() || "medium"] || "med";
	const afterSize = descriptor.replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+/i, "");
	const [typePart, alignmentPart = ""] = afterSize.split(/\s*,\s*/, 2);
	const creatureType = parseCreatureTypeFromDescriptorPart(typePart);
	return {
		size,
		type: creatureType.value,
		subtype: creatureType.subtype,
		swarm: creatureType.swarm,
		custom: creatureType.custom,
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

function parseSkills(text, abilities, proficiencyBonus, { sourceName = null } = {}) {
	const skills = {};
	const match = text.match(/Skills\**\s+([^\n]+)/i);
	if ( !match ) return skills;
	const pb = assertFiniteNumber(Number(proficiencyBonus), "proficiencyBonus", { sourceName });
	for ( const entry of match[1].split(",").map(part => part.trim()).filter(Boolean) ) {
		const skillMatch = entry.match(/^(.+?)\s+([+-]\d+)$/);
		if ( !skillMatch ) continue;
		const skillName = skillMatch[1].trim();
		const skillKey = SKILL_KEY_MAP[skillName];
		if ( !skillKey ) continue;
		const abilityKey = SKILL_ABILITY_MAP[skillKey];
		if ( !abilityKey ) {
			throw new Error(`[snv-monsters] missing skill ability map for ${skillKey} (${skillName}) source=${sourceName}`);
		}
		const score = abilities?.[abilityKey];
		const mod = abilityMod(score);
		assertFiniteNumber(mod, `skills.${skillKey}.abilityMod`, {
			sourceName,
			skillName,
			abilityKey,
			score
		});
		const totalBonus = assertFiniteNumber(Number(skillMatch[2]), `skills.${skillKey}.totalBonus`, {
			sourceName,
			skillName
		});
		const delta = assertFiniteNumber(totalBonus - mod, `skills.${skillKey}.delta`, {
			sourceName,
			skillName,
			totalBonus,
			mod,
			pb
		});
		let value = 0;
		let checkBonus = "";
		if ( delta === 0 ) value = 0;
		else if ( delta === pb ) value = 1;
		else if ( delta === pb * 2 ) value = 2;
		else if ( delta === Math.floor(pb / 2) ) value = 0.5;
		else {
			// Residual flat bonus beyond ability; keep proficiency unset and encode residual in check bonus.
			checkBonus = assertSafeFormula(String(delta), `skills.${skillKey}.bonuses.check`, {
				sourceName,
				skillName,
				totalBonus,
				mod,
				pb
			});
		}
		skills[skillKey] = { value, checkBonus, ability: abilityKey };
	}
	return skills;
}

export { parseSkills, SKILL_KEY_MAP, SKILL_ABILITY_MAP };

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
	const withHit = entry.text.match(
		/\*?(Melee(?:\s+or\s+Ranged)?|Ranged) Weapon Attack:\*?\s*([+-]\d+)(?:\s*to hit)?,\s*(.*?)\.\s*\*?Hit:?\*?\s*([^]+)$/i
	);
	const withoutHit = withHit ? null : entry.text.match(
		/\*?(Melee(?:\s+or\s+Ranged)?|Ranged) Weapon Attack:\*?\s*([+-]\d+)(?:\s*to hit)?,\s*(.*?)\.\s*(.+)$/i
	);
	const attackMatch = withHit || withoutHit;
	if ( !attackMatch ) return null;
	const targetingClause = attackMatch[3].trim();
	const hitText = (attackMatch[4] || "").replace(/\s+/g, " ").trim().replace(/\.*$/, "");
	const reachMatch = targetingClause.match(/reach\s+(\d+)\s*ft\.?/i);
	const rangeMatch = targetingClause.match(/(?:range\s+|or\s+)(\d+)(?:\/(\d+))?\s*ft\.?/i);
	const dualMode = /melee\s+or\s+ranged/i.test(attackMatch[1]);
	const kind = dualMode ? "ranged" : attackMatch[1].toLowerCase();
	const damage = parseDamageFormula(hitText);
	return {
		name: entry.name,
		section: entry.section,
		description: entry.text,
		kind,
		dualMode,
		bonus: attackMatch[2],
		flatBonus: String(attackMatch[2]).replace(/^\+/, ""),
		reach: reachMatch ? Number(reachMatch[1]) : null,
		range: rangeMatch ? Number(rangeMatch[1]) : null,
		long: rangeMatch?.[2] ? Number(rangeMatch[2]) : null,
		targetCount: parseTargetCount(targetingClause),
		targetType: /target/i.test(targetingClause) ? "creature" : "",
		hit: hitText,
		damageFormula: damage.formula || "",
		damageType: damage.type || "kinetic",
		damageOptional: !withHit
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
		/\*\*\*([^*]+)\.\*\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:?\*\s*([^.]+)\.?/gi,
		/\*\*([^*]+)\.\*\*\s*\*(Melee|Ranged) Weapon Attack:\*\s*([+-]\d+)\s*to hit[\s\S]*?\*Hit:?\*\s*([^.]+)\.?/gi
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
	if ( section === "reactions" ) return "reaction";
	if ( section === "bonus-actions" ) return "bonus";
	if ( section === "legendary-actions" ) return "legendary";
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
		/DC\s+(\d+)\s+Constitution saving throw(?: against disease)? or become (?:infected with ([^.]+)|poisoned until the disease is cured)/i
	);
	if ( disease ) {
		const diseaseName = (disease[2] || "disease").trim();
		return {
			family: "affliction-disease",
			attackName: titleCase(String(attack?.name || "").trim()),
			saveAbility: "con",
			saveDc: Number(disease[1]),
			condition: disease[2] ? "diseased" : "poisoned",
			diseaseName,
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

	const poisonParalysis = text.match(
		/DC\s+(\d+)\s+Constitution saving throw or be poisoned for ([^.]+)\.\s*Until the poison ends, the target is paralyzed\.\s*The target can repeat the saving throw at the end of each of its turns, ending the poison on itself on a success/i
	);
	if ( poisonParalysis ) {
		return {
			family: "affliction-poison-paralysis",
			attackName: titleCase(String(attack?.name || "").trim()),
			saveAbility: "con",
			saveDc: Number(poisonParalysis[1]),
			condition: "poisoned",
			linkedCondition: "paralyzed",
			duration: poisonParalysis[2].trim(),
			repeatSave: "end-of-turn",
			runtimeAutomation: false
		};
	}

	const shortPoison = text.match(
		/DC\s+(\d+)\s+Constitution saving throw or be poisoned until the start of the (?:creature|target)'s next turn/i
	);
	if ( shortPoison ) {
		return {
			family: "affliction-poison-short",
			attackName: titleCase(String(attack?.name || "").trim()),
			saveAbility: "con",
			saveDc: Number(shortPoison[1]),
			condition: "poisoned",
			duration: "until-start-of-next-turn",
			runtimeAutomation: false
		};
	}

	return null;
}

/**
 * Recognize bounded grapple-conditional attack targeting
 * ("one target grappled by the …"). Does not automate the prerequisite.
 */
export function parseGrappleConditionalTarget(attack) {
	const text = String(attack?.description || "");
	const match = text.match(/one target grappled by the ([^.]+?)(?:\.|,|\s+\*?Hit)/i)
		|| String(attack?.description || attack?.hit || "").match(/one target grappled by the ([^.]+)/i);
	if ( !match ) return null;
	return {
		family: "grapple-conditional-target",
		attackName: titleCase(String(attack?.name || "").trim()),
		grapplerLabel: match[1].trim(),
		runtimeAutomation: false
	};
}

/**
 * Recognize Crush-style additional save-for-half damage on the attack hit line.
 */
export function parseAdditionalSaveDamageRider(attack) {
	const text = String(attack?.description || attack?.hit || "");
	const match = text.match(
		/DC\s+(\d+)\s+(Strength|Dexterity|Constitution) saving throw,\s*taking an additional\s+\d+\s*\(([^)]+)\)\s+([a-z]+)\s+damage on a failed save,\s*or half as much on a success/i
	);
	if ( !match ) return null;
	return {
		family: "additional-save-damage",
		attackName: titleCase(String(attack?.name || "").trim()),
		saveAbility: match[2].slice(0, 3).toLowerCase(),
		saveDc: Number(match[1]),
		damageFormula: cleanFormula(match[3]),
		damageType: String(match[4] || "").toLowerCase(),
		onSuccess: "half",
		runtimeAutomation: false
	};
}

/**
 * Recognize swallow-on-hit stacks for honest limitation metadata.
 * Preserves DC/damage facts without runtime automation.
 */
export function parseSwallowOnHitRider(attack) {
	const text = String(attack?.description || attack?.hit || "");
	if ( !/\bswallowed\b/i.test(text) ) return null;
	const save = text.match(/DC\s+(\d+)\s+(Dexterity|Strength) saving throw or be swallowed/i);
	const acid = text.match(/takes\s+\d+\s*\(([^)]+)\)\s+acid damage at the start of each/i);
	const regurgitate = text.match(/takes\s+(\d+)\s+damage or more on a single turn[\s\S]*?DC\s+(\d+)\s+Constitution/i);
	const capacity = text.match(/no more than (\w+) targets? swallowed/i);
	return {
		family: "swallow-on-hit",
		attackName: titleCase(String(attack?.name || "").trim()),
		saveAbility: save ? save[2].slice(0, 3).toLowerCase() : null,
		saveDc: save ? Number(save[1]) : null,
		ongoingAcidFormula: acid ? cleanFormula(acid[1]) : null,
		regurgitateDamageThreshold: regurgitate ? Number(regurgitate[1]) : null,
		regurgitateSaveDc: regurgitate ? Number(regurgitate[2]) : null,
		capacityNote: capacity ? capacity[1] : null,
		runtimeAutomation: false,
		limitation: "Swallow containment, ongoing acid, and regurgitation are description-preserved only."
	};
}

/**
 * Recognize bounded complex nonattack actions that remain description-complete
 * without full automation (Tentacle Slam, Swallow follow-up action).
 */
export function parseComplexActionLimitation(featureName, description) {
	const name = String(featureName || "").trim().toLowerCase();
	const text = String(description || "");
	if ( name === "engulf" ) {
		const save = text.match(/DC\s+(\d+)\s+Dexterity saving throw/i);
		const escape = text.match(/DC\s+(\d+)\s+Strength \(Athletics\)/i);
		return {
			family: "engulf",
			featureName: titleCase(String(featureName || "").trim()),
			saveAbility: "dex",
			saveDc: save ? Number(save[1]) : null,
			escapeDc: escape ? Number(escape[1]) : null,
			runtimeAutomation: false,
			limitation: "Engulf movement-into-space save, restrained/blinded ongoing acid, and escape checks are description-preserved only."
		};
	}
	if ( name === "infect host" || name === "acid spit" ) {
		return {
			family: name === "acid spit" ? "acid-spit-cone" : "infect-host",
			featureName: titleCase(String(featureName || "").trim()),
			runtimeAutomation: false,
			limitation: "Complex save cone / possession-transform rider is description-preserved only."
		};
	}
	if ( name === "tentacle slam" || name === "grapple slam" ) {
		const save = text.match(/DC\s+(\d+)\s+Constitution saving throw/i);
		return {
			family: name === "grapple slam" ? "grapple-slam" : "tentacle-slam",
			featureName: titleCase(String(featureName || "").trim()),
			saveAbility: "con",
			saveDc: save ? Number(save[1]) : null,
			requiresGrappledTargets: true,
			runtimeAutomation: false,
			limitation: "Batch save/stun against currently grappled targets is description-preserved only."
		};
	}
	if ( name === "swallow" ) {
		const size = text.match(/against a ([A-Za-z]+) or smaller creature it is grappling/i);
		const acid = text.match(/takes\s+\d+\s*\(([^)]+)\)\s+acid damage at the start of each/i);
		const regurgitate = text.match(/takes\s+(\d+)\s+damage or more on a single turn[\s\S]*?DC\s+(\d+)\s+Constitution/i);
		return {
			family: "swallow-action",
			featureName: "Swallow",
			requiresGrappledTarget: true,
			targetSizeMax: size ? size[1] : null,
			ongoingAcidFormula: acid ? cleanFormula(acid[1]) : null,
			regurgitateDamageThreshold: regurgitate ? Number(regurgitate[1]) : null,
			regurgitateSaveDc: regurgitate ? Number(regurgitate[2]) : null,
			runtimeAutomation: false,
			limitation: "Swallow follow-up attack, containment, ongoing acid, and regurgitation are description-preserved only."
		};
	}
	return null;
}

/**
 * Recognize bounded C8 attack-line grapple/restrain with optional escape DC.
 * Excludes swallow stacks, detachable appendages, and grapple-conditional finishers.
 */
export function parseGrappleRestrainRider(attack) {
	const text = String(attack?.description || attack?.hit || "");
	if ( !text ) return null;
	if ( /\bswallowed\b/i.test(text) ) return null;
	if ( /\bone target grappled by\b/i.test(text) ) return null;
	if ( /\bdestroying a tentacle\b/i.test(text) ) return null;

	const escapeMatch = text.match(/escape DC\s+(\d+)/i);
	const saveGrapple = text.match(
		/DC\s+(\d+)\s+Strength saving throw or be grappled\b/i
	);
	const autoGrapple = /(?:the target|it) is grappled\b/i.test(text);
	if ( !saveGrapple && !autoGrapple ) return null;

	const restrained = /\brestrained\b/i.test(text);
	return {
		family: "grapple-restrain",
		attackName: titleCase(String(attack?.name || "").trim()),
		saveAbility: saveGrapple ? "str" : null,
		saveDc: saveGrapple ? Number(saveGrapple[1]) : null,
		escapeDc: escapeMatch ? Number(escapeMatch[1]) : (saveGrapple ? Number(saveGrapple[1]) : null),
		conditions: restrained ? ["grappled", "restrained"] : ["grappled"],
		runtimeAutomation: false
	};
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
	if ( name !== "charge" && name !== "trampling charge" && name !== "savage leap" ) return null;
	const text = String(description || "");
	if ( /takes an extra\s+\d+\s*\(/i.test(text) ) return null;
	const match = text.match(
		/moves at least\s+(\d+)\s+feet(?:\s+straight)?\s+toward a creature(?:\s+and then|\s+and)\s+hits it with an?\s+([A-Za-z][A-Za-z '-]*?)\s+attack on (?:the same |that )?turn,\s*(?:that|the) target must succeed on a DC\s+(\d+)\s+Strength saving throw or be knocked prone\.\s*If the target is prone,\s*(?:the|it)\s+[^.]*?\b(?:can(?:\s+\w+)?\s+make (?:another|one) attack with its ([A-Za-z][A-Za-z '-]*?)|can(?:\s+\w+)?\s+make (?:another|one) ([A-Za-z][A-Za-z '-]*?) attack)\b[^.]*\bas a bonus action/i
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
	const complexActionLimitation = parseComplexActionLimitation(name, description);
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
		...(chargeKnockdownFollowup ? { chargeKnockdownFollowup } : {}),
		...(complexActionLimitation ? { complexActionLimitation } : {})
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
	const usesMatch = String(name || "").match(/\((\d+)\s*\/\s*Day\)/i);
	if ( usesMatch ) {
		const max = Number(usesMatch[1]);
		item.system.uses.value = max;
		item.system.uses.max = String(max);
		item.system.uses.per = "day";
		item.flags.sw5e.snvMonsters.limitedUses = {
			family: "per-day",
			max,
			runtimeAutomation: true
		};
	}
	const rechargeMatch = String(name || "").match(/\(Recharge\s+(\d+)(?:\s*-\s*(\d+))?\)/i);
	if ( rechargeMatch ) {
		item.system.recharge.value = Number(rechargeMatch[1]);
		item.system.recharge.charged = true;
		item.flags.sw5e.snvMonsters.recharge = {
			family: "recharge",
			min: Number(rechargeMatch[1]),
			max: rechargeMatch[2] ? Number(rechargeMatch[2]) : Number(rechargeMatch[1]),
			runtimeAutomation: true
		};
	}
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
	const grappleRestrain = parseGrappleRestrainRider({
		...attack,
		description: description || attack.description || attack.hit,
		hit: description || attack.hit
	});
	const grappleConditionalTarget = parseGrappleConditionalTarget({
		...attack,
		description: description || attack.description || attack.hit,
		hit: description || attack.hit
	});
	const additionalSaveDamage = parseAdditionalSaveDamageRider({
		...attack,
		description: description || attack.description || attack.hit,
		hit: description || attack.hit
	});
	const swallowOnHit = parseSwallowOnHitRider({
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
		...(attack.dualMode ? { attackModes: ["melee", "ranged"] } : {}),
		...(onHitProne ? { onHitProne } : {}),
		...(afflictionRider ? { afflictionRider } : {}),
		...(grappleRestrain ? { grappleRestrain } : {}),
		...(grappleConditionalTarget ? { grappleConditionalTarget } : {}),
		...(additionalSaveDamage ? { additionalSaveDamage } : {}),
		...(swallowOnHit ? { swallowOnHit } : {})
	};
	item.system.description.value = toHtmlParagraph(description);
	item.system.description.chat = "";
	item.system.source.custom = "SnV";
	item.system.activation.type = "action";
	item.system.activation.cost = 1;
	item.system.activation.condition = "";
	item.system.range.value = attack.kind === "ranged"
		? (attack.range ?? attack.reach)
		: (attack.reach ?? attack.range);
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
	const typeForFolder = {
		value: parsed.descriptor.type,
		subtype: parsed.descriptor.subtype || "",
		swarm: parsed.descriptor.swarm || "",
		custom: parsed.descriptor.custom || ""
	};
	const folderResolution = resolveCreatureTypeFolderLabel(typeForFolder);
	actor.folder = artwork?.folderId
		|| (folderResolution.unresolved ? null : folderIdForCreatureType(typeForFolder));
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
	actor.system.details.type.subtype = parsed.descriptor.subtype || "";
	actor.system.details.type.swarm = parsed.descriptor.swarm || "";
	actor.system.details.type.custom = parsed.descriptor.custom || "";
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
		if ( config.ability ) actor.system.skills[skillKey].ability = config.ability;
		actor.system.skills[skillKey].bonuses.check = assertSafeFormula(
			config.checkBonus ?? "",
			`actor.system.skills.${skillKey}.bonuses.check`,
			{ sourceName: irEntry.sourceName, skillKey }
		);
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
		worldCleanupFlag: nonproduction ? "snv-n2-sandbox-test" : "",
		folderTaxonomy: "foundry-creature-type",
		creatureTypeFolder: folderResolution.unresolved ? null : folderResolution.label
	};
	return actor;
}

function parseStatBlock(text, { sourceName = null } = {}) {
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
		skills: parseSkills(text, abilities, proficiencyBonus, { sourceName }),
		featureEntries: parseFeatureEntries(text)
	};
}

/**
 * Build an NPC actor from IR + raw body text.
 */
export function generateGeneralizedActor({ irEntry, body, actorId = null, nonproduction = true, productionContext = null }) {
	const text = stripBlockquotes(body);
	const id = actorId || tempId(irEntry.semanticKey || irEntry.sourceName);
	const parsed = parseStatBlock(text, { sourceName: irEntry.sourceName });
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
	const emittedFeatNames = new Set();

	const CASTING_FEAT_NAMES = new Set([
		"Forcecasting",
		"Techcasting",
		"Innate Forcecasting",
		"Innate Techcasting",
		"Superiority"
	]);

	const addFeat = (name, sourceSection) => {
		if ( CASTING_FEAT_NAMES.has(name)
			&& (irEntry.features?.hasForce || irEntry.features?.hasTech || irEntry.features?.hasSuperiority) ) {
			return;
		}
		if ( emittedFeatNames.has(name) ) {
			exceptions.push({
				type: "duplicate-source-feature-name",
				feature: name,
				sourceSection,
				note: "same feature name appeared in multiple source sections; emitted once"
			});
			return;
		}
		let entry = parsed.featureEntries.find(feature =>
			feature.name === name && feature.section === sourceSection
		) || parsed.featureEntries.find(feature => feature.name === name) || null;
		if ( !entry && name === "Legendary Actions" ) {
			const match = text.match(/###\s+Legendary Actions\b([\s\S]*?)(?=###\s+|\pagebreakNum|$)/i);
			if ( match ) {
				entry = {
					name,
					section: "legendary-actions",
					text: match[1].replace(/\s+/g, " ").trim()
				};
			}
		}
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
			sourceSection: entry.section || sourceSection,
			nonproduction,
			approvedBatch: productionContext?.batch || null
		}));
		emittedFeatNames.add(name);
	};

	const addWeapon = attack => {
		const isNatural = isNaturalWeaponAttackName(attack.name);
		const itemIdentity = identityActor ? resolvePinnedItemIdentity(identityActor, attack.name, "weapon") : null;
		const activityId = itemIdentity ? Object.values(itemIdentity.activities || {})[0]?.id : tempId(`${id}:${attack.name}:attack`);
		const canon = !isNatural ? loadAndCloneCanonicalWeapon(attack.name) : { ok: false };
		if ( canon.ok ) {
			const weaponDoc = canon.clone;
			const itemId = itemIdentity?.id || tempId(`${id}:${attack.name}`);
			const pinnedActivityId = activityId || tempId(`${id}:${attack.name}:attack`);
			const oldActivities = weaponDoc.system?.activities || {};
			const oldActivity = Object.values(oldActivities)[0] || {};
			weaponDoc._id = itemId;
			weaponDoc.name = attack.name;
			weaponDoc._key = `!actors.items!${id}.${itemId}`;
			weaponDoc.folder = null;
			weaponDoc.flags = weaponDoc.flags || {};
			weaponDoc.flags.sw5e = weaponDoc.flags.sw5e || {};
			weaponDoc.flags.sw5e.snvMonsters = {
				classification: "manufactured",
				kind: "weaponCarried",
				canonicalMatch: canon.resolved.canonical.path,
				ammoModel: "itemUses",
				sandboxTemp: nonproduction,
				prePublication: nonproduction,
				trackedPack: "snv-monsters",
				approvedBatch: nonproduction ? null : productionContext?.batch || null,
				sourceActionNames: [attack.name],
				duplicateActionProhibited: true
			};
			weaponDoc.system = weaponDoc.system || {};
			weaponDoc.system.source = weaponDoc.system.source || {};
			weaponDoc.system.source.custom = "SnV";
			weaponDoc.system.description = weaponDoc.system.description || {};
			weaponDoc.system.description.value = toHtmlParagraph(
				entriesByName.get(attack.name)?.text || attack.description || attack.hit || weaponDoc.system.description.value || ""
			);
			if ( attack.range != null || attack.long != null ) {
				weaponDoc.system.range = weaponDoc.system.range || {};
				if ( attack.range != null ) weaponDoc.system.range.value = attack.range;
				if ( attack.long != null ) weaponDoc.system.range.long = attack.long;
				weaponDoc.system.range.units = "ft";
			}
			if ( attack.damageFormula && attack.damageType ) {
				weaponDoc.system.damage = weaponDoc.system.damage || {};
				weaponDoc.system.damage.parts = [[attack.damageFormula, attack.damageType]];
			}
			if ( attack.flatBonus != null && attack.flatBonus !== "" ) {
				weaponDoc.system.attack = weaponDoc.system.attack || {};
				weaponDoc.system.attack.bonus = String(attack.flatBonus);
				weaponDoc.system.attack.flat = true;
				weaponDoc.system.attackBonus = attack.flatBonus;
			}
			weaponDoc.system.activities = {
				[pinnedActivityId]: {
					...oldActivity,
					_id: pinnedActivityId,
					attack: {
						...(oldActivity.attack || {}),
						bonus: attack.flatBonus != null && attack.flatBonus !== "" ? String(attack.flatBonus) : (oldActivity.attack?.bonus || ""),
						flat: attack.flatBonus != null && attack.flatBonus !== ""
					},
					damage: {
						...(oldActivity.damage || {}),
						parts: attack.damageFormula && attack.damageType
							? activityDamageParts(attack.damageFormula, attack.damageType)
							: (oldActivity.damage?.parts || [])
					}
				}
			};
			items.push(weaponDoc);
			return;
		}
		if ( !isNatural ) {
			exceptions.push({
				type: "canonical-item-match-absent",
				weapon: attack.name,
				reason: canon.resolved?.reason || "no-match",
				productionLimitation: Boolean(exactFeatures)
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
		for ( const name of exactFeatures.nonAttackActions || [] ) {
			const entry = entriesByName.get(name);
			addFeat(name, entry?.section || "actions");
		}
		for ( const name of exactFeatures.weaponAttacks || [] ) {
			const attack = attacksByName.get(name);
			if ( !attack ) {
				exceptions.push({
					type: "source-attack-parse-miss",
					weapon: name,
					reason: "classified-as-attack-but-parseAttackEntry-returned-null",
					productionLimitation: true
				});
				addFeat(name, "actions");
				continue;
			}
			addWeapon(attack);
		}
	} else {
		for ( const attack of attacks ) addWeapon(attack);
	}

	if ( irEntry.features?.hasSave && !attacks.length ) {
		exceptions.push({ type: "save-only-action-not-fully-emitted", note: "save text detected; skeleton actor scalars only" });
	}

	actor.items = items;
	const forceTechEmbed = embedForceTechPowers({
		actor,
		body: text,
		irEntry,
		actorIdentity: identityActor,
		nonproduction
	});
	exceptions.push(...forceTechEmbed.exceptions);
	const superiorityEmbed = embedSuperiorityManeuvers({
		actor,
		body: text,
		irEntry,
		actorIdentity: identityActor,
		nonproduction
	});
	exceptions.push(...superiorityEmbed.exceptions);

	const softUnsupportedMechanics = [];
	const softMechanics = new Set([
		"qualified-defense-parsing",
		"reaction-activity",
		"limited-uses-activity",
		"recharge-activity",
		"swarm-squad-ammo-policy",
		"legendary-actions"
	]);
	const forceEmbeddedOk = forceTechEmbed.embedded.some(e => e.castType === "force" && e.kind === "power");
	const techEmbeddedOk = forceTechEmbed.embedded.some(e => e.castType === "tech" && e.kind === "power");
	const superiorityEmbeddedOk = superiorityEmbed.embedded.some(e => e.kind === "maneuver")
		|| (superiorityEmbed.parsed && !(superiorityEmbed.parsed.maneuvers || []).length);
	if ( forceEmbeddedOk ) softMechanics.add("force-power-embedding-incomplete");
	if ( techEmbeddedOk ) softMechanics.add("tech-power-embedding-incomplete");
	if ( superiorityEmbeddedOk || !irEntry.features?.hasSuperiority ) softMechanics.add("superiority-embedding-incomplete");
	if ( forceEmbeddedOk || techEmbeddedOk ) softMechanics.add("power-list-embedding");

	for ( const mechanic of irEntry.unsupportedMechanics || [] ) {
		// Soft classifier flags that do not block descriptive production emission.
		if ( softMechanics.has(mechanic) ) {
			softUnsupportedMechanics.push(mechanic);
			continue;
		}
		exceptions.push({ type: "unsupported-mechanic", mechanic });
	}
	if ( softUnsupportedMechanics.length ) {
		actor.flags.sw5e.snvMonsters.softUnsupportedMechanics = softUnsupportedMechanics;
	}
	actor.flags.sw5e.snvMonsters.forceTechEmbedding = {
		forcePowers: forceTechEmbed.embedded.filter(e => e.castType === "force"),
		techPowers: forceTechEmbed.embedded.filter(e => e.castType === "tech"),
		missingCanonical: forceTechEmbed.exceptions.filter(e => e.type === "canonical-match-missing")
	};
	actor.flags.sw5e.snvMonsters.superiorityEmbedding = {
		maneuvers: superiorityEmbed.embedded,
		missingCanonical: superiorityEmbed.exceptions.filter(e => e.type === "canonical-match-missing")
	};

	return {
		actor,
		exceptions,
		attacksParsed: attacks.length,
		parsedStatBlock: {
			ac: parsed.ac.value,
			hp: parsed.hp.value,
			cr: parsed.cr,
			size: parsed.descriptor.size
		},
		forceTechEmbed,
		superiorityEmbed
	};
}
