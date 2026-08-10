import { stripBlockquotes } from "./classify.mjs";

const ABILITY_MAP = Object.freeze({
	strength: "str",
	dexterity: "dex",
	constitution: "con",
	intelligence: "int",
	wisdom: "wis",
	charisma: "cha"
});

function titleCasePower(name) {
	return String(name || "")
		.trim()
		.replace(/\s+/g, " ")
		.split(" ")
		.map(part => {
			if (!part) return part;
			if (part.includes("/")) {
				return part.split("/").map(piece => piece.charAt(0).toUpperCase() + piece.slice(1).toLowerCase()).join("/");
			}
			return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
		})
		.join(" ");
}

export function extractItalicNames(chunk) {
	const names = [];
	const matches = String(chunk || "").matchAll(/\*([^*]+)\*/g);
	for (const match of matches) {
		const raw = match[1].trim();
		if (!raw || /^(?:at[- ]?will|\d+(?:st|nd|rd|th)[- ]?level|\d+\/day(?: each)?)$/i.test(raw)) continue;
		for (const piece of raw.split(/,\s*/)) {
			const cleaned = piece
				.replace(/<br\s*\/?>/gi, "")
				.replace(/\s*\([^)]*cast[^)]*\)\s*/gi, " ")
				.trim();
			if (cleaned) names.push(titleCasePower(cleaned));
		}
	}
	if (names.length) return names;
	return String(chunk || "")
		.replace(/<br\s*\/?>/gi, "")
		.replace(/\*/g, "")
		.split(/,\s*/)
		.map(piece => piece.replace(/\.$/, "").trim())
		.filter(Boolean)
		.map(titleCasePower);
}

export function parsePowerTiers(blockText) {
	const tiers = [];
	const text = String(blockText || "").replace(/<br\s*\/?>/gi, "\n");
	const tierRe = /\*?(At[- ]?will|\d+\/day(?: each)?|\d+(?:st|nd|rd|th)[- ]level)\*?\s*:\s*([^\n]+)/gi;
	let match;
	while ((match = tierRe.exec(text))) {
		const label = match[1].trim();
		const names = extractItalicNames(match[2]);
		let kind = "leveled";
		let level = null;
		let usesPerDay = null;
		if (/^at[- ]?will$/i.test(label)) {
			kind = "at-will";
			level = 0;
		} else if (/(\d+)\/day/i.test(label)) {
			kind = "per-day";
			usesPerDay = Number(label.match(/(\d+)\/day/i)[1]);
		} else {
			const levelMatch = label.match(/(\d+)/);
			level = levelMatch ? Number(levelMatch[1]) : null;
		}
		tiers.push({ label, kind, level, usesPerDay, powers: names });
	}
	return tiers;
}

function parseGenericCastingMetadata(text) {
	const abilityMatch = text.match(/(?:force|tech)\s*casting (?:ability|modifier) is (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i)
		|| text.match(/innate\s+(?:force|tech)\s*casting ability is (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i);
	const saveMatch = text.match(/(?:power|force|tech) save DC\s*(\d+)/i)
		|| text.match(/\(save DC\s*(\d+)\)/i);
	const attackMatch = text.match(/\+(\d+)\s+to hit with (?:force|tech|power) (?:attacks|powers)/i);
	const pointsMatch = text.match(/(\d+)\s+(?:force|tech)\s+points/i);
	const levelMatch = text.match(/(\d+)(?:st|nd|rd|th)[- ]level (?:forcecaster|techcaster|caster)\b/i);
	const ability = abilityMatch?.[1] || null;
	return {
		ability,
		abilityKey: ability ? ABILITY_MAP[ability.toLowerCase()] : null,
		saveDc: saveMatch ? Number(saveMatch[1]) : null,
		attackBonus: attackMatch ? Number(attackMatch[1]) : null,
		points: pointsMatch ? Number(pointsMatch[1]) : null,
		level: levelMatch ? Number(levelMatch[1]) : null
	};
}

function parseInnateFallback(text, castType) {
	const regex = new RegExp(`innately cast(?:s|ing)?(?: the)?\\s*\\*([^*]+)\\*\\s*${castType}\\s+power\\b[^.]*\\.`, "gi");
	const innateMatches = [...text.matchAll(regex)];
	if (!innateMatches.length) return null;
	const windowStart = innateMatches[0].index || 0;
	const windowText = text.slice(windowStart, Math.min(text.length, windowStart + 400));
	const metadata = parseGenericCastingMetadata(windowText);
	const powerNames = innateMatches.map(match => titleCasePower(match[1]));
	return {
		castType,
		mode: "innate",
		level: metadata.level,
		ability: metadata.ability,
		abilityKey: metadata.abilityKey,
		saveDc: metadata.saveDc,
		attackBonus: metadata.attackBonus,
		points: metadata.points,
		tiers: [{
			label: "innate",
			kind: "innate",
			level: metadata.level,
			usesPerDay: null,
			powers: powerNames
		}],
		powerNames,
		raw: innateMatches.map(match => match[0]).join(" ")
	};
}

export function parseCastingTrait(body, castType) {
	const text = stripBlockquotes(body);
	const label = castType === "force" ? "Forcecasting" : "Techcasting";
	const traitRe = new RegExp(
		`\\*{1,3}(?:Innate\\s+)?${label}\\*{0,3}\\.?\\*{0,3}\\s*([\\s\\S]*?)(?=\\n\\*{1,3}(?!At[- ]?will|\\d+\\/day|\\d+(?:st|nd|rd|th)[- ]level)[A-Z]|\\n###|\\n\\\\pagebreak|$)`,
		"i"
	);
	const traitMatch = text.match(traitRe);
	if (!traitMatch) return parseInnateFallback(text, castType);

	const block = traitMatch[1];
	const metadata = parseGenericCastingMetadata(block);
	const tiers = parsePowerTiers(block);
	return {
		castType,
		mode: /Innate\s+Forcecasting|Innate\s+Techcasting/i.test(traitMatch[0]) ? "innate" : "standard",
		level: metadata.level,
		ability: metadata.ability,
		abilityKey: metadata.abilityKey,
		saveDc: metadata.saveDc,
		attackBonus: metadata.attackBonus,
		points: metadata.points,
		tiers,
		powerNames: tiers.flatMap(tier => tier.powers),
		raw: block.trim()
	};
}

export function parseForcecasting(body) {
	return parseCastingTrait(body, "force");
}

export function parseTechcasting(body) {
	return parseCastingTrait(body, "tech");
}

export function parseSuperiorityTrait(body) {
	const text = stripBlockquotes(body);
	if (/\bIokath Superiority\b/i.test(text)) return null;
	if (!/\bsuperiority (?:die|dice)\b/i.test(text)
		&& !/\bmaneuver save DC\b/i.test(text)
		&& !/knows the following maneuvers/i.test(text)) {
		return null;
	}
	const diceMatch = text.match(/(\d+)\s+superiority dice/i) || text.match(/has (\d+) superiority/i);
	const dieSizeMatch = text.match(/superiority die(?: is| of)? (?:a )?(d\d+)/i);
	const abilityMatch = text.match(/maneuver ability is (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i);
	const dcMatch = text.match(/maneuver save DC\s*(\d+)/i);
	const maneuverChunk = text.match(/knows the following maneuvers[:\s]*([\s\S]*?)(?=\n\*{1,3}[A-Z]|\n###|$)/i);
	const maneuvers = maneuverChunk ? extractItalicNames(maneuverChunk[1]) : [];
	return {
		dice: diceMatch ? Number(diceMatch[1]) : null,
		die: dieSizeMatch ? dieSizeMatch[1].toLowerCase() : null,
		ability: abilityMatch?.[1] || null,
		abilityKey: abilityMatch ? ABILITY_MAP[abilityMatch[1].toLowerCase()] : null,
		saveDc: dcMatch ? Number(dcMatch[1]) : null,
		maneuvers,
		raw: text.match(/[^\n]*(?:superiority|maneuver)[^\n]*/gi)?.join("\n") || ""
	};
}
