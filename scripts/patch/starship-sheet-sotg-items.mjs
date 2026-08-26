/**
 * SotG item row parity interactions (Phase 6 H2).
 * WeakSet + every reader/writer moved atomically — bodies preserved.
 */

import { isStarshipSheetEditMode } from "./starship-sheet-sidebar.mjs";
import { useStarshipItem } from "./starship-sheet-inventory.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import {
	STARSHIP_FEATURES_TAB_ID,
	STARSHIP_TAB_ID,
	STOCK_CARGO_TAB_ID
} from "../starship-sheet-ids.mjs";
import { resolveStarshipItemGroup } from "../starship-sheet-categorize.mjs";
import { resolveCrewActorFromUuid } from "../starship-sheet-crew.mjs";
import {
	activateSheetTab,
	activateSotgSubTab,
	escapeTabSelectorValue
} from "./starship-sheet-tabs.mjs";

export function resolveStarshipItemPrimaryTab(item) {
	const group = resolveStarshipItemGroup(item);
	if ( group === "weapons" || group === "equipment" || group === "modifications" ) return STOCK_CARGO_TAB_ID;
	if ( group ) return STARSHIP_FEATURES_TAB_ID;
	return STOCK_CARGO_TAB_ID;
}

export function focusSheetItem(root, app, itemId, tabId = STOCK_CARGO_TAB_ID) {
	window.setTimeout(() => {
		if ( itemId == null || itemId === "" ) return;
		const item = app?.actor?.items?.get(itemId);
		const resolvedTab = tabId || resolveStarshipItemPrimaryTab(item);
		const safeId = escapeTabSelectorValue(itemId);
		const candidates = root.querySelectorAll(`[data-item-id="${safeId}"]`);
		const stockTarget = Array.from(candidates).find(node => !node.closest(".sw5e-starship-tab"));
		const target = stockTarget ?? Array.from(candidates).find(node => node.closest(".sw5e-starship-tab"));
		if ( !target ) return;

		if ( stockTarget ) {
			const panel = target.closest(".tab[data-group='primary']");
			if ( panel?.dataset.tab ) activateSheetTab(root, app, panel.dataset.tab);
			else if ( resolvedTab ) activateSheetTab(root, app, resolvedTab);
		} else {
			activateSheetTab(root, app, STARSHIP_TAB_ID);
			const sotgWrapper = target.closest(".sw5e-starship-tab");
			const sotgPanel = target.getAttribute("data-sotg-panel")
				?? target.closest("[data-sw5e-sotg-panel]")?.getAttribute("data-sw5e-sotg-panel")
				?? "overview";
			if ( sotgWrapper ) activateSotgSubTab(sotgWrapper, app, sotgPanel);
		}

		window.requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "center" }));
		target.classList.add("sw5e-starship-item-pulse");
		window.setTimeout(() => target.classList.remove("sw5e-starship-item-pulse"), 1800);
	}, 50);
}


export const _sw5eSotgItemParityWrappers = new WeakSet();

/**
 * dnd5e loads via `dnd5e.mjs`; individual `module/...` URLs are not served — use the global namespace.
 * @returns {any}
 */
export function getDnd5eContextMenu5e() {
	return globalThis.dnd5e?.applications?.ContextMenu5e ?? null;
}

/** @returns {any} */
export function getDnd5eItemSheet5e() {
	return globalThis.dnd5e?.applications?.item?.ItemSheet5e ?? null;
}

export function getEventTargetElement(event) {
	const target = event?.target;
	if ( target instanceof Element ) return target;
	return target?.parentElement ?? null;
}

/**
 * Resolve a SoTG row item from the starship or a crew source actor UUID.
 *
 * @param {object} app
 * @param {HTMLElement|null} row
 * @returns {{ item: object|null, sourceActor: object|null }}
 */
export function resolveSotgRowItem(app, row) {
	const shipActor = app?.actor ?? app?.document ?? null;
	const itemId = row?.dataset?.itemId;
	if ( !itemId ) return { item: null, sourceActor: null };

	const sourceUuid = row?.dataset?.sourceActorUuid || null;
	if ( sourceUuid ) {
		const sourceActor = resolveCrewActorFromUuid(sourceUuid);
		const item = sourceActor?.items?.get?.(itemId) ?? null;
		return { item, sourceActor };
	}

	return { item: shipActor?.items?.get?.(itemId) ?? null, sourceActor: shipActor };
}

/**
 * Primary strip: EDIT → item sheet edit; PLAY → use/post (`useStarshipItem`).
 * Systems classification rows: no-op in PLAY (preserves prior gating).
 * Crew-sourced rows resolve items on the assigned PC actor.
 */
export async function onStarshipSotgPrimaryItemAction(app, row, event) {
	const { item, sourceActor } = resolveSotgRowItem(app, row);
	if ( !item ) return;

	if ( isStarshipSheetEditMode(app) ) {
		const ItemSheet5e = getDnd5eItemSheet5e();
		if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
		else await item.sheet?.render(true);
		return;
	}

	if ( row.closest(".sw5e-starship-systems-groups") ) return;

	await useStarshipItem(item, sourceActor ?? item.actor, event);
}

export async function starshipSotgContextDispatch(app, targetEl, action) {
	const row = targetEl?.closest?.(".sw5e-starship-item-row--sotg[data-item-id]") ?? targetEl?.closest?.("[data-item-id]");
	const { item, sourceActor } = resolveSotgRowItem(app, row);
	if ( !item ) return;
	const isExternal = Boolean(row?.dataset?.sourceActorUuid);

	const ItemSheet5e = getDnd5eItemSheet5e();
	switch ( action ) {
		case "view":
			if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.PLAY });
			else await item.sheet?.render(true);
			return;
		case "edit":
			if ( ItemSheet5e ) await item.sheet?.render(true, { mode: ItemSheet5e.MODES.EDIT });
			else await item.sheet?.render(true);
			return;
		case "delete":
			if ( isExternal ) return;
			await item.deleteDialog?.();
			return;
		case "duplicate":
			if ( isExternal ) return;
			await item.clone?.({
				name: game.i18n.format("DOCUMENT.CopyOf", { name: item.name })
			}, { save: true, addSource: true });
			return;
		case "attune":
			if ( isExternal ) return;
			await item.update?.({ "system.attuned": !item.system.attuned });
			return;
		case "equip":
			if ( isExternal ) return;
			await item.update?.({ "system.equipped": !item.system.equipped });
			return;
		default:
			return;
	}
}

/**
 * @param {HTMLElement} element Row or descendant with data-item-id
 * @param {object} app
 */
export function prepareStarshipSotgItemContextMenu(element, app) {
	const row = element.closest(".sw5e-starship-item-row--sotg[data-item-id]");
	const { item, sourceActor } = resolveSotgRowItem(app, row);
	if ( !item ) return;
	const isExternal = Boolean(row?.dataset?.sourceActorUuid);

	const compendiumLocked = game.packs.get(item.pack)?.locked;
	const sheetOwnerEditable = app.isEditable !== false;
	const sheetEditMode = isStarshipSheetEditMode(app);

	const options = [{
		name: "DND5E.ItemView",
		icon: " ",
		callback: li => { void starshipSotgContextDispatch(app, li, "view"); }
	}, {
		name: "DND5E.ContextMenuActionEdit",
		icon: " ",
		condition: () => item.isOwner && !compendiumLocked && sheetOwnerEditable && sheetEditMode,
		callback: li => { void starshipSotgContextDispatch(app, li, "edit"); }
	}];

	if ( !isExternal ) {
		options.push({
			name: "DND5E.ContextMenuActionDuplicate",
			icon: " ",
			condition: () => item.canDuplicate && item.isOwner && !compendiumLocked,
			callback: li => { void starshipSotgContextDispatch(app, li, "duplicate"); }
		}, {
			name: "DND5E.ContextMenuActionDelete",
			icon: " ",
			condition: () => item.canDelete && item.isOwner && !compendiumLocked && sheetOwnerEditable && sheetEditMode,
			callback: li => { void starshipSotgContextDispatch(app, li, "delete"); }
		});
	}

	options.push({
		name: "DND5E.DisplayCard",
		icon: " ",
		callback: () => item.displayCard?.()
	}, {
		name: localizeOrFallback("SW5E.StarshipSheet.SotgContextUseOrRoll", "Use or roll item"),
		icon: " ",
		condition: () => item.isOwner && (typeof item.use === "function" || typeof item.rollAttack === "function"),
		callback: () => { void useStarshipItem(item, sourceActor ?? item.actor); },
		group: "action"
	});

	if ( !isExternal && sourceActor && !sourceActor.system?.isGroup ) {
		if ( "equipped" in item.system ) {
			options.push({
				name: `DND5E.ContextMenuAction${item.system.equipped ? "Unequip" : "Equip"}`,
				icon: " ",
				condition: () => item.isOwner && !compendiumLocked,
				callback: li => { void starshipSotgContextDispatch(app, li, "equip"); },
				group: "state"
			});
		}
		if ( item.system?.attunement ) {
			options.push({
				name: `DND5E.ContextMenuAction${item.system.attuned ? "Unattune" : "Attune"}`,
				icon: " ",
				condition: () => item.isOwner && !compendiumLocked,
				callback: li => { void starshipSotgContextDispatch(app, li, "attune"); },
				group: "state"
			});
		}
	}

	Hooks.callAll("dnd5e.getItemContextOptions", item, options);
	ui.context.menuItems = options;
}

/**
 * One-time wiring: dnd5e-style context menu, primary name-strip action, ⋮ trigger.
 * @param {HTMLElement} wrapper `.sw5e-starship-tab`
 * @param {object} app
 */
export function ensureStarshipSotgItemRowInteractions(wrapper, app) {
	if ( !(wrapper instanceof HTMLElement) || _sw5eSotgItemParityWrappers.has(wrapper) ) return;
	_sw5eSotgItemParityWrappers.add(wrapper);

	const ContextMenu5e = getDnd5eContextMenu5e();
	if ( ContextMenu5e ) {
		new ContextMenu5e(wrapper, ".sw5e-starship-item-row--sotg[data-item-id]", [], {
			onOpen: el => prepareStarshipSotgItemContextMenu(el, app),
			jQuery: false
		});
	} else {
		console.warn("SW5E MODULE | dnd5e ContextMenu5e unavailable (is the dnd5e system loaded?).");
	}

	wrapper.addEventListener("click", event => {
		const t = getEventTargetElement(event);
		if ( !t ) return;
		if ( !t.closest(".sw5e-starship-item-row--sotg [data-context-menu]") ) return;
		const CM = getDnd5eContextMenu5e();
		if ( !CM ) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		CM.triggerEvent(event);
	}, { capture: true });

	wrapper.addEventListener("click", event => {
		const t = getEventTargetElement(event);
		if ( !t ) return;
		const nameCell = t.closest(".sw5e-starship-item-row--sotg .item-name.item-action");
		if ( !nameCell ) return;
		if ( t.closest(".item-controls") ) return;
		const row = nameCell.closest(".sw5e-starship-item-row--sotg[data-item-id]");
		if ( !row || !nameCell.contains(t) ) return;
		event.preventDefault();
		void onStarshipSotgPrimaryItemAction(app, row, event);
	});
}
