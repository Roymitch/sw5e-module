import { resolveCanonicalWeapon } from "./canonical.mjs";
import { stripBlockquotes } from "./classify.mjs";

const NATURAL_WEAPON_NAMES = new Set([
	"acid spit",
	"antlers",
	"beak",
	"bite",
	"claw",
	"claws",
	"constrict",
	"crush",
	"engulf",
	"fist",
	"fling",
	"gore",
	"grasp",
	"hooves",
	"horn",
	"horns",
	"kick",
	"mandibles",
	"pincer",
	"pincers",
	"ram",
	"rend",
	"rock",
	"scratch",
	"shock",
	"slam",
	"slap",
	"spear tongue",
	"spit",
	"stinger",
	"sting",
	"tail",
	"tail slap",
	"talon",
	"talons",
	"tentacle",
	"tentacles",
	"tongue",
	"trample",
	"tusk",
	"tusks",
	"web"
]);

function normalizeAttackName(name) {
	return String(name || "")
		.trim()
		.replace(/\s+/g, " ");
}

export function extractAttackNames(blockBody) {
	const names = [];
	const lines = stripBlockquotes(blockBody).replace(/\r\n/g, "\n").split("\n");
	for (const line of lines) {
		const match = line.match(/^\*{2,3}([^*]+?)\.?\*{2,3}\s*\*?(?:Melee|Ranged) Weapon Attack:/i);
		if (!match) continue;
		names.push(normalizeAttackName(match[1]));
	}
	return names;
}

export function classifyAttackInstance({ actorName, attackName, creatureType, sourceSection }) {
	const normalized = normalizeAttackName(attackName);
	const canonical = resolveCanonicalWeapon(normalized);
	if (canonical.match === "exact-name") {
		return {
			actorName,
			attackName: normalized,
			creatureType,
			sourceSection,
			classification: "canonical-manufactured-weapon",
			canonical
		};
	}
	if (NATURAL_WEAPON_NAMES.has(normalized.toLowerCase())) {
		return {
			actorName,
			attackName: normalized,
			creatureType,
			sourceSection,
			classification: "validated-natural-weapon"
		};
	}
	return {
		actorName,
		attackName: normalized,
		creatureType,
		sourceSection,
		classification: "source-specific-manufactured-weapon"
	};
}

export function buildAttackNameCensus(actorBlocks = []) {
	const attackNames = new Map();
	for (const block of actorBlocks) {
		for (const attackName of extractAttackNames(block.body || "")) {
			const existing = attackNames.get(attackName) || {
				name: attackName,
				occurrences: 0,
				actors: []
			};
			existing.occurrences += 1;
			existing.actors.push(block.displayName);
			attackNames.set(attackName, existing);
		}
	}
	const records = [...attackNames.values()].sort((left, right) => {
		if (right.occurrences !== left.occurrences) return right.occurrences - left.occurrences;
		return left.name.localeCompare(right.name);
	});
	return {
		attackNameCount: records.length,
		attackNames: records
	};
}
