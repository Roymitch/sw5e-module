/**
 * Starship sidebar chrome + duplicate-control neutralization (Phase 6 G2+G3).
 * Includes complete scheduleStarshipDuplicateSizeNeutralize contract — move-only.
 */

import { getLegacyStarshipActorSystem } from "../starship-data.mjs";
import { STARSHIP_LEGACY_POWER_ROUTING_FLAG } from "../starship-routing-gate.mjs";
import { SETTINGS_NAMESPACE } from "../module-support.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import { isSw5eStarshipActor, STARSHIP_TIER_OPTIONS } from "../starship-sheet-ids.mjs";
import { formatStarshipInitiativeTotal } from "../starship-initiative-display.mjs";
import { getStarshipSidebarNameBlock } from "./starship-sheet-scroll.mjs";
import { buildSystemsCoreContext } from "./starship-sheet-core-context.mjs";
import {
	ensureStarshipMovementConfigBlocked,
	findStarshipSidebarPillsGroup,
	getStarshipSidebarAside,
	getStarshipSidebarShell,
	isStarshipSheetEditMode,
	suppressStockVehicleMovementSidebarForStarship
} from "./starship-sheet-sidebar.mjs";

export { formatStarshipInitiativeTotal, getStarshipInitiativeDisplayTotal } from "../starship-initiative-display.mjs";

function getSheetForm(root, app) {
	return app?.form
		?? (root instanceof HTMLFormElement ? root : root.querySelector("form"));
}

export function neutralizeDuplicateNativeTraitsSizeControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;
	const matches = Array.from(form.querySelectorAll("[name=\"system.traits.size\"]"));
	if ( matches.length <= 1 ) return;

	let canonical = form.querySelector("[data-sw5e-systems-authoritative-size][name=\"system.traits.size\"]")
		?? form.querySelector(".sw5e-starship-systems-core [name=\"system.traits.size\"]");
	if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

	for ( const el of matches ) {
		if ( el === canonical ) continue;
		el.removeAttribute("name");
		el.disabled = true;
		el.setAttribute("data-sw5e-neutralized", "duplicate-native-traits-size");
		el.setAttribute("aria-hidden", "true");
		el.tabIndex = -1;
		el.classList.add("sw5e-starship-neutralized-stock-size");
	}
}

/** Authoritative Systems-tab HP inputs (sole named submit controls when duplicates exist). */
const STARSHIP_HP_FIELD_AUTH = [
	["system.attributes.hp.value", "[data-sw5e-systems-authoritative-hp=\"value\"]"],
	["system.attributes.hp.max", "[data-sw5e-systems-authoritative-hp=\"max\"]"],
	["system.attributes.hp.temp", "[data-sw5e-systems-authoritative-hp=\"temp\"]"],
	["system.attributes.hp.tempmax", "[data-sw5e-systems-authoritative-hp=\"tempmax\"]"]
];

/**
 * dnd5e vehicle sheet can surface duplicate `[name="system.attributes.hp.*"]` in EDIT mode (e.g. header meter + Systems fuel).
 * Prefer marked Systems controls when present; otherwise keep the first named match.
 */
export function neutralizeDuplicateNativeHpControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;

	for ( const [path, authSel] of STARSHIP_HP_FIELD_AUTH ) {
		const matches = Array.from(form.querySelectorAll(`[name="${path}"]`));
		if ( matches.length <= 1 ) continue;

		let canonical = form.querySelector(`${authSel}[name="${path}"]`)
			?? form.querySelector(`.sw5e-starship-systems-core [name="${path}"]`);
		if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

		for ( const el of matches ) {
			if ( el === canonical ) continue;
			el.removeAttribute("name");
			el.disabled = true;
			el.setAttribute("data-sw5e-neutralized", "duplicate-native-hp");
			el.setAttribute("aria-hidden", "true");
			el.tabIndex = -1;
			el.classList.add("sw5e-starship-neutralized-stock-hp");
		}
	}
}

export function neutralizeDuplicateNativeAbilityControls(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const form = getSheetForm(root, app);
	if ( !form ) return;

	for ( const key of Object.keys(CONFIG?.DND5E?.abilities ?? CONFIG?.SW5E?.abilities ?? {}) ) {
		const path = `system.abilities.${key}.value`;
		const matches = Array.from(form.querySelectorAll(`[name="${path}"]`));
		if ( matches.length <= 1 ) continue;

		let canonical = form.querySelector(`[data-sw5e-overview-edit-ability="${key}"][name="${path}"]`);
		if ( !canonical || !matches.includes(canonical) ) {
			canonical = form.querySelector(`[data-sw5e-overview-authoritative-ability="${key}"][name="${path}"]`);
		}
		if ( !canonical || !matches.includes(canonical) ) canonical = matches[0];

		for ( const el of matches ) {
			if ( el === canonical ) continue;
			el.removeAttribute("name");
			el.disabled = true;
			el.setAttribute("data-sw5e-neutralized", "duplicate-native-ability");
			el.setAttribute("aria-hidden", "true");
			el.tabIndex = -1;
		}
	}
}

export function neutralizeStockVehicleAbilityControls(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = (app?.element instanceof HTMLElement ? app.element : null) ?? root;
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const block of shell.querySelectorAll(".sheet-stations .abilities, [data-application-part=\"stations\"] .abilities") ) {
		if ( !(block instanceof HTMLElement) ) continue;
		block.setAttribute("hidden", "");
		block.setAttribute("aria-hidden", "true");
		block.classList.add("sw5e-starship-neutralized-stock-abilities");

		for ( const el of block.querySelectorAll("[name^=\"system.abilities.\"], button, input, select, textarea, proficiency-cycle, a[data-action], [data-action], [data-config]")) {
			if ( el instanceof HTMLElement ) {
				if ( "name" in el ) el.removeAttribute("name");
				if ( "disabled" in el ) el.disabled = true;
				el.setAttribute("data-sw5e-neutralized", "stock-abilities");
				el.setAttribute("aria-hidden", "true");
				el.tabIndex = -1;
			}
		}
	}
}

/**
 * Hide stock dnd5e vehicle Hit Points UI so starships only show SW5E Hull + Shield in the custom sidebar.
 * dnd5e 5.2.x vehicle `sidebar.hbs` uses `div.pills-group` + heart icon for Hit Points (not `.meter-group`).
 * PLAY: hidden `input[name^="system.attributes.hp."]` exists inside the block.
 * EDIT: that block has no HP inputs until inline expand — it only exposes `button[data-config="hitPoints"]` on the header.
 */
export function suppressStockVehicleHpMeterForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = (app?.element instanceof HTMLElement ? app.element : null) ?? root;
	if ( !(shell instanceof HTMLElement) ) return;

	const markIfStockHpContainer = el => {
		if ( !(el instanceof HTMLElement) ) return;
		if ( el.classList.contains("sw5e-starship-sidebar-vitals") ) return;
		if ( el.closest(".sw5e-starship-sidebar-vitals") ) return;
		if ( el.closest(".sw5e-starship-panel") ) return;
		const hasHpNamedField = !!el.querySelector("[name^=\"system.attributes.hp.\"]");
		const isStockHitPointsHeader = !!el.querySelector("button[data-config=\"hitPoints\"]");
		if ( !hasHpNamedField && !isStockHitPointsHeader ) return;
		el.classList.add("sw5e-starship-suppress-stock-hp");
		el.setAttribute("hidden", "");
	};

	for ( const meter of shell.querySelectorAll(".meter-group") ) markIfStockHpContainer(meter);
	for ( const group of shell.querySelectorAll(".pills-group") ) markIfStockHpContainer(group);
}

/**
 * Hide stock vehicle Armor Class trait-line once the portrait AC badge is authoritative.
 * @param {HTMLElement} root
 * @param {Actor} actor
 * @param {Application} [app]
 */
export function suppressStockVehicleArmorClassForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app)
		?? (app?.element instanceof HTMLElement ? app.element : null)
		?? root;
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const btn of shell.querySelectorAll("[data-action=\"showConfiguration\"][data-config=\"armorClass\"]") ) {
		if ( !(btn instanceof HTMLElement) ) continue;
		if ( btn.closest(".sw5e-starship-ac-badge, .portrait .ac-badge") ) continue;
		const group = btn.closest(".pills-group");
		if ( !(group instanceof HTMLElement) ) continue;
		if ( group.closest(".portrait") ) continue;
		group.classList.add("sw5e-starship-suppress-stock-ac");
		group.setAttribute("hidden", "");
		group.setAttribute("aria-hidden", "true");
	}
}

export function getStoredStarshipTier(actor) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const raw = actor?.system?.details?.tier ?? legacySystem.details?.tier;
	const n = Number(raw);
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.trunc(n));
}

export function populateStarshipTierBadgeSelect(select, storedTier) {
	if ( !(select instanceof HTMLSelectElement) ) return;
	const current = Number.isFinite(Number(storedTier)) ? Math.max(0, Math.trunc(Number(storedTier))) : 0;
	const currentValue = String(current);
	const optionValues = new Set(STARSHIP_TIER_OPTIONS.map(String));
	select.replaceChildren();
	if ( !optionValues.has(currentValue) ) {
		const currentOption = document.createElement("option");
		currentOption.value = currentValue;
		currentOption.textContent = currentValue;
		currentOption.disabled = true;
		currentOption.selected = true;
		select.append(currentOption);
	}
	for ( const value of STARSHIP_TIER_OPTIONS ) {
		const option = document.createElement("option");
		option.value = String(value);
		option.textContent = String(value);
		if ( value === current ) option.selected = true;
		select.append(option);
	}
	select.value = currentValue;
}




export const STARSHIP_SUPPRESSED_SIDEBAR_OPTION_NAMES = new Set([
	"flags.dnd5e.showVehicleInitiative",
	"flags.dnd5e.showVehicleQuality",
	"flags.dnd5e.showVehicleAbilities",
	"system.attributes.actions.stations"
]);

export function isStarshipSidebarShellElement(el) {
	if ( !(el instanceof HTMLElement) ) return false;
	return el.matches(".sheet-sidebar, [data-application-part='sidebar'], .sidebar");
}

/**
 * Resolve the smallest row to hide for a stock vehicle sidebar option input.
 * EDIT mode slide-toggles are often direct children of `aside.sheet-sidebar` (no `.option` wrapper);
 * never climb to the sidebar shell itself.
 */
export function getStarshipSuppressedSidebarOptionRow(input) {
	if ( !(input instanceof HTMLElement) ) return null;

	const option = input.closest(".option");
	if ( option instanceof HTMLElement && !isStarshipSidebarShellElement(option) ) return option;

	const toggle = input.closest("label.slide-toggle, slide-toggle");
	if ( toggle instanceof HTMLElement && !isStarshipSidebarShellElement(toggle) ) return toggle;

	const label = input.closest("label");
	if ( label instanceof HTMLElement && !isStarshipSidebarShellElement(label) ) return label;

	const parent = label?.parentElement;
	if ( parent instanceof HTMLElement && !isStarshipSidebarShellElement(parent) ) return parent;

	return null;
}

export function suppressStockVehicleSidebarControlsForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const name of STARSHIP_SUPPRESSED_SIDEBAR_OPTION_NAMES ) {
		for ( const input of shell.querySelectorAll(`input[name="${name}"]`) ) {
			const row = getStarshipSuppressedSidebarOptionRow(input);
			if ( !(row instanceof HTMLElement) || isStarshipSidebarShellElement(row) ) continue;
			row.classList.add("sw5e-starship-suppress-stock-sidebar-option");
			row.setAttribute("hidden", "");
			row.setAttribute("aria-hidden", "true");
		}
	}

	for ( const group of shell.querySelectorAll(".pills-group") ) {
		if ( !group.querySelector("[name^=\"system.attributes.actions\"]") ) continue;
		group.classList.add("sw5e-starship-suppress-stock-sidebar-option");
		group.setAttribute("hidden", "");
		group.setAttribute("aria-hidden", "true");
	}

	for ( const pips of shell.querySelectorAll(".pips[data-prop=\"system.attributes.actions.spent\"]") ) {
		pips.classList.add("sw5e-starship-suppress-stock-action-pips");
		pips.setAttribute("hidden", "");
		pips.setAttribute("aria-hidden", "true");
	}
}

export function customizeStarshipPortraitBadges(root, actor, app = null, { runtime } = {}) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	const portrait = shell?.querySelector(".portrait");
	if ( !(portrait instanceof HTMLElement) ) return;
	const playMode = !isStarshipSheetEditMode(app);
	const tierEditable = app?.isEditable !== false && isStarshipSheetEditMode(app);
	portrait.classList.toggle("sw5e-starship-portrait--mode-play", playMode);
	portrait.classList.toggle("sw5e-starship-portrait--mode-edit", !playMode);

	const initLabel = localizeOrFallback("DND5E.Initiative", "Initiative");
	const initDisplay = formatStarshipInitiativeTotal(actor);
	let initWrapper = portrait.querySelector(".initiative-wrapper");

	if ( !(initWrapper instanceof HTMLElement) ) {
		initWrapper = document.createElement("div");
		initWrapper.className = "initiative-wrapper";
		portrait.prepend(initWrapper);
	}
	initWrapper.hidden = false;
	initWrapper.removeAttribute("hidden");
	initWrapper.style.removeProperty("display");
	let initBlock = initWrapper.querySelector(".initiative");
	if ( !(initBlock instanceof HTMLElement) ) {
		initBlock = document.createElement("div");
		initBlock.className = "initiative";
		initWrapper.append(initBlock);
	}
	initBlock.hidden = false;
	initBlock.removeAttribute("hidden");
	initBlock.style.removeProperty("display");
	initBlock.replaceChildren();
	const initSpan = document.createElement("span");
	initSpan.textContent = initDisplay;
	initBlock.append(initSpan);
	if ( playMode ) {
		initBlock.classList.add("rollable");
		initBlock.dataset.action = "roll";
		initBlock.dataset.type = "initiative";
		initBlock.setAttribute("aria-label", initLabel);
	} else {
		initBlock.classList.remove("rollable");
		initBlock.removeAttribute("data-action");
		initBlock.removeAttribute("data-type");
		initBlock.setAttribute("aria-label", initLabel);
	}

	for ( const badge of portrait.querySelectorAll(".loyalty-badge") ) {
		if ( !badge.querySelector("[name=\"system.attributes.quality.value\"]") ) continue;
		badge.classList.add("sw5e-starship-suppress-stock-quality");
		badge.setAttribute("hidden", "");
		badge.setAttribute("aria-hidden", "true");
	}

	const tierLabel = localizeOrFallback("SW5E.StarshipTier", "Starship Tier");
	const tierValue = buildSystemsCoreContext(actor, { runtime }).tierValue;
	const storedTier = getStoredStarshipTier(actor);
	let tierBadge = portrait.querySelector(".sw5e-starship-tier-badge");
	if ( !(tierBadge instanceof HTMLElement) ) {
		tierBadge = document.createElement("div");
		tierBadge.className = "loyalty-badge badge sw5e-starship-tier-badge sw5e-starship-system-path-scope";
		portrait.append(tierBadge);
	}
	tierBadge.classList.add("sw5e-starship-system-path-scope");
	tierBadge.hidden = false;
	tierBadge.removeAttribute("aria-hidden");
	tierBadge.dataset.tooltip = tierLabel;
	tierBadge.classList.toggle("sw5e-starship-tier-badge--editable", tierEditable);
	const tierDisplayNumber = Number(tierValue);
	const tierDisplay = Number.isFinite(tierDisplayNumber)
		? String(Math.max(0, Math.trunc(tierDisplayNumber)))
		: String(storedTier);
	if ( tierEditable ) {
		let select = tierBadge.querySelector("select[name=\"system.details.tier\"]");
		if ( !(select instanceof HTMLSelectElement) ) {
			tierBadge.textContent = "";
			select = document.createElement("select");
			select.name = "system.details.tier";
			select.className = "sw5e-starship-tier-badge-input sw5e-starship-tier-badge-select";
			select.dataset.dtype = "Number";
			select.setAttribute("aria-label", tierLabel);
			select.title = tierLabel;
			tierBadge.append(select);
		}
		populateStarshipTierBadgeSelect(select, storedTier);
		select.disabled = false;
	} else {
		let value = tierBadge.querySelector(".sw5e-starship-tier-badge-value");
		if ( !(value instanceof HTMLElement) ) {
			tierBadge.textContent = "";
			value = document.createElement("span");
			value.className = "sw5e-starship-tier-badge-value";
			tierBadge.append(value);
		}
		value.textContent = tierDisplay;
	}
	tierBadge.setAttribute("aria-label", `${tierLabel}: ${tierValue}`);

	injectStarshipPortraitAcBadge(portrait, actor, app, playMode);
}

/**
 * Character-parity Armor Class badge on the starship portrait.
 * PLAY: numeric AC. EDIT: cog → stock ArmorClassConfig (`data-config="armorClass"`).
 * @param {HTMLElement} portrait
 * @param {Actor} actor
 * @param {Application} [app]
 * @param {boolean} playMode
 */
export function injectStarshipPortraitAcBadge(portrait, actor, app, playMode) {
	if ( !(portrait instanceof HTMLElement) ) return;
	const acLabel = localizeOrFallback("DND5E.ArmorClass", "Armor Class");
	const acConfigLabel = localizeOrFallback("DND5E.ArmorConfig", "Armor Configuration");
	const acValue = Number(actor?.system?.attributes?.ac?.value);
	const acDisplay = Number.isFinite(acValue) ? String(Math.trunc(acValue)) : "—";
	const editable = app?.isEditable !== false && !playMode;

	let acBadge = portrait.querySelector(".sw5e-starship-ac-badge");
	if ( !(acBadge instanceof HTMLElement) ) {
		acBadge = document.createElement("div");
		acBadge.className = "ac-badge badge sw5e-starship-ac-badge";
		portrait.append(acBadge);
	}
	acBadge.classList.add("ac-badge", "badge", "sw5e-starship-ac-badge");
	acBadge.hidden = false;
	acBadge.removeAttribute("hidden");
	acBadge.setAttribute("aria-label", `${acLabel}: ${acDisplay}`);
	acBadge.replaceChildren();

	if ( editable ) {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "config-button unbutton";
		button.dataset.action = "showConfiguration";
		button.dataset.config = "armorClass";
		button.dataset.tooltip = "DND5E.ArmorConfig";
		button.setAttribute("aria-label", acConfigLabel);
		const icon = document.createElement("i");
		icon.className = "fas fa-cog";
		icon.setAttribute("inert", "");
		button.append(icon);
		acBadge.append(button);
	} else {
		const valueEl = document.createElement("div");
		valueEl.dataset.attribution = "attributes.ac";
		valueEl.dataset.attributionCaption = "DND5E.ArmorClass";
		valueEl.dataset.tooltipDirection = "DOWN";
		valueEl.textContent = acDisplay;
		acBadge.append(valueEl);
	}
}

export function applyStarshipSidebarChrome(root, actor, app = null, { runtime } = {}) {
	if ( !isSw5eStarshipActor(actor) ) return;
	suppressStockVehicleSidebarControlsForStarship(root, actor, app);
	customizeStarshipPortraitBadges(root, actor, app, { runtime });
	suppressStockVehicleArmorClassForStarship(root, actor, app);
	mountStarshipLegacyPowerRoutingSidebarToggle(root, actor, app);
}

export function getActorLegacyPowerRoutingFlag(actor) {
	return Boolean(actor?.getFlag?.(SETTINGS_NAMESPACE, STARSHIP_LEGACY_POWER_ROUTING_FLAG));
}

export function syncLegacyPowerRoutingToggleVisual(toggle, checked) {
	if ( !(toggle instanceof HTMLElement) ) return;
	const input = toggle.querySelector("input[data-sw5e-legacy-power-routing-toggle]");
	if ( input instanceof HTMLInputElement ) input.checked = Boolean(checked);
	const icon = toggle.querySelector("i");
	if ( icon ) icon.className = checked ? "fa-solid fa-toggle-on" : "fa-solid fa-toggle-off";
}

/**
 * Place Show Power Routing inside `aside.sheet-sidebar` at the Abilities Display Options slot.
 * Never anchors to sheet-header Play/Edit toggles or `app.element` prepend.
 * @param {HTMLElement} aside
 * @param {HTMLElement} toggle
 */
export function placeStarshipLegacyPowerRoutingSidebarToggle(aside, toggle) {
	if ( !(aside instanceof HTMLElement) || !(toggle instanceof HTMLElement) ) return;

	const abilitiesInput = aside.querySelector('input[name="flags.dnd5e.showVehicleAbilities"]');
	const abilitiesRow = abilitiesInput
		? getStarshipSuppressedSidebarOptionRow(abilitiesInput)
		: null;
	if ( abilitiesRow instanceof HTMLElement && abilitiesRow.parentElement === aside ) {
		if ( toggle.nextElementSibling !== abilitiesRow ) {
			abilitiesRow.insertAdjacentElement("beforebegin", toggle);
		}
		return;
	}

	const nameBlock = aside.querySelector(":scope > .name")
		?? getStarshipSidebarNameBlock(aside);
	if ( nameBlock instanceof HTMLElement && nameBlock.parentElement === aside ) {
		if ( toggle.previousElementSibling !== nameBlock ) {
			nameBlock.insertAdjacentElement("afterend", toggle);
		}
		return;
	}

	if ( toggle.parentElement !== aside ) aside.append(toggle);
}

/**
 * Edit-mode sidebar option: per-actor legacy Power Routing override.
 * Mounted in the stock Show Abilities slot (Abilities is suppressed on starships).
 */
export function mountStarshipLegacyPowerRoutingSidebarToggle(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	const existing = shell.querySelector("[data-sw5e-starship-legacy-routing-toggle]");
	if ( !isStarshipSheetEditMode(app) ) {
		existing?.remove();
		return;
	}

	const aside = getStarshipSidebarAside(shell);
	if ( !(aside instanceof HTMLElement) ) return;

	const checked = getActorLegacyPowerRoutingFlag(actor);
	const labelText = localizeOrFallback(
		"SW5E.StarshipSheet.ShowLegacyPowerRouting",
		"Show Power Routing"
	);
	const tooltipText = localizeOrFallback(
		"SW5E.StarshipSheet.ShowLegacyPowerRoutingTooltip",
		"Show legacy Power Routing controls"
	);
	const flagPath = `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`;

	let toggle = existing;
	if ( !(toggle instanceof HTMLElement) ) {
		toggle = document.createElement("label");
		toggle.className = "slide-toggle header-interactable sw5e-starship-legacy-routing-toggle";
		toggle.dataset.sw5eStarshipLegacyRoutingToggle = "1";

		const input = document.createElement("input");
		input.type = "checkbox";
		input.name = flagPath;
		input.dataset.sw5eLegacyPowerRoutingToggle = "1";

		const icon = document.createElement("i");
		icon.setAttribute("inert", "");

		toggle.append(input, document.createTextNode(labelText), icon);
	} else {
		const input = toggle.querySelector("input[data-sw5e-legacy-power-routing-toggle]");
		let node = input?.nextSibling;
		while ( node && node.nodeType !== Node.TEXT_NODE ) node = node.nextSibling;
		if ( node?.nodeType === Node.TEXT_NODE ) node.textContent = labelText;
	}

	placeStarshipLegacyPowerRoutingSidebarToggle(aside, toggle);

	toggle.title = tooltipText;
	toggle.dataset.tooltip = tooltipText;
	toggle.setAttribute("aria-label", labelText);

	syncLegacyPowerRoutingToggleVisual(toggle, checked);
}

/**
 * Stock sheet may insert duplicates after paint — one sync neutralize plus one
 * current-generation post-paint pass (double rAF). Prior generations cancel.
 * @param {HTMLElement} root
 * @param {object} app
 * @param {Actor} actor
 */
export function scheduleStarshipDuplicateSizeNeutralize(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	if ( !app ) return;

	const run = () => {
		neutralizeDuplicateNativeTraitsSizeControls(root, app, actor);
		neutralizeDuplicateNativeHpControls(root, app, actor);
		neutralizeDuplicateNativeAbilityControls(root, app, actor);
		neutralizeStockVehicleAbilityControls(root, actor, app);
		suppressStockVehicleHpMeterForStarship(root, actor, app);
		suppressStockVehicleMovementSidebarForStarship(root, actor, app);
		applyStarshipSidebarChrome(root, actor, app);
		ensureStarshipMovementConfigBlocked(root, app, actor);
	};

	const gen = (app._sw5eDupNeutralizeGen = (Number(app._sw5eDupNeutralizeGen) || 0) + 1);

	if ( app._sw5eDupNeutralizeOuterRaf != null ) {
		window.cancelAnimationFrame(app._sw5eDupNeutralizeOuterRaf);
		app._sw5eDupNeutralizeOuterRaf = null;
	}
	if ( app._sw5eDupNeutralizeInnerRaf != null ) {
		window.cancelAnimationFrame(app._sw5eDupNeutralizeInnerRaf);
		app._sw5eDupNeutralizeInnerRaf = null;
	}

	run();

	app._sw5eDupNeutralizeOuterRaf = window.requestAnimationFrame(() => {
		app._sw5eDupNeutralizeOuterRaf = null;
		if ( app._sw5eDupNeutralizeGen !== gen ) return;

		app._sw5eDupNeutralizeInnerRaf = window.requestAnimationFrame(() => {
			app._sw5eDupNeutralizeInnerRaf = null;
			if ( app._sw5eDupNeutralizeGen !== gen ) return;
			if ( app.rendered === false ) return;
			const shell = app.element;
			if ( !(shell instanceof HTMLElement) ) return;
			if ( root instanceof HTMLElement && root !== shell && !shell.contains(root) ) return;

			run();
		});
	});
}


