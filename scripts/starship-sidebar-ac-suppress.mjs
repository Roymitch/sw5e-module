/**
 * Pure detectors for stock vehicle Armor Class sidebar pills-groups.
 * Kept free of Foundry globals so offline Node tests can import it.
 */

/**
 * Whether a pills-group is the stock vehicle Armor Class trait-line (not the portrait badge).
 * EDIT: config button `data-config="armorClass"`.
 * PLAY: `actor-trait-line` renders a `.counter` with `fa-shield` and no config button.
 * @param {HTMLElement|object} group
 * @returns {boolean}
 */
export function isStockVehicleArmorClassPillsGroup(group) {
	if ( !group || typeof group !== "object" ) return false;
	if ( globalThis.HTMLElement && !(group instanceof globalThis.HTMLElement) ) return false;
	if ( typeof group.classList?.contains === "function" ) {
		if ( !group.classList.contains("pills-group") ) return false;
	} else if ( typeof group.className === "string" ) {
		if ( !/\bpills-group\b/.test(group.className) ) return false;
	} else {
		return false;
	}
	if ( group.closest?.(".portrait, .sw5e-starship-ac-badge") ) return false;

	const className = typeof group.className === "string"
		? group.className
		: (typeof group.classList?.[Symbol.iterator] === "function" ? [...group.classList].join(" ") : "");
	if ( /\bsw5e-starship-/.test(className) ) return false;

	if ( group.querySelector?.("[data-action=\"showConfiguration\"][data-config=\"armorClass\"]") ) return true;

	const shieldIcon = group.querySelector?.("h3.icon > i.fa-shield:not(.fa-shield-halved)");
	const counter = group.querySelector?.("h3.icon > span.counter");
	return Boolean(shieldIcon && counter);
}
