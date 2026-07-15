/**
 * Starship sheet primary tabs / Features PART (Phase 6 F1).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getModuleId } from "../module-support.mjs";
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

export function getStarshipActiveTab(app) {
	if ( app?._sw5eStarshipActiveTab === true ) return STARSHIP_TAB_ID;
	if ( app?._sw5eStarshipActiveTab === false ) return null;
	return typeof app?._sw5eStarshipActiveTab === "string" ? app._sw5eStarshipActiveTab : null;
}

export function setStarshipActiveTab(app, tabId = null) {
	app._sw5eStarshipActiveTab = tabId;
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
	if ( !VAS?.PARTS || VAS._sw5eStarshipFeaturesTabRegistered ) return;

	if ( !VAS.PARTS[STARSHIP_FEATURES_TAB_ID] ) {
		VAS.PARTS[STARSHIP_FEATURES_TAB_ID] = {
			container: { classes: ["tab-body"], id: "tabs" },
			template: "systems/dnd5e/templates/actors/tabs/actor-features.hbs",
			templates: [
				"systems/dnd5e/templates/inventory/inventory.hbs",
				"systems/dnd5e/templates/inventory/activity.hbs"
			],
			scrollable: [""]
		};
	}

	if ( !Array.isArray(VAS.TABS) ) VAS.TABS = [];
	if ( !VAS.TABS.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
		const inventoryIdx = VAS.TABS.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const featuresTab = {
			tab: STARSHIP_FEATURES_TAB_ID,
			label: "DND5E.Features",
			condition: actor => isSw5eStarshipActor(actor)
		};
		if ( inventoryIdx >= 0 ) VAS.TABS.splice(inventoryIdx + 1, 0, featuresTab);
		else VAS.TABS.push(featuresTab);
	}

	VAS._sw5eStarshipFeaturesTabRegistered = true;
}

export function applyStarshipTabsContext(context, sheet) {
	const VAS = globalThis.dnd5e?.applications?.actor?.VehicleActorSheet;
	if ( !VAS || !(sheet instanceof VAS) || !isSw5eStarshipActor(sheet.actor) ) return context;
	if ( !Array.isArray(context?.tabs) ) return context;

	const inventoryTab = context.tabs.find(tab => tab.tab === STOCK_CARGO_TAB_ID);
	if ( inventoryTab ) inventoryTab.label = "DND5E.Inventory";

	context.tabs = context.tabs.filter(tab => tab.tab !== "crew");

	if ( !context.tabs.some(tab => tab.tab === STARSHIP_FEATURES_TAB_ID) ) {
		const inventoryIdx = context.tabs.findIndex(tab => tab.tab === STOCK_CARGO_TAB_ID);
		const featuresTab = {
			tab: STARSHIP_FEATURES_TAB_ID,
			label: "DND5E.Features"
		};
		if ( inventoryIdx >= 0 ) context.tabs.splice(inventoryIdx + 1, 0, featuresTab);
		else context.tabs.push(featuresTab);
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
		// Only manage `hidden` on our own custom tabs.
		// Stock dnd5e panels use CSS classes for visibility; setting `hidden` on them
		// prevents dnd5e from showing them again when the user clicks back to cargo/description.
		if ( panel.classList.contains("sw5e-starship-tab") ) {
			panel.hidden = !isActive;
		} else {
			panel.hidden = false;
		}
	});
}

export function activateSheetTab(root, app, tabId) {
	if ( CUSTOM_STARSHIP_TAB_IDS.has(tabId) ) {
		setStarshipActiveTab(app, tabId);
		activatePrimaryTab(root, tabId);
		desyncStaleStockTabGroupWhileSotgVisible(app);
		return;
	}

	setStarshipActiveTab(app, null);
	root.querySelectorAll(".sw5e-starship-tab").forEach(panel => { panel.classList.remove("active"); panel.hidden = true; });
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

/**
 * While SotG is the visible custom primary tab, dnd5e often still has `tabGroups.primary === "inventory"`
 * (last stock tab). After EDIT/PLAY rerender that can mark the Cargo nav as `.active` even though SotG
 * is showing — stock click handlers then no-op. Nudge tabGroups off the default so `changeTab("inventory")`
 * reliably runs on the next Cargo click.
 * @param {object} app
 */
export function desyncStaleStockTabGroupWhileSotgVisible(app) {
	if ( !app?.tabGroups || typeof app.tabGroups !== "object" ) return;
	if ( app.tabGroups.primary !== STOCK_CARGO_TAB_ID && app.tabGroups.primary !== STARSHIP_FEATURES_TAB_ID ) return;
	app.tabGroups.primary = "effects";
}

/**
 * Single capture-phase bridge for stock primary tabs on integrated vehicle sheets.
 * Re-bound each render so it survives nav replacement after EDIT/PLAY toggles.
 * @param {object} app
 * @param {HTMLElement} root
 * @param {HTMLElement|null} nav
 */
export function attachIntegratedStockPrimaryTabBridge(app, root, nav) {
	if ( !nav ) return;
	if ( app._sw5eStockTabBridgeAbort ) app._sw5eStockTabBridgeAbort.abort();
	const ac = new AbortController();
	app._sw5eStockTabBridgeAbort = ac;

	nav.addEventListener("click", event => {
		const item = event.target.closest("[data-tab]");
		if ( !item || !nav.contains(item) ) return;
		const tabId = item.dataset.tab;
		if ( !tabId || CUSTOM_STARSHIP_TAB_IDS.has(tabId) ) return;

		const sotgIsEffectivePrimary = Boolean(getStarshipActiveTab(app));

		// After mode-toggle rerender, Cargo can be `.active` while SotG is still the effective tab — do not no-op.
		if ( !sotgIsEffectivePrimary && item.classList.contains("active") ) {
			event.preventDefault();
			return;
		}

		event.preventDefault();
		event.stopImmediatePropagation();

		setStarshipActiveTab(app, null);
		root.querySelectorAll(".sw5e-starship-tab").forEach(panel => {
			panel.classList.remove("active");
			panel.hidden = true;
		});
		if ( typeof app?.changeTab === "function" ) {
			try {
				app.changeTab(tabId, "primary", { force: true, updatePosition: false });
			} catch ( e ) {
				activatePrimaryTab(root, tabId);
			}
		} else activatePrimaryTab(root, tabId);
	}, { capture: true, signal: ac.signal });
}

export function ensureStarshipTabTargets(root) {
	const nav = getPrimaryTabNav(root);
	const panelParent = getPrimaryTabPanelParent(root);
	if ( nav && panelParent ) return { nav, panelParent, integrated: true };

	const mountPoint = root.querySelector(".window-content") ?? root;
	let host = mountPoint.querySelector(".sw5e-starship-tab-host");
	if ( !host ) {
		host = document.createElement("section");
		host.className = "sw5e-starship-tab-host";
		host.innerHTML = `
			<nav class="sheet-navigation tabs sw5e-starship-fallback-nav" data-group="primary"></nav>
			<section class="sw5e-starship-tab-panels"></section>
		`;
		mountPoint.prepend(host);
	}

	return {
		nav: host.querySelector(".sw5e-starship-fallback-nav"),
		panelParent: host.querySelector(".sw5e-starship-tab-panels"),
		integrated: false
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

