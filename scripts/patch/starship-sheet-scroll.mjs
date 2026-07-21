/**
 * Starship sheet scroll / view-state (Phase 6 F2).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import {
	activateSheetTab,
	activateSotgSubTab,
	escapeTabSelectorValue,
	getPrimaryTabNav,
	getSotgSubTab
} from "./starship-sheet-tabs.mjs";
import {
	SOTG_SUB_TAB_IDS,
	STARSHIP_FEATURES_TAB_ID,
	STARSHIP_TAB_ID
} from "../starship-sheet-ids.mjs";

export function starshipScrollOverflowYAllowsScroll(overflowY) {
	return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

export function getStarshipSidebarScrollAnchor(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	return shell.querySelector(".sw5e-starship-sidebar-vitals")
		?? shell.querySelector(".sw5e-starship-sidebar-movement")
		?? getStarshipSidebarNameBlock(shell);
}

/**
 * Scroll container for the starship sidebar: prefer the inner element that actually scrolls
 * (dnd5e/AppV2 often nests overflow on a child of `[data-application-part="sidebar"]`).
 * @param {HTMLElement} shell
 * @returns {HTMLElement|null}
 */
export function getStarshipSheetSidebarScrollHost(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	let el = getStarshipSidebarScrollAnchor(shell)?.parentElement ?? null;
	while ( el && shell.contains(el) ) {
		if ( el.scrollHeight > el.clientHeight ) {
			const oy = globalThis.getComputedStyle(el).overflowY;
			if ( starshipScrollOverflowYAllowsScroll(oy) ) return el;
		}
		el = el.parentElement;
	}
	const fallback = shell.querySelector("[data-application-part=\"sidebar\"]")
		?? shell.querySelector(".sheet-sidebar")
		?? shell.querySelector(".sidebar");
	return fallback instanceof HTMLElement ? fallback : null;
}

/**
 * @param {HTMLElement} shell
 * @param {EventTarget|null} editTarget
 */
export function getStarshipSidebarScrollTopFromEditTarget(shell, editTarget) {
	const hostFromTarget = (() => {
		if ( !(editTarget instanceof HTMLElement) ) return null;
		const scope = editTarget.closest(
			".sw5e-starship-sidebar-vitals, .sw5e-starship-sidebar-movement, .sw5e-starship-sidebar-damage-reduction, .sw5e-starship-destruction-tray, .sw5e-starship-sidebar-system-damage"
		);
		if ( !scope || !shell.contains(scope) ) return null;
		let el = scope.parentElement;
		while ( el && shell.contains(el) ) {
			if ( el.scrollHeight > el.clientHeight ) {
				const oy = globalThis.getComputedStyle(el).overflowY;
				if ( starshipScrollOverflowYAllowsScroll(oy) ) return el;
			}
			el = el.parentElement;
		}
		return null;
	})();
	const host = hostFromTarget ?? getStarshipSheetSidebarScrollHost(shell);
	return host instanceof HTMLElement ? host.scrollTop : 0;
}

/** Set when a sidebar quick-edit runs so the next sheet render can restore scroll after DOM replacement. */
export const STARSHIP_PENDING_SIDEBAR_SCROLL_KEY = "_sw5eStarshipPendingSidebarScroll";

export function stashStarshipPendingSidebarScroll(app, editTarget) {
	if ( !app ) return;
	const shell = app.element;
	if ( !(shell instanceof HTMLElement) ) return;
	app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY] = getStarshipSidebarScrollTopFromEditTarget(shell, editTarget);
}

/** @returns {number|null} */
export function consumeStarshipPendingSidebarScroll(app) {
	if ( !app || !Object.prototype.hasOwnProperty.call(app, STARSHIP_PENDING_SIDEBAR_SCROLL_KEY) ) return null;
	const v = app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY];
	delete app[STARSHIP_PENDING_SIDEBAR_SCROLL_KEY];
	return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Read sidebar / main scroll from the live sheet element. Call at render start before sidebar blocks re-mount.
 * @param {object} app
 * @returns {{ sidebarScrollTop: number, mainScrollTop: number }}
 */
export function readStarshipSheetScrollSnapshot(app) {
	let sidebarScrollTop = 0;
	let mainScrollTop = 0;
	let sotgPanelScrollTop = 0;
	const shell = app?.element;
	if ( !(shell instanceof HTMLElement) ) return { sidebarScrollTop, mainScrollTop, sotgPanelScrollTop };

	const sidebar = getStarshipSheetSidebarScrollHost(shell);
	if ( sidebar instanceof HTMLElement ) sidebarScrollTop = sidebar.scrollTop;

	const main = shell.querySelector(".window-content")
		?? shell.querySelector(".standard-form")
		?? shell.querySelector("form.application");
	if ( main instanceof HTMLElement ) mainScrollTop = main.scrollTop;

	const sotgPanel = shell.querySelector(".sw5e-starship-panel");
	if ( sotgPanel instanceof HTMLElement ) sotgPanelScrollTop = sotgPanel.scrollTop;

	return { sidebarScrollTop, mainScrollTop, sotgPanelScrollTop };
}

/**
 * Capture starship sheet view state for restore after `renderActorSheetV2` refreshes the DOM.
 * Pass scroll positions from {@link readStarshipSheetScrollSnapshot} taken at render start (before sidebar re-mount).
 * Call after default-tab init so `stockPrimary` reflects the post-init app tab state.
 * @param {object} app
 * @param {{ sidebarScrollTop?: number, mainScrollTop?: number, sotgPanelScrollTop?: number }} [scrollSnapshot]
 * @returns {StarshipSheetViewState}
 */
export function captureStarshipSheetViewState(app, scrollSnapshot) {
	const scroll = scrollSnapshot ?? readStarshipSheetScrollSnapshot(app);
	const stockPrimary = typeof app?.tabGroups?.primary === "string" ? app.tabGroups.primary : STARSHIP_TAB_ID;
	return {
		sidebarScrollTop: Number(scroll.sidebarScrollTop) || 0,
		mainScrollTop: Number(scroll.mainScrollTop) || 0,
		sotgPanelScrollTop: Number(scroll.sotgPanelScrollTop) || 0,
		stockPrimary,
		sotgSub: getSotgSubTab(app)
	};
}


/**
 * Apply saved scroll positions to the sheet shell. Pass `mainScrollTop` / `sotgPanelScrollTop` as 0 to skip those axes.
 * @param {object} app
 * @param {{ sidebarScrollTop?: number, mainScrollTop?: number, sotgPanelScrollTop?: number }} state
 */
export function applyStarshipSheetScrollPositions(app, state) {
	if ( !state || !app ) return;
	try {
		const shell = app.element;
		if ( !(shell instanceof HTMLElement) ) return;
		const sidebar = getStarshipSheetSidebarScrollHost(shell);
		if ( sidebar instanceof HTMLElement && state.sidebarScrollTop > 0 ) sidebar.scrollTop = state.sidebarScrollTop;
		const main = shell.querySelector(".window-content")
			?? shell.querySelector(".standard-form")
			?? shell.querySelector("form.application");
		if ( main instanceof HTMLElement && state.mainScrollTop > 0 ) main.scrollTop = state.mainScrollTop;
		const sotgPanel = shell.querySelector(".sw5e-starship-panel");
		if ( sotgPanel instanceof HTMLElement && state.sotgPanelScrollTop > 0 ) {
			sotgPanel.scrollTop = state.sotgPanelScrollTop;
		}
	} catch {
		/* ignore */
	}
}

/**
 * Reapply primary tab, SotG sub-tab, and scroll after a full starship layer render.
 * @param {object} app
 * @param {StarshipSheetViewState|null|undefined} state
 * @param {HTMLElement} root
 */
export function restoreStarshipSheetViewState(app, state, root) {
	if ( !state || !app || !root ) return;
	try {
		const desiredPrimary = typeof state.stockPrimary === "string" ? state.stockPrimary : STARSHIP_TAB_ID;
		if ( desiredPrimary === STARSHIP_FEATURES_TAB_ID ) {
			activateSheetTab(root, app, STARSHIP_FEATURES_TAB_ID);
			applyStarshipSheetScrollPositions(app, {
				sidebarScrollTop: Number(state.sidebarScrollTop) || 0,
				mainScrollTop: Number(state.mainScrollTop) || 0,
				sotgPanelScrollTop: 0
			});
			return;
		}

		if ( desiredPrimary === STARSHIP_TAB_ID ) {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
			if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
		}
		else if ( desiredPrimary ) {
			const nav = getPrimaryTabNav(root);
			const safe = escapeTabSelectorValue(desiredPrimary);
			const tabBtn = nav?.querySelector(`[data-tab="${safe}"]`);
			if ( tabBtn ) activateSheetTab(root, app, desiredPrimary);
			else {
				activateSheetTab(root, app, STARSHIP_TAB_ID);
				const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
				const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
				if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
			}
		}
		else {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			const sub = SOTG_SUB_TAB_IDS.has(state.sotgSub) ? state.sotgSub : "overview";
			if ( wrapper ) activateSotgSubTab(wrapper, app, sub);
		}
	} catch ( err ) {
		console.warn("SW5E MODULE | Starship sheet tab restore failed.", err);
		try {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const wrapper = root.querySelector(`.sw5e-starship-tab[data-tab="${STARSHIP_TAB_ID}"]`);
			if ( wrapper ) activateSotgSubTab(wrapper, app, "overview");
		} catch {
			/* sheet still usable */
		}
	}

	// Sync: avoid painting scrollTop 0 before restore (double rAF deferred too late and caused a visible flash).
	applyStarshipSheetScrollPositions(app, state);
	// One follow-up frame after tab/layout work settles (stock dnd5e can reflow when toggling tab panels).
	window.requestAnimationFrame(() => applyStarshipSheetScrollPositions(app, state));
}

export function getStarshipSidebarNameBlock(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	return shell.querySelector(
		".sheet-sidebar > .name, [data-application-part='sidebar'] > .name, .sidebar > .name"
	);
}

