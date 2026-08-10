import { stripBlockquotes } from "./classify.mjs";

/**
 * Minimal source accounting aligned with the Phase 0 census:
 * - weapon attacks: only Melee/Ranged Weapon Attack lines
 * - non-attack actions: named action entries that are not weapon attacks
 * - passives: named trait/reaction/legendary entries outside casting/superiority wrappers
 */
export function classifySourceFeatures(body) {
	const text = stripBlockquotes(body);
	const weaponAttacks = [];
	const nonAttackActions = [];
	const passives = [];
	const actionBlock = text.match(/###\s+Actions\b([\s\S]*?)(?=###\s+|\\pagebreakNum|$)/i)?.[1] || "";
	const featureNamePatterns = [
		/\*\*\*([^*]+?)\.?\*\*\*/g,
		/\*\*([^*]+?)\.\*\*/g
	];
	const attackNamePatterns = [
		/\*\*\*([^*]+?)\.?\*\*\*\s*\*?(?:Melee|Ranged) Weapon Attack:/gi,
		/\*\*([^*]+?)\.\*\*\s*\*?(?:Melee|Ranged) Weapon Attack:/gi
	];
	for (const attackNamePattern of attackNamePatterns) {
		let match;
		while ((match = attackNamePattern.exec(actionBlock))) weaponAttacks.push(match[1].trim());
	}
	const actionNames = [];
	for (const featureNamePattern of featureNamePatterns) {
		actionNames.push(...[...actionBlock.matchAll(featureNamePattern)].map(match => match[1].trim()));
	}
	for (const name of actionNames) {
		if (weaponAttacks.includes(name)) continue;
		if (/^the target must/i.test(name)) continue;
		nonAttackActions.push(name);
	}
	const traitRegion = text.split(/###\s+Actions\b/i)[0] || text;
	for (const featureNamePattern of featureNamePatterns) {
		for (const match of traitRegion.matchAll(featureNamePattern)) {
			const name = match[1].trim();
			if (/^(?:Innate\s+)?(?:Force|Tech)casting$/i.test(name)) continue;
			if (/^Superiority$/i.test(name)) continue;
			if (/^the target must/i.test(name)) continue;
			if (/^(Armor Class|Hit Points|Speed|Challenge|Proficiency Bonus|Saving Throws|Skills|Damage|Condition|Senses|Languages)\b/i.test(name)) continue;
			passives.push(name);
		}
	}
	return {
		passives: [...new Set(passives)],
		nonAttackActions: [...new Set(nonAttackActions)],
		weaponAttacks: [...new Set(weaponAttacks)]
	};
}
