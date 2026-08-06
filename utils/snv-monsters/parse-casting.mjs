/**
 * Parse SnV Forcecasting / Techcasting / Superiority trait blocks into structured IR.
 */
import { stripBlockquotes } from "./classify.mjs";
import { normalizeName } from "./parse-helpers.mjs";

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
			if ( !part ) return part;
			if ( part.includes("/") ) {
				return part.split("/").map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("/");
			}
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join(" ");
}

function extractItalicNames(chunk) {
	const names = [];
	const re = /\*([^*]+)\*/g;
	let match;
	while ( (match = re.exec(chunk)) ) {
		const raw = match[1].trim();
		if ( !raw || /^(?:at-?will|\d+(?:st|nd|rd|th)-?level|br)$/i.test(raw) ) continue;
		for ( const piece of raw.split(/,\s*/) ) {
			const cleaned = piece.replace(/<br\s*\/?>/gi, "").trim();
			if ( cleaned ) names.push(titleCasePower(cleaned));
		}
	}
	return names;
}

function parsePowerTiers(blockText) {
	const tiers = [];
	const text = String(blockText || "").replace(/<br\s*\/?>/gi, "\n");
	const tierRe = /(At-?\s*will|\d+\/day(?: each)?|\d+(?:st|nd|rd|th)-?\s*level)\s*:\s*([^\n]+)/gi;
	let match;
	while ( (match = tierRe.exec(text)) ) {
		const label = match[1].trim();
		const names = extractItalicNames(match[2]);
		let kind = "leveled";
		let level = null;
		let usesPerDay = null;
		if ( /^at-?\s*will$/i.test(label) ) {
			kind = "at-will";
			level = 0;
		} else if ( /(\d+)\/day/i.test(label) ) {
			kind = "per-day";
			usesPerDay = Number(RegExp.$1);
		} else {
			const levelMatch = label.match(/(\d+)/);
			level = levelMatch ? Number(levelMatch[1]) : null;
		}
		tiers.push({ label, kind, level, usesPerDay, powers: names });
	}
	return tiers;
}

/**
 * Parse a Forcecasting or Techcasting trait paragraph.
 * @param {"force"|"tech"} castType
 */
export function parseCastingTrait(body, castType) {
	const text = stripBlockquotes(body);
	const label = castType === "force" ? "Forcecasting" : "Techcasting";
	const casterWord = castType === "force" ? "forcecaster" : "techcaster";
	const pointsWord = castType === "force" ? "force points" : "tech points";
	const traitRe = new RegExp(
		`\\*{1,3}(?:Innate\\s+)?${label}\\.\\*{0,3}\\s*([\\s\\S]*?)(?=\\n\\*{1,3}[A-Z]|\\n###|\\n\\\\pagebreak|$)`,
		"i"
	);
	const traitMatch = text.match(traitRe);
	if ( !traitMatch ) {
		// Innate-only fallback
		const innate = [...text.matchAll(
			new RegExp(`innately cast(?:s|ing)?[^.]*\\*([^*]+)\\*[^.]*\\b${castType} power\\b[^.]*\\.`, "gi")
		)];
		if ( !innate.length ) return null;
		return {
			castType,
			mode: "innate",
			level: null,
			ability: null,
			abilityKey: null,
			saveDc: null,
			attackBonus: null,
			points: null,
			tiers: [{
				label: "innate",
				kind: "innate",
				level: null,
				usesPerDay: null,
				powers: innate.map(m => titleCasePower(m[1]))
			}],
			powerNames: innate.map(m => titleCasePower(m[1])),
			raw: innate.map(m => m[0]).join(" ")
		};
	}

	const block = traitMatch[1];
	const innateHeader = new RegExp(`Innate\\s+${label}`, "i").test(traitMatch[0]);
	const levelMatch = block.match(new RegExp(`(\\d+)(?:st|nd|rd|th)-level ${casterWord}`, "i"));
	const abilityMatch = block.match(new RegExp(
		`${castType}casting (?:ability|modifier) is (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)`,
		"i"
	));
	const dcMatch = block.match(new RegExp(`${castType} save DC\\s*(\\d+)`, "i"));
	const attackMatch = block.match(/\+(\d+)\s+to hit with (?:force|tech) (?:powers|attacks)/i);
	const pointsMatch = block.match(new RegExp(`(\\d+)\\s+${pointsWord}`, "i"));
	const ability = abilityMatch?.[1] || null;
	const tiers = parsePowerTiers(block);
	return {
		castType,
		mode: innateHeader ? "innate" : "standard",
		level: levelMatch ? Number(levelMatch[1]) : null,
		ability,
		abilityKey: ability ? ABILITY_MAP[ability.toLowerCase()] : null,
		saveDc: dcMatch ? Number(dcMatch[1]) : null,
		attackBonus: attackMatch ? Number(attackMatch[1]) : null,
		points: pointsMatch ? Number(pointsMatch[1]) : null,
		tiers,
		powerNames: tiers.flatMap(t => t.powers),
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
	if ( !/\bsuperiority (?:die|dice)\b/i.test(text)
		&& !/\bmaneuver save DC\b/i.test(text)
		&& !/knows the following maneuvers/i.test(text) ) {
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

export function castingHasNamedPowers(parsed) {
	return Boolean(parsed?.powerNames?.length || parsed?.tiers?.some(t => t.powers?.length));
}

export { normalizeName, titleCasePower, extractItalicNames, parsePowerTiers };
