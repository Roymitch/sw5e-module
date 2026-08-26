/**
 * Starship initiative badge display total (Bug 24 / Phase 0A-D).
 * Rebuilds from prepared roll-path components; excludes vehicle quality;
 * does not read or strip init.total.
 */

/**
 * Numeric contribution from a prepared bonus field for Starship initiative display.
 * Empty / non-finite → null (omit from sum). Does not invent schema defaults.
 * @param {*} bonus
 * @param {object} [rollData]
 * @returns {number|null}
 */
export function simplifyPreparedInitiativeBonus(bonus, rollData = {}) {
	if ( bonus === null || bonus === undefined ) return null;
	if ( typeof bonus === "string" && !bonus.trim() ) return null;
	let value;
	try {
		const simplifyBonus = globalThis.dnd5e?.utils?.simplifyBonus;
		if ( typeof simplifyBonus === "function" ) value = simplifyBonus(bonus, rollData);
		else value = Number(bonus);
	} catch {
		value = Number(bonus);
	}
	return Number.isFinite(value) ? value : null;
}

/**
 * Starship initiative badge total from prepared roll-path components.
 * @param {Actor|object} actor
 * @returns {number|null}
 */
export function getStarshipInitiativeDisplayTotal(actor) {
	const system = actor?.system;
	const init = system?.attributes?.init;
	if ( !init || (typeof init !== "object") ) return null;

	const rollData = typeof actor.getRollData === "function" ? actor.getRollData() : {};
	let total = 0;
	let hasComponent = false;

	const mod = Number(init.mod);
	if ( Number.isFinite(mod) ) {
		total += mod;
		hasComponent = true;
	}

	const initiativeBonus = simplifyPreparedInitiativeBonus(init.bonus, rollData);
	if ( initiativeBonus !== null ) {
		total += initiativeBonus;
		hasComponent = true;
	}

	const abilityId = init.ability
		|| globalThis.CONFIG?.DND5E?.defaultAbilities?.initiative
		|| "dex";
	const ability = system.abilities?.[abilityId];
	const abilityCheckBonus = simplifyPreparedInitiativeBonus(ability?.bonuses?.check, rollData);
	if ( abilityCheckBonus !== null ) {
		total += abilityCheckBonus;
		hasComponent = true;
	}

	const globalCheckBonus = simplifyPreparedInitiativeBonus(system.bonuses?.abilities?.check, rollData);
	if ( globalCheckBonus !== null ) {
		total += globalCheckBonus;
		hasComponent = true;
	}

	const prof = init.prof;
	if ( prof?.hasProficiency ) {
		const flat = Number(prof.flat);
		if ( Number.isFinite(flat) ) {
			total += flat;
			hasComponent = true;
		}
	}

	const flags = actor?.flags?.dnd5e ?? {};
	if ( flags.initiativeAlert ) {
		const rulesVersion = globalThis.game?.settings?.get?.("dnd5e", "rulesVersion");
		if ( rulesVersion === "legacy" ) {
			total += 5;
			hasComponent = true;
		}
	}

	return hasComponent ? total : null;
}

/**
 * Format Starship initiative badge text from roll-aligned display total.
 * @param {Actor|object} actor
 * @returns {string}
 */
export function formatStarshipInitiativeTotal(actor) {
	const rebuilt = getStarshipInitiativeDisplayTotal(actor);
	const total = Number.isFinite(rebuilt) ? rebuilt : 0;
	if ( typeof globalThis.foundry?.utils?.formatNumber === "function" ) {
		return globalThis.foundry.utils.formatNumber(total, { signDisplay: "always" });
	}
	return total >= 0 ? `+${total}` : `${total}`;
}
