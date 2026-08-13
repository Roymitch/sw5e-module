/**
 * Starship sheet primary tabs / Features PART (Phase 6 F1).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getModulePath } from "../module-support.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import {
	CUSTOM_STARSHIP_TAB_IDS,
	SOTG_SUB_TAB_IDS,
	isSw5eStarshipActor,
	STARSHIP_FEATURES_TAB_ID,
	STARSHIP_TAB_ID,
	STOCK_CARGO_TAB_ID,
	STOCK_FEATURES_TAB_ID,
	STOCK_STARSHIP_TAB_ORDER
} from "../starship-sheet-ids.mjs";
import { scheduleStarshipModificationsSectionHeader } from "./starship-sheet-inventory.mjs";

/**
 * Read icon/svg from the live CharacterActorSheet TABS record.
 * Does not mutate CharacterActorSheet.TABS.
 * @param {string} characterTabId
 * @returns {{ icon?: string, svg?: string }}
 */
function getCharacterSheetTabVisual(characterTabId) {
	const tabs = globalThis.dnd5e?.applications?.actor?.CharacterActorSheet?.TABS;
	const rec = Array.isArray(tabs) ? tabs.find(tab => tab?.tab === characterTabId) : null;
	if ( !rec || (typeof rec !== "object") ) return {};
	const visual = {};
	if ( typeof rec.icon === "string" && rec.icon ) visual.icon = rec.icon;
	if ( typeof rec.svg === "string" && rec.svg ) visual.svg = rec.svg;
	return visual;
}

/**
 * Copy character-sheet icon/svg onto a starship tab record when missing.
 * @param {object} tab
 * @param {string} characterTabId
 * @returns {object}
 */
function applyCharacterSheetTabVisual(tab, characterTabId) {
	if ( !tab || (typeof tab !== "object") ) return tab;
	const visual = getCharacterSheetTabVisual(characterTabId);
	if ( visual.icon && !tab.icon ) tab.icon = visual.icon;
	if ( visual.svg && !tab.svg ) tab.svg = visual.svg;
	return tab;
}

function makeStarshipCoreTabDescriptor() {
	return {
		tab: STARSHIP_TAB_ID,
		label: "SW5E.StarshipSheet.CoreTab",
		...getCharacterSheetTabVisual("details"),
		condition: actor => isSw5eStarshipActor(actor)
	};
}

function makeStarshipFeaturesTabDescriptor() {
	return {
		tab: STARSHIP_FEATURES_TAB_ID,
		label: "DND5E.Features",
		...getCharacterSheetTabVisual("features"),
		condition: actor => isSw5eStarshipActor(actor)
	};
}

function dedupeTabs(tabs = []) {
	const seen = new Set();
	return tabs.filter(tab => {
		const id = tab?.tab;
		if ( !id || seen.has(id) ) return false;
		seen.add(id);
		return true;
	});
}

function ensureStarshipPrimaryTabOrder(tabs, { includeCore = false } = {}) {
	const map = new Map(dedupeTabs(tabs).map(tab => [tab.tab, tab]));
	const ordered = [];
	const push = tabId => {
		const tab = map.get(tabId);
		if ( !tab ) return;
		ordered.push(tab);
		map.delete(tabId);
	};

	if ( includeCore ) push(STARSHIP_TAB_ID);
	push(STOCK_CARGO_TAB_ID);
	push(STARSHIP_FEATURES_TAB_ID);
	push("effects");
	push("description");
	for ( const tab of map.values() ) ordered.push(tab);
	return ordered;
}

export function getPrimaryTabNav(root) {
	return root.querySelector(".sheet-navigation[data-group='primary']")
		?? root.querySelector("[data-application-part='tabs'] .sheet-navigation")
		?? root.querySelector("[data-application-part='tabs'] .tabs")
		?? root.querySelector("nav.tabs[data-group='primary']")
		?? root.querySelector("nav.tabs")
		?? root.querySelector(".tabs[data-group='primary']");
}

export function getPrimaryTabPanelParent(root) {
	return root.querySelector(".tab[data-group='primary']")?.parentElement
		?? root.querySelector("#tabs")
		?? root.querySelector(".tab-body")
		?? root.querySelector("[data-application-part='inventory']")?.parentElement
		?? root.querySelector(".sheet-body")
		?? root.querySelector(".window-content")
		?? root;
}

export function getTabButton(root, tabId) {
	return getPrimaryTabNav(root)?.querySelector(`[data-tab="${tabId}"]`) ?? null;
}

export function getTabButtons(nav) {
	return Array.from(nav?.querySelectorAll("[data-tab]") ?? []);
}

export function getTabLabel(button) {
	return button?.textContent?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

export function getStockFeaturesTabButton(nav) {
	return getTabButtons(nav).find(button => {
		if ( CUSTOM_STARSHIP_TAB_IDS.has(button.dataset.tab) ) return false;
		return button.dataset.tab === STARSHIP_FEATURES_TAB_ID || button.dataset.tab === STOCK_FEATURES_TAB_ID;
	}) ?? null;
}

export function hideStockCrewTab(nav) {
	const crewButton = getTabButtons(nav).find(button => button.dataset.tab === "crew");
	if ( !crewButton ) return;
	crewButton.classList.add("sw5e-starship-hidden-tab");
	crewButton.hidden = true;
	crewButton.setAttribute("aria-hidden", "true");
}

function setStarshipTabAccessibleName(button, label) {
	if ( !(button instanceof HTMLElement) || !label ) return;
	button.setAttribute("aria-label", label);
	if ( !button.hasAttribute("data-tooltip") ) button.setAttribute("data-tooltip", "");
}

export function configureStarshipPrimaryTabLabels(nav) {
	if ( !nav ) return;
	const coreButton = nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	setStarshipTabAccessibleName(coreButton, localizeOrFallback("SW5E.StarshipSheet.CoreTab", "Core"));
	const inventoryButton = nav.querySelector(`[data-tab="${STOCK_CARGO_TAB_ID}"]`);
	const inventoryLabel = game.i18n.localize("DND5E.Inventory");
	setStarshipTabAccessibleName(
		inventoryButton,
		inventoryLabel && inventoryLabel !== "DND5E.Inventory" ? inventoryLabel : "Inventory"
	);
	const featuresButton = nav.querySelector(`[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`);
	setStarshipTabAccessibleName(featuresButton, getStarshipFeaturesTabLabel());
	hideStockCrewTab(nav);
}

export function getStarshipFeaturesTabLabel() {
	const label = game.i18n.localize("DND5E.Features");
	return label && label !== "DND5E.Features" ? label : "Features";
}

export function registerStarshipFeaturesTabPart() {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS?.PARTS ) return;

	const recoveryColumnTemplate = getModulePath("templates/inventory/columns/starship-recovery.hbs");
	if ( !VAS.PARTS[STARSHIP_FEATURES_TAB_ID] ) {
		VAS.PARTS[STARSHIP_FEATURES_TAB_ID] = {
			container: { classes: ["tab-body"], id: "tabs" },
			template: "systems/dnd5e/templates/actors/tabs/actor-features.hbs",
			templates: [
				"systems/dnd5e/templates/inventory/inventory.hbs",
				"systems/dnd5e/templates/inventory/activity.hbs",
				recoveryColumnTemplate
			],
			scrollable: [""]
		};
	} else {
		const part = VAS.PARTS[STARSHIP_FEATURES_TAB_ID];
		part.templates ??= [];
		if ( !part.templates.includes(recoveryColumnTemplate) ) part.templates.push(recoveryColumnTemplate);
	}

	if ( VAS._sw5eStarshipFeaturesTabRegistered ) return;

	if ( !Array.isArray(VAS.TABS) ) VAS.TABS = [];
	if ( !VAS.TABS.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
		const inventoryIdx = VAS.TABS.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const featuresTab = makeStarshipFeaturesTabDescriptor();
		if ( inventoryIdx >= 0 ) VAS.TABS.splice(inventoryIdx + 1, 0, featuresTab);
		else VAS.TABS.push(featuresTab);
	}

	VAS._sw5eStarshipFeaturesTabRegistered = true;
}

export function registerStarshipCoreTabPart() {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS?.PARTS || VAS._sw5eStarshipCoreTabRegistered ) return;

	if ( !VAS.PARTS[STARSHIP_TAB_ID] ) {
		VAS.PARTS[STARSHIP_TAB_ID] = {
			container: { classes: ["tab-body"], id: "tabs" },
			template: getModulePath("templates/starship-core-part.hbs"),
			scrollable: [""]
		};
	}

	if ( !Array.isArray(VAS.TABS) ) VAS.TABS = [];
	if ( !VAS.TABS.some(tab => tab.tab === STARSHIP_TAB_ID) ) {
		const inventoryIdx = VAS.TABS.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const coreTab = makeStarshipCoreTabDescriptor();
		if ( inventoryIdx >= 0 ) VAS.TABS.splice(inventoryIdx, 0, coreTab);
		else VAS.TABS.unshift(coreTab);
	}

	VAS._sw5eStarshipCoreTabRegistered = true;
}

/**
 * Build a PrimarySheetMixin Record tab entry from a static TABS descriptor.
 * @param {{ tab: string, label: string }} descriptor
 * @param {boolean} active
 * @returns {object}
 */
function makeStarshipRecordTab(descriptor, active) {
	const tab = {
		label: descriptor.label,
		id: descriptor.tab,
		group: "primary",
		active,
		cssClass: active ? "active" : ""
	};
	if ( descriptor.icon ) tab.icon = descriptor.icon;
	if ( descriptor.svg ) tab.svg = descriptor.svg;
	return tab;
}

/**
 * Adapt starship primary tabs for DND5e v5.3.3 Record-shaped `context.tabs`.
 * Preserves legacy array behavior when tabs are still an array.
 * DOM nav bridges remain in place until Phase 4 retirement is authorized.
 * @param {object} context
 * @param {object} sheet
 * @returns {object}
 */
export function applyStarshipTabsContext(context, sheet) {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS || !(sheet instanceof VAS) || !isSw5eStarshipActor(sheet.actor) ) return context;
	const tabs = context?.tabs;
	if ( !tabs || (typeof tabs !== "object") ) return context;

	const includeCore = true;
	const activeTabId = typeof sheet?.tabGroups?.primary === "string" ? sheet.tabGroups.primary : STARSHIP_TAB_ID;

	// Legacy array shape (pre-5.3.3 / dual-shape bridge)
	if ( Array.isArray(tabs) ) {
		context.tabs = dedupeTabs(tabs.filter(tab => tab?.tab !== "crew"));

		const inventoryTab = context.tabs.find(tab => tab?.tab === STOCK_CARGO_TAB_ID);
		if ( inventoryTab ) {
			inventoryTab.label = "DND5E.Inventory";
			applyCharacterSheetTabVisual(inventoryTab, "inventory");
		}

		if ( includeCore && !context.tabs.some(tab => tab.tab === STARSHIP_TAB_ID) ) {
			const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
			const coreTab = makeStarshipCoreTabDescriptor();
			delete coreTab.condition;
			if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx, 0, coreTab);
			else context.tabs.unshift(coreTab);
		}
		const coreTab = context.tabs.find(tab => tab?.tab === STARSHIP_TAB_ID);
		if ( coreTab ) applyCharacterSheetTabVisual(coreTab, "details");

		if ( !context.tabs.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
			const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
			const featuresTab = makeStarshipFeaturesTabDescriptor();
			delete featuresTab.condition;
			if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx + 1, 0, featuresTab);
			else context.tabs.push(featuresTab);
		}
		const featuresTab = context.tabs.find(tab => tab?.tab === STARSHIP_FEATURES_TAB_ID);
		if ( featuresTab ) applyCharacterSheetTabVisual(featuresTab, "features");

		context.tabs = ensureStarshipPrimaryTabOrder(context.tabs, { includeCore });
		const desiredTabId = context.tabs.some(tab => tab.tab === activeTabId) ? activeTabId : STARSHIP_TAB_ID;
		for ( const tab of context.tabs ) {
			tab.active = tab.tab === desiredTabId;
			tab.cssClass = tab.active ? "active" : "";
		}
		return context;
	}

	// DND5e v5.3.3 Record shape from PrimarySheetMixin#_getTabs
	delete tabs.crew;

	if ( tabs[STOCK_CARGO_TAB_ID] ) {
		tabs[STOCK_CARGO_TAB_ID].label = "DND5E.Inventory";
		applyCharacterSheetTabVisual(tabs[STOCK_CARGO_TAB_ID], "inventory");
	}

	if ( includeCore && !tabs[STARSHIP_TAB_ID] ) {
		tabs[STARSHIP_TAB_ID] = makeStarshipRecordTab(makeStarshipCoreTabDescriptor(), false);
	}
	if ( tabs[STARSHIP_TAB_ID] ) applyCharacterSheetTabVisual(tabs[STARSHIP_TAB_ID], "details");
	if ( !tabs[STARSHIP_FEATURES_TAB_ID] ) {
		tabs[STARSHIP_FEATURES_TAB_ID] = makeStarshipRecordTab(makeStarshipFeaturesTabDescriptor(), false);
	}
	if ( tabs[STARSHIP_FEATURES_TAB_ID] ) applyCharacterSheetTabVisual(tabs[STARSHIP_FEATURES_TAB_ID], "features");

	const desiredTabId = tabs[activeTabId] ? activeTabId : STARSHIP_TAB_ID;
	for ( const [id, tab] of Object.entries(tabs) ) {
		if ( !tab || (typeof tab !== "object") ) continue;
		tab.id ??= id;
		tab.group ??= "primary";
		tab.active = id === desiredTabId;
		tab.cssClass = tab.active ? "active" : "";
	}
	return context;
}

/**
 * Ensure Features appears in the primary nav when dnd5e omits it (e.g. before PARTS/TABS patch on first paint).
 * Clones an existing stock tab button so styling matches Core | Inventory | Effects | Description.
 */
export function ensureStarshipFeaturesTabNav(root, app, nav) {
	if ( !nav || nav.querySelector(`[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`) ) return;

	const templateButton = nav.querySelector("[data-tab=\"effects\"]")
		?? nav.querySelector(`[data-tab="${STOCK_CARGO_TAB_ID}"]`);
	if ( !(templateButton instanceof HTMLElement) ) return;

	const tabButton = templateButton.cloneNode(true);
	tabButton.classList.remove("active");
	tabButton.dataset.tab = STARSHIP_FEATURES_TAB_ID;
	tabButton.removeAttribute("aria-selected");
	const featuresLabel = getStarshipFeaturesTabLabel();
	setStarshipTabAccessibleName(tabButton, featuresLabel);
	const visual = getCharacterSheetTabVisual("features");
	const iconEl = tabButton.querySelector("i");
	if ( iconEl && visual.icon ) iconEl.className = visual.icon;
	else if ( visual.icon && !tabButton.querySelector("i, dnd5e-icon") ) {
		const icon = document.createElement("i");
		icon.className = visual.icon;
		icon.setAttribute("inert", "");
		tabButton.replaceChildren(icon);
	}

	const anchor = nav.querySelector("[data-tab=\"effects\"]") ?? templateButton.nextElementSibling;
	if ( anchor?.parentElement === nav ) nav.insertBefore(tabButton, anchor);
	else nav.append(tabButton);

	tabButton.addEventListener("click", event => {
		event.preventDefault();
		activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
	});
}

export function insertCustomTabButtons(nav, buttons = []) {
	const stockButtons = getTabButtons(nav).filter(button => !buttons.includes(button));
	const anchor = STOCK_STARSHIP_TAB_ORDER
		.map(tabId => stockButtons.find(button => button.dataset.tab === tabId))
		.find(Boolean)
		?? stockButtons.find(button => !button.hidden)
		?? null;

	for ( const button of buttons ) {
		if ( anchor?.parentElement === nav ) nav.insertBefore(button, anchor);
		else nav.append(button);
	}
}

export function activatePrimaryTab(root, tabId) {
	const nav = getPrimaryTabNav(root);
	if ( nav ) {
		nav.querySelectorAll("[data-tab]").forEach(item => {
			item.classList.toggle("active", item.dataset.tab === tabId);
		});
	}

	root.querySelectorAll(".tab[data-group='primary']").forEach(panel => {
		const isActive = panel.dataset.tab === tabId;
		panel.classList.toggle("active", isActive);
		const isCustomPanel = panel.classList.contains("sw5e-starship-tab")
			&& panel.dataset.sw5eCoreOwner !== "part";
		// Only manage `hidden` on our own custom tabs.
		// Stock dnd5e panels use CSS classes for visibility; setting `hidden` on them
		// prevents dnd5e from showing them again when the user clicks back to cargo/description.
		if ( isCustomPanel ) {
			panel.hidden = !isActive;
		} else {
			panel.hidden = false;
		}
	});
}

export function activateSheetTab(root, app, tabId) {
	root.querySelectorAll(".sw5e-starship-tab[data-sw5e-core-owner='custom']").forEach(panel => {
		panel.classList.remove("active");
		panel.hidden = true;
	});
	if ( typeof app?.changeTab === "function" ) {
		try {
			app.changeTab(tabId, "primary", { force: true, updatePosition: false });
		} catch(e) {
			activatePrimaryTab(root, tabId);
		}
	} else {
		activatePrimaryTab(root, tabId);
	}
	if ( tabId === STOCK_CARGO_TAB_ID && isSw5eStarshipActor(app?.actor) ) {
		scheduleStarshipModificationsSectionHeader(root, app.actor);
	}
}

export function ensureStarshipTabTargets(root) {
	const nav = getPrimaryTabNav(root);
	const panelParent = getPrimaryTabPanelParent(root);
	return {
		nav,
		panelParent,
		integrated: Boolean(nav && panelParent)
	};
}

export function getSotgSubTab(app) {
	const v = app?._sw5eSotgSubTab;
	if ( v === "skills" || v === "crew" || v === "v2" ) return "overview";
	if ( v === "weapons" || v === "equipment" || v === "modifications" || v === "systems" || v === "features" ) return "overview";
	if ( SOTG_SUB_TAB_IDS.has(v) ) return v;
	return "overview";
}


export function setSotgSubTab(app, tabId) {
	if ( !app ) return;
	app._sw5eSotgSubTab = tabId;
}


export function activateSotgSubTab(wrapper, app, tabId) {
	if ( !wrapper ) return;
	let id = tabId === "crew" || tabId === "v2" ? "overview" : tabId;
	id = SOTG_SUB_TAB_IDS.has(id) ? id : "overview";
	if ( !wrapper.querySelector(`[data-sw5e-sotg-panel="${id}"]`) ) id = "overview";
	wrapper.querySelectorAll("[data-sw5e-sotg-tab]").forEach(btn => {
		const sel = btn.getAttribute("data-sw5e-sotg-tab") === id;
		btn.classList.toggle("active", sel);
		btn.setAttribute("aria-selected", sel ? "true" : "false");
	});
	wrapper.querySelectorAll("[data-sw5e-sotg-panel]").forEach(panel => {
		const on = panel.getAttribute("data-sw5e-sotg-panel") === id;
		panel.classList.toggle("active", on);
		panel.toggleAttribute("hidden", !on);
	});
	setSotgSubTab(app, id);
}


/**
 * @param {string} tabId
 * @returns {string}
 */
export function escapeTabSelectorValue(tabId) {
	const s = String(tabId ?? "");
	if ( typeof CSS !== "undefined" && typeof CSS.escape === "function" ) return CSS.escape(s);
	return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

