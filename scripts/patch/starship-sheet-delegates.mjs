/**
 * Starship root sheet event delegates (Phase 6 G4).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getModuleId, SETTINGS_NAMESPACE } from "../module-support.mjs";
import {
	deriveStarshipPools,
	getLegacyStarshipActorSystem,
	rollStarshipPowerDie,
	STARSHIP_POWER_DIE_SLOTS
} from "../starship-data.mjs";
import { recoverStarshipPowerDice } from "../starship-power-recovery.mjs";
import { openRechargeRepairDialog, openRefittingRepairDialog, openRegenRepairDialog } from "../starship-repair.mjs";
import { STARSHIP_LEGACY_POWER_ROUTING_FLAG } from "../starship-routing-gate.mjs";
import {
	getStarshipSystemDamageLevel,
	resolveStarshipSystemDamagePipToggle,
	setStarshipSystemDamageLevel
} from "../starship-system-damage.mjs";
import {
	resetStarshipDestructionSaves,
	rollStarshipDestructionSave
} from "../starship-destruction-saves.mjs";
import { canCurrentUserUpdateStarshipActor, warnStarshipActorUpdateDenied } from "../starship-permissions.mjs";
import { openStarshipVitalConfig } from "../starship-vital-config.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import { STARSHIP_TIER_OPTIONS } from "../starship-sheet-ids.mjs";
import {
	coerceStarshipIntegerHpField,
	STARSHIP_INTEGER_HP_PATHS
} from "../starship-sheet-preupdate.mjs";
import { openStarshipReplenishCostModeConfig } from "../starship-replenish-cost-mode.mjs";
import {
	openStarshipFoodCapSourceConfig,
	persistStarshipFoodAttributePath,
	readStarshipFoodCapOverride
} from "../starship-food.mjs";
import { openStarshipShipsStoresConfig } from "../starship-ships-stores-config.mjs";
import { runStarshipSuppliesConsume } from "../starship-supplies-consume.mjs";
import { runStarshipSuppliesRestock } from "../starship-supplies-restock.mjs";
import { normalizeStarshipNonNegativeInt, normalizeStarshipSignedInt } from "../starship-replenish-math.mjs";
import {
	STARSHIP_POWER_DIE_OPTIONS,
	STARSHIP_ROUTING_KEYS_VISIBLE
} from "./starship-sheet-core-context.mjs";
import { getStoredStarshipTier, syncLegacyPowerRoutingToggleVisual } from "./starship-sheet-neutralize.mjs";
import {
	getStarshipSidebarShell,
	isStarshipSheetEditMode,
	persistStarshipFuelPowerSystemPath,
	renderStarshipSidebarSections
} from "./starship-sheet-sidebar.mjs";
import {
	beginStarshipSheetRender,
	STARSHIP_SECTION
} from "./starship-sheet-partial.mjs";

function getSheetForm(root, app) {
	return app?.form
		?? (root instanceof HTMLFormElement ? root : root.querySelector("form"));
}

export function ensureStarshipVitalsDelegate(root, app) {
	if ( !root || root.dataset.sw5eVitalsDelegate === "1" ) return;
	root.dataset.sw5eVitalsDelegate = "1";
	root.addEventListener("click", event => {
		const configBtn = event.target.closest("[data-sw5e-vital-config]");
		if ( !configBtn ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !isStarshipSheetEditMode(app) ) return;
		if ( !canCurrentUserUpdateStarshipActor(act) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		openStarshipVitalConfig(act, configBtn.dataset.sw5eVitalConfig);
	});
}

/**
 * EDIT-only Ship’s Stores configuration cog (combined Fuel + Food dialog).
 */
export function ensureStarshipShipsStoresConfigDelegate(root, app) {
	if ( !root || root.dataset.sw5eShipsStoresConfigDelegate === "1" ) return;
	root.dataset.sw5eShipsStoresConfigDelegate = "1";
	root.addEventListener("click", event => {
		const configBtn = event.target.closest("[data-sw5e-ships-stores-config]");
		if ( !configBtn || configBtn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !isStarshipSheetEditMode(app) ) return;
		if ( !canCurrentUserUpdateStarshipActor(act) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		openStarshipShipsStoresConfig(act);
	});
}

/**
 * EDIT-only Fuel / Food replenishment cost-mode cogs (Slice 3B-2 / 3B-4).
 */
export function ensureStarshipReplenishCostModeDelegate(root, app) {
	if ( !root || root.dataset.sw5eReplenishCostModeDelegate === "1" ) return;
	root.dataset.sw5eReplenishCostModeDelegate = "1";
	root.addEventListener("click", async event => {
		const configBtn = event.target.closest("[data-sw5e-replenish-cost-mode]");
		if ( !configBtn || configBtn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !isStarshipSheetEditMode(app) ) return;
		const resource = configBtn.dataset.sw5eReplenishCostMode;
		if ( resource !== "fuel" && resource !== "food" ) return;
		if ( !canCurrentUserUpdateStarshipActor(act) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		try {
			await openStarshipReplenishCostModeConfig(act, resource);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship replenish cost mode update failed.", err);
			ui.notifications?.error?.(
				localizeOrFallback(
					"SW5E.StarshipSheet.ReplenishCostModeSaveFailed",
					"Could not save replenishment cost mode."
				)
			);
		}
	});
}

/**
 * EDIT-only Food capacity source cog (Size vs Custom).
 */
export function ensureStarshipFoodCapSourceDelegate(root, app) {
	if ( !root || root.dataset.sw5eFoodCapSourceDelegate === "1" ) return;
	root.dataset.sw5eFoodCapSourceDelegate = "1";
	root.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-food-cap-source]");
		if ( !btn || btn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !isStarshipSheetEditMode(app) ) return;
		if ( !canCurrentUserUpdateStarshipActor(act) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		try {
			await openStarshipFoodCapSourceConfig(act);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship Food capacity source update failed.", err);
			ui.notifications?.error?.(localizeOrFallback(
				"SW5E.StarshipSheet.FoodCapSourceSaveFailed",
				"Could not save Food capacity source."
			));
		}
	});
}

/** SoTG Systems subtab: `name=` controls sit inside the vehicle sheet form; persist on `change` via trusted update (see delegate). */
export const STARSHIP_SYSTEMS_CORE_DIRECT_PATHS = new Set([
	"system.details.tier",
	"system.attributes.power.routing",
	"system.attributes.power.die",
	"system.attributes.fuel.value",
	"system.attributes.fuel.fuelCap",
	"system.attributes.fuel.cost",
	"system.attributes.food.value",
	"system.attributes.food.foodCap",
	"system.attributes.food.foodCapMod",
	"system.attributes.food.cost",
	...STARSHIP_POWER_DIE_SLOTS.flatMap(slot => [
		`system.attributes.power.${slot}.value`,
		`system.attributes.power.${slot}.max`
	]),
	"system.attributes.death.success",
	"system.attributes.death.failure"
]);

export function coerceStarshipTier(actor, raw) {
	const fallback = getStoredStarshipTier(actor);
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	const maxTier = STARSHIP_TIER_OPTIONS[STARSHIP_TIER_OPTIONS.length - 1] ?? 5;
	return Math.max(0, Math.min(maxTier, Math.trunc(n)));
}

export function coerceSidebarFuelValue(actor, raw) {
	const prev = Number(actor?.system?.attributes?.fuel?.value);
	const fallback = Number.isFinite(prev) ? Math.max(0, Math.trunc(prev)) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

/** @param {"fuelCap"|"cost"} subKey */
export function coerceStarshipFuelCapOrCost(actor, subKey, raw) {
	const prev = Number(actor?.system?.attributes?.fuel?.[subKey]);
	const fallback = Number.isFinite(prev) ? Math.max(0, Math.trunc(prev)) : 0;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return fallback;
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return fallback;
	return Math.max(0, Math.trunc(n));
}

export function coerceStarshipPowerSlotField(actor, slotKey, field, raw) {
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const power = legacySystem.attributes?.power ?? {};
	const pools = deriveStarshipPools(actor);
	const prevValue = Number.isFinite(Number(power[slotKey]?.value)) ? Number(power[slotKey].value) : 0;
	const storedMax = Number(power[slotKey]?.max);
	const prevMax = Number.isFinite(storedMax) && storedMax > 0
		? storedMax
		: (slotKey === "central" ? (pools.power.cscap ?? 0) : (pools.power.sscap ?? 0));
	const prev = field === "max" ? prevMax : prevValue;
	const trimmed = String(raw ?? "").trim();
	if ( trimmed === "" ) return Math.max(0, Math.trunc(prev));
	const n = Number(trimmed);
	if ( !Number.isFinite(n) ) return Math.max(0, Math.trunc(prev));
	return Math.max(0, Math.trunc(n));
}

export function coerceStarshipPowerDie(raw) {
	const trimmed = String(raw ?? "").trim().toLowerCase();
	if ( STARSHIP_POWER_DIE_OPTIONS.includes(trimmed) ) return trimmed;
	return "d8";
}

export function coerceStarshipDestructionTrack(raw) {
	const n = Number(String(raw ?? "").trim());
	if ( !Number.isFinite(n) ) return 0;
	return Math.max(0, Math.min(3, Math.trunc(n)));
}

/**
 * SoTG Systems subtab: whitelisted `name="system...."` fields inside the vehicle form call `actor.update` on change
 * (the in-form early return would otherwise skip them; dnd5e does not persist these paths reliably from the sheet form).
 * Fallback: other Systems `name=` controls outside the form only.
 */
export function ensureStarshipTrustedSystemPathDelegate(root, app) {
	if ( !root || root.dataset.sw5eTrustedSystemDelegate === "1" ) return;
	root.dataset.sw5eTrustedSystemDelegate = "1";
	root.addEventListener("change", async event => {
		const el = event.target;
		if ( !(el instanceof HTMLInputElement || el instanceof HTMLSelectElement) ) return;

		const inSystemPathScope = el.closest(".sw5e-starship-system-path-scope, .sw5e-starship-systems-core");
		const act = app?.actor;
		if ( !act ) return;

		if ( inSystemPathScope && el.name && STARSHIP_SYSTEMS_CORE_DIRECT_PATHS.has(el.name) ) {
			const path = el.name;
			let value;
			if ( path === "system.details.tier" ) {
				value = coerceStarshipTier(act, el.value);
			} else if ( path === "system.attributes.power.routing" ) {
				if ( !STARSHIP_ROUTING_KEYS_VISIBLE.includes(el.value) ) return;
				value = el.value;
			} else if ( path === "system.attributes.fuel.value" ) {
				value = coerceSidebarFuelValue(act, el.value);
			} else if ( path === "system.attributes.fuel.fuelCap" ) {
				value = coerceStarshipFuelCapOrCost(act, "fuelCap", el.value);
			} else if ( path === "system.attributes.fuel.cost" ) {
				value = coerceStarshipFuelCapOrCost(act, "cost", el.value);
			} else if ( path === "system.attributes.food.value" ) {
				value = normalizeStarshipNonNegativeInt(el.value) ?? 0;
				try {
					await persistStarshipFoodAttributePath(act, path, value);
				} catch ( err ) {
					console.error("SW5E MODULE | Starship Food update failed.", err);
				}
				return;
			} else if ( path === "system.attributes.food.foodCap" ) {
				if ( !readStarshipFoodCapOverride(act) ) return;
				value = normalizeStarshipNonNegativeInt(el.value) ?? 0;
				try {
					await persistStarshipFoodAttributePath(act, path, value);
				} catch ( err ) {
					console.error("SW5E MODULE | Starship Food update failed.", err);
				}
				return;
			} else if ( path === "system.attributes.food.foodCapMod" ) {
				// Persist source modifier only — never a prepared AE-adjusted value from the input.
				value = normalizeStarshipSignedInt(el.value);
				try {
					await persistStarshipFoodAttributePath(act, path, value);
				} catch ( err ) {
					console.error("SW5E MODULE | Starship Food update failed.", err);
				}
				return;
			} else if ( path === "system.attributes.food.cost" ) {
				value = normalizeStarshipNonNegativeInt(el.value) ?? 0;
				try {
					await persistStarshipFoodAttributePath(act, path, value);
				} catch ( err ) {
					console.error("SW5E MODULE | Starship Food update failed.", err);
				}
				return;
			} else if ( path === "system.attributes.power.die" ) {
				value = coerceStarshipPowerDie(el.value);
			} else if ( path === "system.attributes.death.success" || path === "system.attributes.death.failure" ) {
				value = coerceStarshipDestructionTrack(el.value);
			} else {
				const slotMatch = path.match(/^system\.attributes\.power\.(\w+)\.(value|max)$/);
				if ( !slotMatch || !STARSHIP_POWER_DIE_SLOTS.includes(slotMatch[1]) ) return;
				value = coerceStarshipPowerSlotField(act, slotMatch[1], slotMatch[2], el.value);
			}
			try {
				await persistStarshipFuelPowerSystemPath(act, path, value);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship Systems subtab update failed.", err);
			}
			return;
		}

		if ( !inSystemPathScope || !el.name?.startsWith("system.") ) return;

		const form = getSheetForm(root, app);
		if ( form?.contains(el) ) return;

		const path = el.name;
		let value;
		if ( STARSHIP_INTEGER_HP_PATHS.has(path) ) {
			const coerced = coerceStarshipIntegerHpField(act, path, el.value);
			if ( coerced === null ) return;
			value = coerced;
		} else {
			const isNumber = el.type === "number" || el.dataset.dtype === "Number";
			value = isNumber
				? (() => { const n = Number(el.value); return Number.isFinite(n) ? n : 0; })()
				: el.value;
		}
		try {
			await act.update({ [path]: value });
		} catch ( err ) {
			console.error("SW5E MODULE | Starship Systems tab fallback update failed.", err);
		}
	});
}

/**
 * Ship’s Stores shared actions — Consume / Restock (Fuel + Food).
 * Usable whenever the actor is editable (Play or Edit). Replaces visible Burn/Refuel.
 */
export function ensureStarshipFuelActionsDelegate(root, app) {
	if ( !root || root.dataset.sw5eFuelActionsDelegate === "1" ) return;
	root.dataset.sw5eFuelActionsDelegate = "1";
	root.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-supplies-action]");
		if ( !btn || btn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;

		const action = btn.dataset.sw5eSuppliesAction;
		try {
			if ( action === "consume" ) {
				await runStarshipSuppliesConsume(act);
			} else if ( action === "restock" ) {
				await runStarshipSuppliesRestock(act);
			}
		} catch ( err ) {
			console.error("SW5E MODULE | Starship Supplies action failed.", err);
		}
	});
}

export function ensureStarshipRepairDelegate(root, app) {
	if ( !root || root.dataset.sw5eRepairDelegate === "1" ) return;
	root.dataset.sw5eRepairDelegate = "1";
	root.addEventListener("click", async event => {
		const btn = event.target.closest("[data-sw5e-repair-action]");
		if ( !btn || btn.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;

		const action = btn.dataset.sw5eRepairAction;
		try {
			if ( action === "recharge" ) {
				await openRechargeRepairDialog(act);
			} else if ( action === "refitting" ) {
				await openRefittingRepairDialog(act);
			} else if ( action === "regen" ) {
				await openRegenRepairDialog(act);
			}
			if ( app?.rendered ) await app.render(false);
		} catch ( err ) {
			if ( err?.message !== "cancelled" ) {
				console.error("SW5E MODULE | Starship repair action failed.", err);
			}
		}
	});
}

export function ensureStarshipLegacyRoutingDelegate(root, app) {
	if ( !root || root.dataset.sw5eLegacyRoutingDelegate === "1" ) return;
	root.dataset.sw5eLegacyRoutingDelegate = "1";
	root.addEventListener("change", async event => {
		const input = event.target.closest("[data-sw5e-legacy-power-routing-toggle]");
		if ( !(input instanceof HTMLInputElement) ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false || !isStarshipSheetEditMode(app) ) return;
		const flagPath = `flags.${SETTINGS_NAMESPACE}.${STARSHIP_LEGACY_POWER_ROUTING_FLAG}`;
		try {
			await act.update({ [flagPath]: input.checked });
			syncLegacyPowerRoutingToggleVisual(
				input.closest("[data-sw5e-starship-legacy-routing-toggle]"),
				input.checked
			);
			if ( app?.rendered ) await app.render(false);
		} catch ( err ) {
			console.error("SW5E MODULE | Starship legacy power routing toggle failed.", err);
		}
	});
}

/**
 * Advanced Power panel — collapse toggle (persist UI flag) and per-slot Roll/Spend in Play mode.
 * Also handles Flight Manifest and Fuel core panel collapse toggles.
 */
export function resolveStarshipCoreCollapseToggle(target) {
	if ( !(target instanceof Element) ) return null;
	return target.closest(
		"[data-sw5e-advanced-power-action='toggle-collapse'], [data-sw5e-core-collapse-action='toggle'], .sw5e-starship-core-collapsible-toggle"
	);
}

export async function toggleStarshipCorePanelCollapse(toggle, app) {
	const panelKey = toggle.dataset.corePanel ?? "advancedPower";
	const panel = toggle.closest(`[data-sw5e-core-panel="${panelKey}"]`);
	if ( !panel ) return;

	const willCollapse = !panel.classList.contains("is-collapsed");
	panel.classList.toggle("is-collapsed", willCollapse);
	panel.querySelectorAll(".sw5e-starship-core-collapsible-toggle, [data-sw5e-advanced-power-action='toggle-collapse']").forEach(btn => {
		btn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
		const expandLabel = btn.dataset.expandLabel
			?? localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerExpand", "Expand Power Die Allocation");
		const collapseLabel = btn.dataset.collapseLabel
			?? localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerCollapse", "Collapse Power Die Allocation");
		const label = willCollapse ? expandLabel : collapseLabel;
		btn.title = label;
		btn.setAttribute("aria-label", label);
		if ( Object.prototype.hasOwnProperty.call(btn.dataset, "tooltip") ) btn.dataset.tooltip = label;
	});

	const act = app?.actor;
	if ( !act?.isOwner ) return;

	const flagKey = panelKey === "advancedPower"
		? "advancedPowerCollapsed"
		: panelKey === "crew"
			? "crewCollapsed"
			: panelKey === "routing"
				? "routingCollapsed"
				: "fuelCollapsed";
	try {
		await act.update({ [`flags.sw5e.starship.ui.${flagKey}`]: willCollapse });
	} catch ( err ) {
		console.error("SW5E MODULE | Starship core panel collapse update failed.", err);
	}
}

export function ensureStarshipCorePanelCollapseDelegate(container, app) {
	if ( !(container instanceof HTMLElement) ) return;
	if ( container.dataset.sw5eCoreCollapseDelegate === "1" ) return;
	container.dataset.sw5eCoreCollapseDelegate = "1";
	container.addEventListener("click", async event => {
		if ( event.target.closest("[data-sw5e-crew-command], [data-sw5e-fuel-action], [data-sw5e-supplies-action]") ) return;
		const crewRoleToggle = event.target.closest("[data-sw5e-crew-role-collapse]");
		if ( crewRoleToggle ) {
			event.preventDefault();
			event.stopPropagation();
			await toggleStarshipCrewRoleGroupCollapse(crewRoleToggle, app);
			return;
		}
		const collapseToggle = resolveStarshipCoreCollapseToggle(event.target);
		if ( !collapseToggle ) return;
		event.preventDefault();
		event.stopPropagation();
		await toggleStarshipCorePanelCollapse(collapseToggle, app);
	});
}

/**
 * Per-user collapse for Deployment feature groups (no actor.update).
 *
 * @param {HTMLElement} toggle
 * @param {object} app
 */
export async function toggleStarshipCrewRoleGroupCollapse(toggle, app) {
	const group = toggle.closest("[data-sw5e-crew-role-group]");
	if ( !(group instanceof HTMLElement) ) return;
	const groupKey = group.dataset.sw5eCrewRoleGroup;
	if ( !groupKey ) return;

	const willCollapse = !group.classList.contains("is-collapsed");
	group.classList.toggle("is-collapsed", willCollapse);
	group.querySelectorAll("[data-sw5e-crew-role-collapse]").forEach(btn => {
		btn.setAttribute("aria-expanded", willCollapse ? "false" : "true");
		const expandLabel = btn.dataset.expandLabel
			?? localizeOrFallback("SW5E.StarshipSheet.CrewRolesGroupExpand", "Expand deployment features");
		const collapseLabel = btn.dataset.collapseLabel
			?? localizeOrFallback("SW5E.StarshipSheet.CrewRolesGroupCollapse", "Collapse deployment features");
		const label = willCollapse ? expandLabel : collapseLabel;
		btn.title = label;
		btn.setAttribute("aria-label", label);
		if ( Object.prototype.hasOwnProperty.call(btn.dataset, "tooltip") ) btn.dataset.tooltip = label;
	});

	try {
		await persistCrewRoleGroupCollapse(app?.actor, groupKey, willCollapse);
	} catch ( err ) {
		console.error("SW5E MODULE | Crew role group collapse update failed.", err);
	}
}

export function ensureStarshipAdvancedPowerDelegate(root, app) {
	if ( !root || root.dataset.sw5eAdvancedPowerDelegate === "1" ) return;
	root.dataset.sw5eAdvancedPowerDelegate = "1";
	root.addEventListener("click", async event => {
		const spendBtn = event.target.closest("[data-sw5e-advanced-power-action='spend']");
		if ( spendBtn && !spendBtn.disabled ) {
			const act = app?.actor;
			if ( act && app?.isEditable !== false ) {
				const slotKey = spendBtn.dataset.powerSlot;
				if ( slotKey && STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) {
					try {
						await rollStarshipPowerDie(act, slotKey);
					} catch ( err ) {
						console.error("SW5E MODULE | Starship power die roll failed.", err);
					}
				}
			}
			return;
		}

		const recoverBtn = event.target.closest("[data-sw5e-advanced-power-action='recover']");
		if ( recoverBtn && !recoverBtn.disabled ) {
			const act = app?.actor;
			if ( !act || app?.isEditable === false ) return;
			try {
				await recoverStarshipPowerDice(act);
			} catch ( err ) {
				console.error("SW5E MODULE | Starship power die recovery failed.", err);
			}
		}
	});
}

export function ensureStarshipSystemDamageDelegate(root, app) {
	if ( !root || root.dataset.sw5eSystemDamageDelegate === "1" ) return;
	root.dataset.sw5eSystemDamageDelegate = "1";
	root.addEventListener("click", async event => {
		const pip = event.target.closest("[data-sw5e-system-damage-action='toggle-pip']");
		if ( !pip || pip.disabled ) return;
		const act = app?.actor;
		if ( !act || app?.isEditable === false ) return;
		if ( !canCurrentUserUpdateStarshipActor(act) ) {
			warnStarshipActorUpdateDenied();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const pipN = Number(pip.dataset.n);
		if ( !Number.isFinite(pipN) ) return;
		const current = getStarshipSystemDamageLevel(act);
		const next = resolveStarshipSystemDamagePipToggle(current, pipN);
		try {
			const renderGen = beginStarshipSheetRender(app);
			await setStarshipSystemDamageLevel(act, next);
			await renderStarshipSidebarSections(root, act, app, {
				renderGen,
				surfaces: [STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE]
			});
		} catch ( err ) {
			console.error("SW5E MODULE | Starship system damage update failed.", err);
		}
	});
}

export function ensureStarshipDestructionSaveDelegate(root, app) {
	if ( !root || root.dataset.sw5eDestructionSaveDelegate === "1" ) return;
	root.dataset.sw5eDestructionSaveDelegate = "1";
	root.addEventListener("click", async event => {
		const toggleBtn = event.target.closest("[data-sw5e-destruction-action='toggle']");
		if ( toggleBtn ) {
			event.preventDefault();
			toggleStarshipDestructionTray(app, root);
			return;
		}

		const rollBtn = event.target.closest("[data-sw5e-destruction-action='roll']");
		if ( rollBtn && !rollBtn.disabled ) {
			const act = app?.actor;
			if ( !act || app?.isEditable === false ) return;
			if ( !canCurrentUserUpdateStarshipActor(act) ) {
				warnStarshipActorUpdateDenied();
				return;
			}
			try {
				const renderGen = beginStarshipSheetRender(app);
				await rollStarshipDestructionSave(act);
				await renderStarshipSidebarSections(root, act, app, {
					renderGen,
					surfaces: [
						STARSHIP_SECTION.SIDEBAR_DESTRUCTION,
						STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE,
						STARSHIP_SECTION.SIDEBAR_VITALS
					]
				});
			} catch ( err ) {
				console.error("SW5E MODULE | Starship destruction save roll failed.", err);
			}
			return;
		}

		const resetBtn = event.target.closest("[data-sw5e-destruction-action='reset']");
		if ( resetBtn && !resetBtn.disabled ) {
			const act = app?.actor;
			if ( !act || !isStarshipSheetEditMode(app) || app?.isEditable === false ) return;
			if ( !canCurrentUserUpdateStarshipActor(act) ) {
				warnStarshipActorUpdateDenied();
				return;
			}
			try {
				const renderGen = beginStarshipSheetRender(app);
				await resetStarshipDestructionSaves(act);
				await renderStarshipSidebarSections(root, act, app, {
					renderGen,
					surfaces: [STARSHIP_SECTION.SIDEBAR_DESTRUCTION]
				});
			} catch ( err ) {
				console.error("SW5E MODULE | Starship destruction save reset failed.", err);
			}
		}
	});
}

export function toggleStarshipDestructionTray(app, root, open) {
	const shell = getStarshipSidebarShell(root, app);
	const tray = shell?.querySelector(".sw5e-starship-destruction-tray");
	if ( !(tray instanceof HTMLElement) ) return;

	const tab = tray.querySelector(".sw5e-starship-destruction-toggle");
	const shouldOpen = typeof open === "boolean" ? open : !tray.classList.contains("open");
	tray.classList.toggle("open", shouldOpen);
	if ( app ) app._sw5eDestructionTrayOpen = shouldOpen;

	if ( tab instanceof HTMLElement ) {
		const tooltipKey = shouldOpen
			? "SW5E.StarshipSheet.DestructionSaveHide"
			: "SW5E.StarshipSheet.DestructionSaveShow";
		tab.dataset.tooltip = tooltipKey;
		tab.setAttribute(
			"aria-label",
			localizeOrFallback(tooltipKey, shouldOpen ? "Hide Destruction Saves" : "Show Destruction Saves")
		);
		tab.setAttribute("aria-expanded", shouldOpen ? "true" : "false");
	}
}

/** Per-user collapse map for Core Deployment feature groups (`true` = collapsed). */
export const STARSHIP_CREW_ROLE_COLLAPSE_USER_FLAG = "starshipCrewRoleCollapse";

export function getCrewRoleCollapseMapForStarship(starshipActor) {
	const uuid = starshipActor?.uuid;
	if ( !uuid ) return {};
	const root = game?.user?.getFlag?.(getModuleId(), STARSHIP_CREW_ROLE_COLLAPSE_USER_FLAG);
	const map = root && typeof root === "object" ? root[uuid] : null;
	return map && typeof map === "object" ? map : {};
}

/**
 * @param {object} starshipActor
 * @param {string} groupKey
 * @param {boolean} collapsed
 */
export async function persistCrewRoleGroupCollapse(starshipActor, groupKey, collapsed) {
	const uuid = starshipActor?.uuid;
	if ( !uuid || !groupKey || !game?.user?.setFlag ) return;
	const moduleId = getModuleId();
	const root = foundry?.utils?.deepClone?.(
		game.user.getFlag(moduleId, STARSHIP_CREW_ROLE_COLLAPSE_USER_FLAG) ?? {}
	) ?? JSON.parse(JSON.stringify(game.user.getFlag(moduleId, STARSHIP_CREW_ROLE_COLLAPSE_USER_FLAG) ?? {}));
	const shipMap = { ...(root[uuid] && typeof root[uuid] === "object" ? root[uuid] : {}) };
	shipMap[groupKey] = Boolean(collapsed);
	root[uuid] = shipMap;
	await game.user.setFlag(moduleId, STARSHIP_CREW_ROLE_COLLAPSE_USER_FLAG, root);
}

