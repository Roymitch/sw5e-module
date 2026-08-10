import { stripBlockquotes } from "./classify.mjs";
import { parseCreatureTypeFromDescriptorPart } from "./creature-type-folders.mjs";
import { assertFiniteNumber, assertSafeFormula } from "./numeric-guards.mjs";

const SIZE_TO_CODE = Object.freeze({
	tiny: "tiny",
	small: "sm",
	medium: "med",
	large: "lg",
	huge: "huge",
	gargantuan: "grg"
});

const SKILL_KEY_MAP = Object.freeze({
	Acrobatics: "acr",
	"Animal Handling": "ani",
	Arcana: "lor",
	Athletics: "ath",
	Deception: "dec",
	History: "lor",
	Insight: "ins",
	Intimidation: "itm",
	Investigation: "inv",
	Lore: "lor",
	Medicine: "med",
	Nature: "nat",
	Perception: "prc",
	Performance: "prf",
	Persuasion: "per",
	Piloting: "pil",
	Religion: "lor",
	"Sleight of Hand": "slt",
	Stealth: "ste",
	Survival: "sur",
	Technology: "tec"
});

const SKILL_ABILITY_MAP = Object.freeze({
	acr: "dex",
	ani: "wis",
	ath: "str",
	dec: "cha",
	ins: "wis",
	itm: "cha",
	inv: "int",
	lor: "int",
	med: "wis",
	nat: "int",
	pil: "int",
	prc: "wis",
	prf: "cha",
	per: "cha",
	slt: "dex",
	ste: "dex",
	sur: "wis",
	tec: "int"
});

function titleCase(value) {
	return String(value || "").replace(/\b\w/g, character => character.toUpperCase());
}

function abilityMod(score) {
	return Math.floor((Number(score) - 10) / 2);
}

export function parseHp(text) {
	const match = text.match(/Hit Points\**\s+(\d+)(?:\s*\(([^)]+)\))?/i);
	return {
		value: match ? Number(match[1]) : 1,
		formula: match?.[2]?.trim().replace(/\s+/g, "") || ""
	};
}

export function parseAc(text) {
	const match = text.match(/Armor Class\**\s+(\d+)(?:\s*\(([^)]+)\))?/i);
	const note = match?.[2]?.trim() || "";
	return {
		value: match ? Number(match[1]) : 10,
		note,
		calc: /natural/i.test(note) ? "natural" : "flat"
	};
}

export function parseCr(text) {
	const match = text.match(/Challenge\**\s+([0-9/]+)/i);
	if (!match) return 0;
	const raw = match[1];
	if (raw.includes("/")) {
		const [numerator, denominator] = raw.split("/").map(Number);
		if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return 0;
		return numerator / denominator;
	}
	return Number(raw);
}

export function parseProficiencyBonus(text) {
	const explicit = text.match(/Proficiency Bonus:\**\s*\+?(\d+)/i);
	if (explicit) return Number(explicit[1]);
	const cr = parseCr(text);
	const numericCr = typeof cr === "number" ? cr : Number(cr);
	if (!Number.isFinite(numericCr)) return 2;
	if (numericCr >= 29) return 9;
	if (numericCr >= 25) return 8;
	if (numericCr >= 21) return 7;
	if (numericCr >= 17) return 6;
	if (numericCr >= 13) return 5;
	if (numericCr >= 9) return 4;
	if (numericCr >= 5) return 3;
	return 2;
}

export function parseDescriptor(text) {
	const lines = stripBlockquotes(text).split("\n").map(line => line.trim());
	const descriptorLine = lines.find(line => /^\*[^*]+\*$/.test(line));
	if (!descriptorLine) {
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

export function parseAbilities(text) {
	const lines = stripBlockquotes(text).split("\n").map(line => line.trim());
	const row = lines.find(line => /\|(?:\s*\d+\s*\([^)]+\)\s*\|){6}/.test(line));
	const defaults = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };
	if (!row) return defaults;
	const values = row.split("|").map(cell => cell.trim()).filter(Boolean);
	const keys = ["str", "dex", "con", "int", "wis", "cha"];
	return keys.reduce((result, key, index) => {
		const cell = values[index] || "";
		const match = cell.match(/(\d+)/);
		result[key] = match ? Number(match[1]) : defaults[key];
		return result;
	}, {});
}

export function parseMovement(text) {
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
	if (!match) return movement;
	for (const part of match[1].split(",").map(segment => segment.trim())) {
		const typed = part.match(/^(burrow|climb|fly|swim)\s+(\d+)\s*ft\.?/i);
		if (typed) {
			movement[typed[1].toLowerCase()] = Number(typed[2]);
			if (typed[1].toLowerCase() === "fly" && /\bhover\b/i.test(part)) movement.hover = true;
			continue;
		}
		const walk = part.match(/^(\d+)\s*ft\.?/i);
		if (walk) movement.walk = Number(walk[1]);
		if (/hover/i.test(part)) movement.hover = true;
	}
	return movement;
}

export function parseSenses(text) {
	const senses = {
		darkvision: 0,
		blindsight: 0,
		tremorsense: 0,
		truesight: 0,
		units: "ft",
		special: ""
	};
	const match = text.match(/Senses\**\s+([^\n]+)/i);
	if (!match) return senses;
	const special = [];
	for (const part of match[1].split(",").map(segment => segment.trim()).filter(Boolean)) {
		if (/^passive Perception\b/i.test(part)) continue;
		const typed = part.match(/^(darkvision|blindsight|tremorsense|truesight)\s+(\d+)\s*ft\.?/i);
		if (typed) {
			senses[typed[1].toLowerCase()] = Number(typed[2]);
		} else {
			special.push(part);
		}
	}
	senses.special = special.join(", ");
	return senses;
}

export function parseSkills(text, abilities, proficiencyBonus, { sourceName = null } = {}) {
	const skills = {};
	const match = text.match(/Skills\**\s+([^\n]+)/i);
	if (!match) return skills;
	const pb = assertFiniteNumber(Number(proficiencyBonus), "proficiencyBonus", { sourceName });
	for (const entry of match[1].split(",").map(part => part.trim()).filter(Boolean)) {
		const skillMatch = entry.match(/^(.+?)\s+([+-]\d+)$/);
		if (!skillMatch) continue;
		const skillName = skillMatch[1].trim();
		const skillKey = SKILL_KEY_MAP[skillName];
		if (!skillKey) continue;
		const abilityKey = SKILL_ABILITY_MAP[skillKey];
		const score = abilities?.[abilityKey];
		const mod = abilityMod(score);
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
		if (delta === 0) value = 0;
		else if (delta === pb) value = 1;
		else if (delta === pb * 2) value = 2;
		else if (delta === Math.floor(pb / 2)) value = 0.5;
		else {
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

export function parseFeatureEntries(text) {
	const entries = [];
	const lines = stripBlockquotes(text)
		.replace(/\r\n/g, "\n")
		.split("\n")
		.map(line => line.trim());
	let section = "traits";
	let current = null;
	const flush = () => {
		if (!current) return;
		current.text = current.text.trim();
		if (current.text) entries.push(current);
		current = null;
	};
	for (const line of lines) {
		if (/^###\s+Actions\b/i.test(line)) {
			flush();
			section = "actions";
			continue;
		}
		if (/^###\s+Reactions\b/i.test(line)) {
			flush();
			section = "reactions";
			continue;
		}
		if (/^###\s+Bonus Actions\b/i.test(line)) {
			flush();
			section = "bonus-actions";
			continue;
		}
		if (/^###\s+Legendary Actions\b/i.test(line)) {
			flush();
			section = "legendary-actions";
			continue;
		}
		if (!line || line === "___" || line === "\\pagebreakNum" || /^\|/.test(line) || /^##\s+/.test(line)) {
			flush();
			continue;
		}
		const named = line.match(/^\*{2,3}([^*]+?)\.?\*{2,3}\s*(.*)$/);
		if (named) {
			flush();
			current = { section, name: named[1].trim(), text: named[2].trim() };
			continue;
		}
		if (current) current.text += ` ${line}`;
	}
	flush();
	return entries;
}

export function parseStatBlock(text, { sourceName = null } = {}) {
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
