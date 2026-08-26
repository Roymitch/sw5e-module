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

function makeStarshipCoreTabDescriptor() {
	return {
		tab: STARSHIP_TAB_ID,
		label: "SW5E.StarshipSheet.CoreTab",
		condition: actor => isSw5eStarshipActor(actor)
	};
}

function makeStarshipFeaturesTabDescriptor() {
	return {
		tab: STARSHIP_FEATURES_TAB_ID,
		label: "DND5E.Features",
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

export function configureStarshipPrimaryTabLabels(nav) {
	if ( !nav ) return;
	const coreButton = nav.querySelector(`[data-tab="${STARSHIP_TAB_ID}"]`);
	if ( coreButton ) {
		const label = coreButton.querySelector("span") ?? coreButton;
		label.textContent = localizeOrFallback("SW5E.StarshipSheet.CoreTab", "Core");
	}
	const inventoryButton = nav.querySelector(`[data-tab="${STOCK_CARGO_TAB_ID}"]`);
	if ( inventoryButton ) {
		const label = inventoryButton.querySelector("span") ?? inventoryButton;
		const inventoryLabel = game.i18n.localize("DND5E.Inventory");
		label.textContent = inventoryLabel && inventoryLabel !== "DND5E.Inventory" ? inventoryLabel : "Inventory";
	}
	const featuresButton = nav.querySelector(`[data-tab="${STARSHIP_FEATURES_TAB_ID}"]`);
	if ( featuresButton ) {
		const label = featuresButton.querySelector("span") ?? featuresButton;
		label.textContent = getStarshipFeaturesTabLabel();
	}
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

export function applyStarshipTabsContext(context, sheet) {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS || !(sheet instanceof VAS) || !isSw5eStarshipActor(sheet.actor) ) return context;
	if ( !Array.isArray(context?.tabs) ) return context;

	const includeCore = true;
	context.tabs = dedupeTabs(context.tabs.filter(tab => tab?.tab !== "crew"));

	const inventoryTab = context.tabs.find(tab => tab?.tab === STOCK_CARGO_TAB_ID);
	if ( inventoryTab ) inventoryTab.label = "DND5E.Inventory";

	if ( includeCore && !context.tabs.some(tab => tab.tab === STARSHIP_TAB_ID) ) {
		const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const coreTab = makeStarshipCoreTabDescriptor();
		delete coreTab.condition;
		if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx, 0, coreTab);
		else context.tabs.unshift(coreTab);
	}

	if ( !context.tabs.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
		const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const featuresTab = makeStarshipFeaturesTabDescriptor();
		delete featuresTab.condition;
		if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx + 1, 0, featuresTab);
		else context.tabs.push(featuresTab);
	}

	context.tabs = ensureStarshipPrimaryTabOrder(context.tabs, { includeCore });
	const activeTabId = typeof sheet?.tabGroups?.primary === "string" ? sheet.tabGroups.primary : STARSHIP_TAB_ID;
	const desiredTabId = context.tabs.some(tab => tab.tab === activeTabId) ? activeTabId : STARSHIP_TAB_ID;
	for ( const tab of context.tabs ) tab.active = tab.tab === desiredTabId;
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
	const labelEl = tabButton.querySelector("span") ?? tabButton;
	labelEl.textContent = getStarshipFeaturesTabLabel();

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

