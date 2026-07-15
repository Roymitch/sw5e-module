/**
 * Starship sidebar mount/render helpers (Phase 6 G1).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

import { getModulePath } from "../module-support.mjs";
import {
	deriveStarshipPools,
	getDerivedStarshipRuntime,
	getLegacyStarshipActorSystem,
	persistStarshipLegacyAttributePath
} from "../starship-data.mjs";
import { openStarshipMovementConfig } from "../starship-movement-config.mjs";
import {
	buildDestructionSaveSidebarContext
} from "../starship-destruction-saves.mjs";
import {
	buildSystemDamageSidebarContext,
	getStarshipEffectiveHullMax,
	getStarshipEffectiveShieldMax
} from "../starship-system-damage.mjs";
import {
	getStarshipEquipmentFlatDamageReduction,
	getStarshipFlatDamageReduction,
	getStarshipFlatDamageReductionManual,
	persistStarshipFlatDamageReductionManual
} from "../starship-damage-reduction.mjs";
import { canCurrentUserUpdateStarshipActor, warnStarshipActorUpdateDenied } from "../starship-permissions.mjs";
import { openStarshipVitalConfig } from "../starship-vital-config.mjs";
import { localizeOrFallback } from "../starship-sheet-html.mjs";
import { isSw5eStarshipActor } from "../starship-sheet-ids.mjs";
import {
	consumeStarshipPendingSidebarScroll,
	getStarshipSidebarNameBlock,
	stashStarshipPendingSidebarScroll
} from "./starship-sheet-scroll.mjs";
import {
	coerceStarshipIntegerHpField,
	STARSHIP_INTEGER_HP_PATHS
} from "../starship-sheet-preupdate.mjs";

/**
 * Resolve the vehicle sidebar column (`aside.sheet-sidebar`), not the full sheet shell.
 * @param {HTMLElement} shell
 * @returns {HTMLElement|null}
 */
export function getStarshipSidebarAside(shell) {
	if ( !(shell instanceof HTMLElement) ) return null;
	if ( shell.matches("aside.sheet-sidebar, aside.sidebar") ) return shell;
	return shell.querySelector(
		"aside.sheet-sidebar, [data-application-part='sidebar'] aside.sheet-sidebar, [data-application-part='sidebar'] .sheet-sidebar, aside.sidebar, .sheet-sidebar"
	);
}

export function findStarshipSidebarPillsGroup(shell, labelText) {
	if ( !(shell instanceof HTMLElement) ) return null;
	const groups = shell.querySelectorAll(
		".sheet-sidebar .pills-group, [data-application-part='sidebar'] .pills-group, .sidebar .pills-group"
	);
	for ( const group of groups ) {
		const label = group.querySelector("h3 .roboto-upper");
		if ( label?.textContent?.trim() === labelText ) return group;
	}
	return null;
}

export const STARSHIP_SUPPRESSED_STOCK_MOVEMENT_LABELS = new Set(["Speed", "Travel Speed", "Travel Pace"]);

export function suppressStockVehicleMovementSidebarForStarship(root, actor, app = null) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	for ( const label of STARSHIP_SUPPRESSED_STOCK_MOVEMENT_LABELS ) {
		const group = findStarshipSidebarPillsGroup(shell, label);
		if ( !(group instanceof HTMLElement) ) continue;
		group.classList.add("sw5e-starship-suppress-stock-movement");
		group.setAttribute("hidden", "");
		group.setAttribute("aria-hidden", "true");
		for ( const control of group.querySelectorAll(
			"[data-action=\"showConfiguration\"][data-config=\"movement\"], [data-config=\"movement\"], [name^=\"system.attributes.movement.\"], [name^=\"system.attributes.travel.\"]"
		) ) {
			if ( !(control instanceof HTMLElement) ) continue;
			if ( "name" in control ) control.removeAttribute("name");
			if ( "disabled" in control ) control.disabled = true;
			control.setAttribute("hidden", "");
			control.setAttribute("aria-hidden", "true");
			control.tabIndex = -1;
		}
	}
}

export function ensureStarshipMovementConfigBlocked(root, app, actor) {
	if ( !isSw5eStarshipActor(actor) ) return;
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;
	if ( shell.dataset.sw5eMovementConfigBound === "1" ) return;
	shell.dataset.sw5eMovementConfigBound = "1";
	shell.addEventListener("click", event => {
		const target = event.target.closest("[data-action=\"showConfiguration\"][data-config=\"movement\"]");
		if ( !target ) return;
		event.preventDefault();
		event.stopPropagation();
		event.stopImmediatePropagation();
		void openStarshipMovementConfig(actor, app, { isEditMode: isStarshipSheetEditMode(app) });
	}, true);
}

export function buildStarshipSidebarMovementContext(actor, app = null, { runtime } = {}) {
	const resolvedRuntime = runtime ?? getDerivedStarshipRuntime(actor);
	const movement = resolvedRuntime.movement ?? {};
	const units = movement.units ?? actor.system?.attributes?.movement?.units ?? "ft";
	const space = Number(movement.space);
	const turn = Number(movement.turn);
	return {
		movementAriaLabel: localizeOrFallback("SW5E.Movement", "Movement"),
		spaceSpeedLabel: localizeOrFallback("SW5E.SpeedSpace", "Space speed"),
		spaceSpeedDisplay: Number.isFinite(space) ? `${Math.round(space)} ${units}` : "—",
		turningSpeedLabel: localizeOrFallback("SW5E.TurnSpeed", "Turning speed"),
		turningSpeedDisplay: Number.isFinite(turn) ? `${Math.round(turn)} ${units}` : "—",
		travelSpeedLabel: localizeOrFallback("DND5E.TravelSpeed", "Travel Speed"),
		travelSpeedDisplay: formatStarshipSidebarTravelSpeed(actor),
		travelPaceLabel: localizeOrFallback("DND5E.TravelPace", "Travel Pace"),
		travelPaceDisplay: formatStarshipSidebarTravelPace(actor),
		showMovementConfig: isStarshipSheetEditMode(app) && app?.isEditable !== false && actor?.isOwner,
		movementConfigLabel: localizeOrFallback("SW5E.StarshipSheet.MovementConfigLabel", "Configure Starship Movement")
	};
}

export async function renderStarshipSidebarMovement(root, actor, app = null, { runtime } = {}) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	suppressStockVehicleMovementSidebarForStarship(root, actor, app);
	ensureStarshipMovementConfigBlocked(root, app, actor);

	shell.querySelectorAll(".sw5e-starship-sidebar-movement").forEach(node => node.remove());

	const speedGroup = findStarshipSidebarPillsGroup(shell, "Speed");
	const sizeGroup = findStarshipSidebarPillsGroup(shell, "Size");
	const insertParent = speedGroup?.parentElement ?? sizeGroup?.parentElement;
	if ( !insertParent ) return;

	const ctx = buildStarshipSidebarMovementContext(actor, app, { runtime });
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-movement.hbs"),
		ctx
	);
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const movementBlock = mount.firstElementChild;
	if ( !(movementBlock instanceof HTMLElement) ) return;

	if ( sizeGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, sizeGroup);
	else if ( speedGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, speedGroup);
	else insertParent.prepend(movementBlock);

	bindStarshipSidebarMovementConfig(movementBlock, actor, app);
}

export function buildStarshipSidebarDamageReductionContext(actor, app = null) {
	const sheetEditMode = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	const manual = getStarshipFlatDamageReductionManual(actor);
	const equipment = getStarshipEquipmentFlatDamageReduction(actor);
	const value = getStarshipFlatDamageReduction(actor);
	const label = localizeOrFallback("SW5E.StarshipSheet.DamageReduction", "Damage Reduction");
	return {
		sheetEditMode,
		editable: sheetEditMode && actor?.isOwner !== false,
		showInPlay: !sheetEditMode && value > 0,
		label,
		playDisplay: `${label}: ${value}`,
		inputValue: manual !== null ? String(manual) : "",
		placeholder: String(equipment)
	};
}

export function bindStarshipSidebarDamageReduction(block, actor, app) {
	if ( !(block instanceof HTMLElement) ) return;
	const input = block.querySelector("[data-sw5e-starship-dr-manual]");
	if ( !(input instanceof HTMLInputElement) ) return;
	if ( input.dataset.sw5eDrBound === "1" ) return;
	input.dataset.sw5eDrBound = "1";

	input.addEventListener("keydown", event => {
		if ( event.key === "Enter" ) event.currentTarget.blur();
		if ( event.key === "Escape" ) {
			event.currentTarget.value = event.currentTarget.defaultValue;
			event.currentTarget.blur();
		}
	});

	input.addEventListener("change", async event => {
		const act = app?.actor ?? actor;
		if ( !act || app?.isEditable === false ) return;
		const raw = String(event.currentTarget.value ?? "").trim();
		try {
			stashStarshipPendingSidebarScroll(app, event.currentTarget);
			if ( raw === "" ) await persistStarshipFlatDamageReductionManual(act, null);
			else await persistStarshipFlatDamageReductionManual(act, raw);
		} catch ( err ) {
			consumeStarshipPendingSidebarScroll(app);
			console.error("SW5E MODULE | Starship sidebar damage reduction update failed.", err);
		}
	});
}

export async function renderStarshipSidebarDamageReduction(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	shell.querySelectorAll(".sw5e-starship-sidebar-damage-reduction").forEach(node => node.remove());

	const ctx = buildStarshipSidebarDamageReductionContext(actor, app);
	if ( !ctx.sheetEditMode && !ctx.showInPlay ) return;

	const resistancesLabel = (() => {
		try {
			return game.i18n.localize("DND5E.Resistances");
		} catch {
			return "Resistances";
		}
	})();
	const immunitiesLabel = (() => {
		try {
			return game.i18n.localize("DND5E.Immunities");
		} catch {
			return "Immunities";
		}
	})();
	const resistancesGroup = findStarshipSidebarPillsGroup(shell, resistancesLabel)
		?? findStarshipSidebarPillsGroup(shell, "Resistances");
	const immunitiesGroup = findStarshipSidebarPillsGroup(shell, immunitiesLabel)
		?? findStarshipSidebarPillsGroup(shell, "Immunities");
	const insertBefore = resistancesGroup ?? immunitiesGroup
		?? shell.querySelector(
			".sheet-sidebar .pills-group, [data-application-part='sidebar'] .pills-group, .sidebar .pills-group"
		);
	const insertParent = insertBefore?.parentElement ?? getStarshipSidebarAside(shell);
	if ( !insertParent ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-damage-reduction.hbs"),
		ctx
	);
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const drBlock = mount.firstElementChild;
	if ( !(drBlock instanceof HTMLElement) ) return;

	if ( insertBefore?.parentElement === insertParent ) insertParent.insertBefore(drBlock, insertBefore);
	else insertParent.append(drBlock);

	bindStarshipSidebarDamageReduction(drBlock, actor, app);
}


export function getStarshipSidebarVitalsMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	const nameBlock = getStarshipSidebarNameBlock(shell);
	if ( !(nameBlock instanceof HTMLElement) || !(nameBlock.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: nameBlock.parentElement,
		reference: nameBlock,
		insertAfter: true
	};
}

export function buildStarshipSidebarSummaryLabels() {
	return {
		hullPoints: localizeOrFallback("SW5E.HullPoints", "Hull Points"),
		shieldPoints: localizeOrFallback("SW5E.ShieldPoints", "Shield Points"),
		hullDice: localizeOrFallback("SW5E.HullDice", "Hull Dice"),
		shieldDice: localizeOrFallback("SW5E.ShieldDice", "Shield Dice"),
		configureHullPoints: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureHullPoints", "Configure Hull Points"),
		configureShieldPoints: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureShieldPoints", "Configure Shield Points"),
		configureHullDice: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureHullDice", "Configure Hull Dice"),
		configureShieldDice: localizeOrFallback("SW5E.StarshipVitalConfig.ConfigureShieldDice", "Configure Shield Dice")
	};
}

export async function buildStarshipSidebarVitalsRenderContext(actor, app = null) {
	const sheetEditMode = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	return {
		vitals: buildStarshipSidebarVitalsContext(actor),
		labels: buildStarshipSidebarSummaryLabels(),
		sheetEditMode,
		playMode: !sheetEditMode
	};
}

export async function renderStarshipSidebarVitals(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	shell?.querySelectorAll(".sw5e-starship-sidebar-vitals").forEach(node => node.remove());

	const mountPoint = getStarshipSidebarVitalsMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const ctx = await buildStarshipSidebarVitalsRenderContext(actor, app);
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-vitals.hbs"),
		ctx
	);

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-vitals";
	wrapper.innerHTML = rendered;

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
	bindStarshipVitalsMeterControls(root, actor, app);
}

export function getStarshipSystemDamageMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	const vitalsBlock = shell?.querySelector(".sw5e-starship-sidebar-vitals");
	const nameBlock = getStarshipSidebarNameBlock(shell);
	const reference = vitalsBlock ?? nameBlock;
	if ( !(reference instanceof HTMLElement) || !(reference.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: reference.parentElement,
		reference,
		insertAfter: true
	};
}

export async function renderStarshipSidebarSystemDamage(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	shell?.querySelectorAll(".sw5e-starship-sidebar-system-damage").forEach(node => node.remove());

	const mountPoint = getStarshipSystemDamageMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const ctx = buildSystemDamageSidebarContext(actor, {
		editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
	});
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-system-damage.hbs"),
		ctx
	);

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-system-damage";
	if ( ctx.catastrophic ) wrapper.classList.add("sw5e-starship-sidebar-system-damage--catastrophic");
	wrapper.innerHTML = rendered;

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
}

export function removeStarshipSidebarSummary(root) {
	if ( !(root instanceof HTMLElement) ) return;
	root.querySelectorAll(".sw5e-starship-sidebar-summary").forEach(node => node.remove());
}

export function getStarshipDestructionTrayMountPoint(root, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return null;

	const systemDamageBlock = shell.querySelector(".sw5e-starship-sidebar-system-damage");
	const vitalsBlock = shell.querySelector(".sw5e-starship-sidebar-vitals");
	const nameBlock = getStarshipSidebarNameBlock(shell);
	const reference = systemDamageBlock ?? vitalsBlock ?? nameBlock;
	if ( !(reference instanceof HTMLElement) || !(reference.parentElement instanceof HTMLElement) ) return null;

	return {
		parent: reference.parentElement,
		reference,
		insertAfter: true
	};
}

export async function renderStarshipSidebarDestructionSaves(root, actor, app = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	shell.querySelectorAll(".sw5e-starship-destruction-tray").forEach(node => node.remove());

	const mountPoint = getStarshipDestructionTrayMountPoint(root, app);
	if ( !mountPoint?.parent || !(mountPoint.reference instanceof HTMLElement) ) return;

	const editMode = Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false);
	const ctx = buildDestructionSaveSidebarContext(actor, {
		open: app?._sw5eDestructionTrayOpen === true,
		editMode,
		editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
	});

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-destruction-saves.hbs"),
		ctx
	);
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const tray = mount.firstElementChild;
	if ( !(tray instanceof HTMLElement) ) return;

	mountPoint.reference.insertAdjacentElement(mountPoint.insertAfter ? "afterend" : "beforebegin", tray);

	syncDestructionTrayControlState(app, root);
}

export function getStarshipSidebarShell(root, app = null) {
	return (app?.element instanceof HTMLElement ? app.element : null) ?? root;
}

/**
 * Align SotG item-list chrome with dnd5e sheet mode: PLAY = compact rows; EDIT = full row actions.
 * @param {object} app  Actor sheet application (`app._mode`, `app.isEditable`, `app.constructor.MODES`)
 * @param {HTMLElement | null} starshipPanel  `.sw5e-starship-panel` inside the SotG tab
 */
export function isStarshipSheetEditMode(app) {
	if ( !app ) return false;
	const MODES = app.constructor?.MODES;
	const hasModeEnum = MODES?.EDIT != null && MODES?.PLAY != null;
	if ( hasModeEnum ) return app._mode === MODES.EDIT;
	return app.isEditable === true;
}


export function buildStarshipSidebarVitalsContext(actor) {
	const hp = getStarshipLiveVehicleHp(actor);
	const pools = deriveStarshipPools(actor);
	const hullValue = Math.max(0, Number(hp.value) || 0);
	const hullStoredMax = Math.max(0, Number(hp.max) || 0);
	const hullMax = getStarshipEffectiveHullMax(actor, hullStoredMax);
	const shieldValue = Math.max(0, Number(hp.temp) || 0);
	const shieldStoredMax = Math.max(0, Number(hp.tempmax) || 0);
	const shieldMax = getStarshipEffectiveShieldMax(actor, shieldStoredMax);
	const hullDiceCurrent = Math.max(0, Number(pools.hull?.current) || 0);
	const hullDiceMax = Math.max(0, Number(pools.hull?.max) || 0);
	const shieldDiceCurrent = Math.max(0, Number(pools.shld?.current) || 0);
	const shieldDiceMax = Math.max(0, Number(pools.shld?.max) || 0);

	return {
		hull: { value: hullValue, max: hullMax, pct: starshipVitalMeterPct(hullValue, hullMax) },
		shield: { value: shieldValue, max: shieldMax, pct: starshipVitalMeterPct(shieldValue, shieldMax) },
		hullDice: {
			current: hullDiceCurrent,
			max: hullDiceMax,
			die: pools.hull?.die ?? "",
			pct: starshipVitalMeterPct(hullDiceCurrent, hullDiceMax)
		},
		shieldDice: {
			current: shieldDiceCurrent,
			max: shieldDiceMax,
			die: pools.shld?.die ?? "",
			pct: starshipVitalMeterPct(shieldDiceCurrent, shieldDiceMax)
		}
	};
}


export function bindStarshipSidebarMovementConfig(movementBlock, actor, app) {
	if ( !(movementBlock instanceof HTMLElement) ) return;
	const button = movementBlock.querySelector("[data-sw5e-starship-movement-config]");
	if ( !(button instanceof HTMLButtonElement) ) return;
	if ( button.dataset.sw5eMovementConfigBound === "1" ) return;
	button.dataset.sw5eMovementConfigBound = "1";
	button.addEventListener("click", event => {
		event.preventDefault();
		event.stopPropagation();
		void openStarshipMovementConfig(actor, app, { isEditMode: isStarshipSheetEditMode(app) });
	});
}


export const STARSHIP_VITAL_INLINE_PATHS = new Set([
	"system.attributes.hp.value",
	"system.attributes.hp.temp"
]);

export function parseStarshipVitalInlineDelta(raw, current) {
	const parseDelta = game?.dnd5e?.utils?.parseDelta ?? globalThis.dnd5e?.utils?.parseDelta;
	if ( typeof parseDelta === "function" ) {
		const value = parseDelta(String(raw ?? "").trim(), Number(current) || 0);
		return Number.isFinite(value) ? Math.trunc(value) : null;
	}
	const text = String(raw ?? "").trim();
	if ( !text ) return null;
	let value = Number(text);
	if ( text[0] === "+" || text[0] === "-" ) value = (Number(current) || 0) + parseFloat(text);
	else if ( text[0] === "=" ) value = Number(text.slice(1));
	return Number.isFinite(value) ? Math.trunc(value) : null;
}

export function clampStarshipVitalInlineValue(actor, systemPath, value) {
	const hp = actor?.system?.attributes?.hp ?? {};
	let next = Math.max(0, Math.trunc(Number(value) || 0));
	if ( systemPath === "system.attributes.hp.value" ) {
		const max = getStarshipEffectiveHullMax(actor, hp.max);
		if ( max > 0 ) next = Math.min(next, max);
	} else if ( systemPath === "system.attributes.hp.temp" ) {
		const max = getStarshipEffectiveShieldMax(actor, hp.tempmax);
		if ( max > 0 ) next = Math.min(next, max);
	}
	return next;
}

/** @returns {Promise<void>} */
export async function persistStarshipFuelPowerSystemPath(act, systemPath, value) {
	await persistStarshipLegacyAttributePath(act, systemPath, value);
}

export function bindStarshipVitalsMeterControls(root, actor, app) {
	if ( !(root instanceof HTMLElement) || !isSw5eStarshipActor(actor) ) return;
	const vitals = root.querySelector(".sw5e-starship-sidebar-vitals");
	if ( !(vitals instanceof HTMLElement) ) return;

	const playMode = !isStarshipSheetEditMode(app) && app?.isEditable !== false;
	for ( const meter of vitals.querySelectorAll(".sw5e-starship-vital-play-meter[role='meter']") ) {
		const input = meter.querySelector(":scope > input[data-sw5e-vital-path]");
		if ( !(input instanceof HTMLInputElement) ) continue;
		if ( meter.dataset.sw5eVitalMeterBound === "1" ) continue;
		meter.dataset.sw5eVitalMeterBound = "1";
		meter.classList.toggle("sw5e-starship-vital-play-meter--interactive", playMode);
		if ( !playMode ) continue;

		meter.addEventListener("click", event => {
			if ( isStarshipSheetEditMode(app) || app?.isEditable === false ) return;
			toggleStarshipVitalMeterDisplay(event, true);
		});
		input.addEventListener("blur", event => toggleStarshipVitalMeterDisplay(event, false));
		input.addEventListener("keydown", event => {
			if ( event.key === "Enter" ) event.currentTarget.blur();
			if ( event.key === "Escape" ) {
				event.currentTarget.value = event.currentTarget.defaultValue;
				event.currentTarget.blur();
			}
		});
		input.addEventListener("change", async event => {
			const path = event.currentTarget.getAttribute("data-sw5e-vital-path");
			if ( !path || !STARSHIP_VITAL_INLINE_PATHS.has(path) ) return;
			const act = app?.actor ?? actor;
			if ( !act ) return;
			const hpKey = path.endsWith(".temp") ? "temp" : "value";
			const current = Number(act.system?.attributes?.hp?.[hpKey]) || 0;
			let next = parseStarshipVitalInlineDelta(event.currentTarget.value, current);
			if ( next === null ) next = clampStarshipVitalInlineValue(act, path, current);
			else next = clampStarshipVitalInlineValue(act, path, next);
			if ( next === current ) {
				event.currentTarget.value = String(next);
				return;
			}
			try {
				stashStarshipPendingSidebarScroll(app, event.currentTarget);
				await persistStarshipFuelPowerSystemPath(act, path, next);
			} catch ( err ) {
				consumeStarshipPendingSidebarScroll(app);
				console.error("SW5E MODULE | Starship vital inline update failed.", err);
			}
		});
	}
}


export function formatStarshipSidebarTravelSpeed(actor) {
	const travel = actor?.system?.attributes?.travel ?? {};
	const speed = Number(travel.speeds?.air);
	if ( !Number.isFinite(speed) ) return "—";
	const units = travel.units === "kph" ? "km/h" : "mph";
	return `${Math.round(speed)} ${units}`;
}


export function formatStarshipSidebarTravelPace(actor) {
	const travel = actor?.system?.attributes?.travel ?? {};
	const pace = Number(travel.paces?.air);
	if ( !Number.isFinite(pace) ) return "—";
	const units = travel.units === "kph" ? "km/d" : "mi/d";
	return `${pace.toLocaleString()} ${units}`;
}


export function syncDestructionTrayControlState(app, root) {
	const shell = getStarshipSidebarShell(root, app);
	const tray = shell?.querySelector(".sw5e-starship-destruction-tray");
	if ( !(tray instanceof HTMLElement) ) return;

	const routingEditable = app?.isEditable !== false;
	const setupEditable = isStarshipSheetEditMode(app) && routingEditable;

	for ( const rollBtn of tray.querySelectorAll("[data-sw5e-destruction-action='roll']") ) {
		if ( rollBtn instanceof HTMLButtonElement ) {
			rollBtn.disabled = !routingEditable || rollBtn.dataset.canRoll !== "1";
		}
	}

	const resetBtn = tray.querySelector("[data-sw5e-destruction-action='reset']");
	if ( resetBtn instanceof HTMLButtonElement ) resetBtn.disabled = !setupEditable;
}


export function starshipVitalMeterPct(current, max) {
	const cap = Math.max(0, Number(max) || 0);
	const value = Math.max(0, Number(current) || 0);
	if ( cap <= 0 ) return value > 0 ? 100 : 0;
	return Math.min(100, Math.round((value / cap) * 100));
}


export function toggleStarshipVitalMeterDisplay(event, edit) {
	const meter = event.currentTarget?.closest?.('[role="meter"]');
	if ( !(meter instanceof HTMLElement) ) return;
	if ( event.target?.closest?.("button") ) return;
	const label = meter.querySelector(":scope > .label");
	const input = meter.querySelector(":scope > input[data-sw5e-vital-path]");
	if ( !(label instanceof HTMLElement) || !(input instanceof HTMLInputElement) ) return;
	label.hidden = edit;
	input.hidden = !edit;
	if ( edit ) {
		input.focus();
		input.select?.();
	}
}


/** Live dnd5e vehicle HP object (hull value/max, shield temp/tempmax) — same source as stock vehicle Hit Points UI. */
export function getStarshipLiveVehicleHp(actor) {
	return actor?.system?.attributes?.hp ?? {};
}




