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
import { resolveStarshipSidebarMovementVisibility } from "../starship-sidebar-movement-visibility.mjs";
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
import { buildStarshipMaxFiresDisplayContext } from "../starship-max-fires.mjs";
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
	STARSHIP_SECTION,
	STARSHIP_SECTION_ATTR,
	compareStarshipSectionSignature,
	isStarshipPartialFailed,
	isStarshipSheetRenderCurrent,
	markStarshipSectionElement,
	replaceStarshipSectionSubtree,
	setStarshipPartialFailed,
	setStarshipSectionSignature,
	signaturePayloadSidebarDamageReduction,
	signaturePayloadSidebarDestruction,
	signaturePayloadSidebarMaxFires,
	signaturePayloadSidebarMovement,
	signaturePayloadSidebarSystemDamage,
	signaturePayloadSidebarVitals,
	validateStarshipSectionTarget
} from "./starship-sheet-partial.mjs";
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
	const { showMovementCounters, showMovementConfig } = resolveStarshipSidebarMovementVisibility(app, actor);
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
		showMovementCounters,
		showMovementConfig,
		movementConfigLabel: localizeOrFallback("SW5E.StarshipSheet.MovementConfigLabel", "Configure Starship Movement")
	};
}

const STARSHIP_SIDEBAR_SURFACE_ORDER = Object.freeze([
	STARSHIP_SECTION.SIDEBAR_VITALS,
	STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE,
	STARSHIP_SECTION.SIDEBAR_DESTRUCTION,
	STARSHIP_SECTION.SIDEBAR_MOVEMENT,
	STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION,
	STARSHIP_SECTION.SIDEBAR_MAX_FIRES
]);

function normalizeSidebarSurfaceIds(surfaces) {
	if ( !Array.isArray(surfaces) || surfaces.length === 0 ) return [...STARSHIP_SIDEBAR_SURFACE_ORDER];
	return STARSHIP_SIDEBAR_SURFACE_ORDER.filter(id => surfaces.includes(id));
}

function syncStableSectionAttributes(existing, next, sectionId) {
	if ( !(existing instanceof HTMLElement) || !(next instanceof HTMLElement) ) return;
	for ( const attr of Array.from(existing.attributes) ) {
		if ( attr.name === STARSHIP_SECTION_ATTR ) continue;
		existing.removeAttribute(attr.name);
	}
	for ( const attr of Array.from(next.attributes) ) existing.setAttribute(attr.name, attr.value);
	markStarshipSectionElement(existing, sectionId);
}

function getSidebarSurfaceSelector(sectionId) {
	switch ( sectionId ) {
		case STARSHIP_SECTION.SIDEBAR_VITALS: return ".sw5e-starship-sidebar-vitals";
		case STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE: return ".sw5e-starship-sidebar-system-damage";
		case STARSHIP_SECTION.SIDEBAR_DESTRUCTION: return ".sw5e-starship-destruction-tray";
		case STARSHIP_SECTION.SIDEBAR_MOVEMENT: return ".sw5e-starship-sidebar-movement";
		case STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION: return ".sw5e-starship-sidebar-damage-reduction";
		case STARSHIP_SECTION.SIDEBAR_MAX_FIRES: return ".sw5e-starship-sidebar-max-fires";
		default: return null;
	}
}

function getSidebarSurfaceExisting(root, sectionId) {
	const selector = getSidebarSurfaceSelector(sectionId);
	return validateStarshipSectionTarget({
		root,
		sectionId,
		fallbackSelector: selector,
		expectedCount: 1
	});
}

function syncVitalPlayMeter(meter, data, labelText) {
	if ( !(meter instanceof HTMLElement) ) return false;
	const label = meter.querySelector(":scope > .label");
	if ( !(label instanceof HTMLElement) ) return false;
	const valueNode = label.querySelector(".value");
	const maxNode = label.querySelector(".max");
	if ( !(valueNode instanceof HTMLElement) || !(maxNode instanceof HTMLElement) ) return false;
	valueNode.textContent = String(data.value ?? 0);
	maxNode.textContent = String(data.max ?? 0);
	meter.setAttribute("aria-valuenow", String(data.value ?? 0));
	meter.setAttribute("aria-valuemax", String(data.max ?? 0));
	meter.style.setProperty("--bar-percentage", `${data.pct ?? 0}%`);
	const input = meter.querySelector(":scope > input[data-sw5e-vital-path]");
	if ( input instanceof HTMLInputElement ) {
		input.setAttribute("aria-label", labelText);
		if ( document.activeElement !== input ) {
			input.value = String(data.value ?? 0);
			input.defaultValue = String(data.value ?? 0);
		}
	}
	return true;
}

function syncVitalDiceMeter(meter, data) {
	if ( !(meter instanceof HTMLElement) ) return false;
	const label = meter.querySelector(":scope > .label");
	if ( !(label instanceof HTMLElement) ) return false;
	const valueNode = label.querySelector(".value");
	const maxNode = label.querySelector(".max");
	const dieNode = label.querySelector(".die");
	if ( !(valueNode instanceof HTMLElement) || !(maxNode instanceof HTMLElement) ) return false;
	valueNode.textContent = String(data.current ?? 0);
	maxNode.textContent = String(data.max ?? 0);
	meter.setAttribute("aria-valuenow", String(data.current ?? 0));
	meter.setAttribute("aria-valuemax", String(data.max ?? 0));
	meter.style.setProperty("--bar-percentage", `${data.pct ?? 0}%`);
	if ( data.die ) {
		if ( dieNode instanceof HTMLElement ) dieNode.textContent = String(data.die);
		else return false;
	} else if ( dieNode instanceof HTMLElement ) {
		dieNode.remove();
	}
	return true;
}

function tryApplySidebarVitalsPatch(vitals, ctx) {
	if ( !(vitals instanceof HTMLElement) ) return false;
	const currentEditMode = vitals.querySelector("[data-sw5e-vital-config]") != null;
	if ( currentEditMode !== Boolean(ctx?.sheetEditMode) ) return false;

	const hullGroup = vitals.querySelector(".sw5e-starship-vital-meter--primary");
	const shieldGroup = vitals.querySelector(".sw5e-starship-shield-meter")?.closest(".sw5e-starship-vital-meter");
	const hullDiceGroup = vitals.querySelector(".sw5e-starship-hull-dice-meter")?.closest(".sw5e-starship-vital-meter");
	const shieldDiceGroup = vitals.querySelector(".sw5e-starship-shield-dice-meter")?.closest(".sw5e-starship-vital-meter");
	if ( !(hullGroup instanceof HTMLElement) || !(shieldGroup instanceof HTMLElement) || !(hullDiceGroup instanceof HTMLElement) || !(shieldDiceGroup instanceof HTMLElement) ) return false;

	const hullLabel = hullGroup.querySelector(".label.roboto-condensed-upper > span");
	const shieldLabel = shieldGroup.querySelector(".label.roboto-condensed-upper > span");
	const hullDiceLabel = hullDiceGroup.querySelector(".label.roboto-condensed-upper > span");
	const shieldDiceLabel = shieldDiceGroup.querySelector(".label.roboto-condensed-upper > span");
	if ( !(hullLabel instanceof HTMLElement) || !(shieldLabel instanceof HTMLElement) || !(hullDiceLabel instanceof HTMLElement) || !(shieldDiceLabel instanceof HTMLElement) ) return false;

	hullLabel.textContent = ctx.labels.hullPoints;
	shieldLabel.textContent = ctx.labels.shieldPoints;
	hullDiceLabel.textContent = ctx.labels.hullDice;
	shieldDiceLabel.textContent = ctx.labels.shieldDice;

	for ( const [selector, aria] of [
		["[data-sw5e-vital-config='hullPoints']", ctx.labels.configureHullPoints],
		["[data-sw5e-vital-config='shieldPoints']", ctx.labels.configureShieldPoints],
		["[data-sw5e-vital-config='hullDice']", ctx.labels.configureHullDice],
		["[data-sw5e-vital-config='shieldDice']", ctx.labels.configureShieldDice]
	] ) {
		const button = vitals.querySelector(selector);
		if ( button instanceof HTMLButtonElement ) button.setAttribute("aria-label", aria);
	}

	const hullMeter = vitals.querySelector(".sw5e-starship-hull-meter .sw5e-starship-vital-play-meter");
	const shieldMeter = vitals.querySelector(".sw5e-starship-shield-meter .sw5e-starship-vital-play-meter");
	const hullDiceMeter = vitals.querySelector(".sw5e-starship-hull-dice-meter");
	const shieldDiceMeter = vitals.querySelector(".sw5e-starship-shield-dice-meter");
	return syncVitalPlayMeter(hullMeter, ctx.vitals.hull, ctx.labels.hullPoints)
		&& syncVitalPlayMeter(shieldMeter, ctx.vitals.shield, ctx.labels.shieldPoints)
		&& syncVitalDiceMeter(hullDiceMeter, ctx.vitals.hullDice)
		&& syncVitalDiceMeter(shieldDiceMeter, ctx.vitals.shieldDice);
}

function tryApplySidebarSystemDamagePatch(wrapper, ctx) {
	if ( !(wrapper instanceof HTMLElement) ) return false;
	const inner = wrapper.querySelector(".sw5e-starship-system-damage-inner");
	const buttons = Array.from(wrapper.querySelectorAll("[data-sw5e-system-damage-action='toggle-pip']"))
		.filter(node => node instanceof HTMLButtonElement);
	if ( !(inner instanceof HTMLElement) || buttons.length !== (ctx?.pips?.length ?? 0) ) return false;
	inner.setAttribute("aria-label", ctx.panelAria ?? "");
	wrapper.classList.toggle("sw5e-starship-sidebar-system-damage--catastrophic", Boolean(ctx.catastrophic));
	for ( let i = 0; i < buttons.length; i += 1 ) {
		const button = buttons[i];
		const pip = ctx.pips[i];
		button.className = `${pip.classes ?? ""} unbutton`.trim();
		button.dataset.n = String(pip.n ?? i + 1);
		button.dataset.tooltip = pip.tooltip ?? "";
		button.setAttribute("aria-label", pip.label ?? "");
		button.setAttribute("aria-pressed", pip.filled ? "true" : "false");
		button.disabled = !ctx.editable;
		if ( ctx.editable ) button.removeAttribute("tabindex");
		else button.setAttribute("tabindex", "-1");
	}
	return true;
}

function applyStableSidebarSubtree(existing, next, sectionId) {
	if ( !(existing instanceof HTMLElement) || !(next instanceof HTMLElement) ) return;
	syncStableSectionAttributes(existing, next, sectionId);
	replaceStarshipSectionSubtree(existing, next.innerHTML);
}

export async function renderStarshipSidebarSections(root, actor, app = null, { runtime, renderGen = null, surfaces = null, allowPartial = null } = {}) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return "skipped";

	const requested = normalizeSidebarSurfaceIds(surfaces);
	const entries = [];

	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_VITALS) ) {
		const ctx = await buildStarshipSidebarVitalsRenderContext(actor, app);
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_VITALS, signaturePayloadSidebarVitals(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_VITALS, ctx, dirty: compare.dirty, signature: compare.signature });
	}
	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE) ) {
		const ctx = buildSystemDamageSidebarContext(actor, {
			editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
		});
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE, signaturePayloadSidebarSystemDamage(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE, ctx, dirty: compare.dirty, signature: compare.signature });
	}
	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_DESTRUCTION) ) {
		const ctx = buildDestructionSaveSidebarContext(actor, {
			open: app?._sw5eDestructionTrayOpen === true,
			editMode: Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false),
			editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
		});
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_DESTRUCTION, signaturePayloadSidebarDestruction(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_DESTRUCTION, ctx, dirty: compare.dirty, signature: compare.signature });
	}
	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_MOVEMENT) ) {
		const ctx = buildStarshipSidebarMovementContext(actor, app, { runtime });
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_MOVEMENT, signaturePayloadSidebarMovement(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_MOVEMENT, ctx, dirty: compare.dirty, signature: compare.signature });
	}
	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION) ) {
		const ctx = buildStarshipSidebarDamageReductionContext(actor, app);
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION, signaturePayloadSidebarDamageReduction(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION, ctx, dirty: compare.dirty, signature: compare.signature });
	}
	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_MAX_FIRES) ) {
		const ctx = buildStarshipSidebarMaxFiresContext(actor);
		const compare = compareStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_MAX_FIRES, signaturePayloadSidebarMaxFires(ctx));
		entries.push({ id: STARSHIP_SECTION.SIDEBAR_MAX_FIRES, ctx, dirty: compare.dirty, signature: compare.signature });
	}

	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";

	const partialEnabled = allowPartial === true
		|| (allowPartial == null && !isStarshipPartialFailed(app));

	if ( requested.includes(STARSHIP_SECTION.SIDEBAR_MOVEMENT) ) {
		suppressStockVehicleMovementSidebarForStarship(root, actor, app);
		ensureStarshipMovementConfigBlocked(root, app, actor);
	}

	let canPartial = partialEnabled;
	if ( canPartial ) {
		for ( const entry of entries ) {
			if ( entry.id === STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION ) {
				const shouldExist = entry.ctx.sheetEditMode || entry.ctx.showInPlay;
				const check = validateStarshipSectionTarget({
					root: shell,
					sectionId: entry.id,
					fallbackSelector: getSidebarSurfaceSelector(entry.id),
					expectedCount: shouldExist ? 1 : 0
				});
				if ( !check.ok ) {
					canPartial = false;
					break;
				}
				continue;
			}
			if ( entry.id === STARSHIP_SECTION.SIDEBAR_MAX_FIRES ) {
				const shouldExist = Boolean(entry.ctx.show);
				const check = validateStarshipSectionTarget({
					root: shell,
					sectionId: entry.id,
					fallbackSelector: getSidebarSurfaceSelector(entry.id),
					expectedCount: shouldExist ? 1 : 0
				});
				if ( !check.ok ) {
					canPartial = false;
					break;
				}
				continue;
			}
			const check = getSidebarSurfaceExisting(shell, entry.id);
			if ( !check.ok ) {
				canPartial = false;
				break;
			}
		}
	}

	const runFullFallback = async () => {
		for ( const entry of entries ) {
			if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
			switch ( entry.id ) {
				case STARSHIP_SECTION.SIDEBAR_VITALS:
					await renderStarshipSidebarVitalsFull(root, actor, app, entry.ctx, entry.signature, renderGen);
					break;
				case STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE:
					await renderStarshipSidebarSystemDamageFull(root, actor, app, entry.ctx, entry.signature, renderGen);
					break;
				case STARSHIP_SECTION.SIDEBAR_DESTRUCTION:
					await renderStarshipSidebarDestructionSavesFull(root, actor, app, entry.ctx, entry.signature, renderGen);
					break;
				case STARSHIP_SECTION.SIDEBAR_MOVEMENT:
					await renderStarshipSidebarMovementFull(root, actor, app, entry.ctx, entry.signature, renderGen, runtime);
					break;
				case STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION:
					await renderStarshipSidebarDamageReductionFull(root, actor, app, entry.ctx, entry.signature, renderGen);
					break;
				case STARSHIP_SECTION.SIDEBAR_MAX_FIRES:
					await renderStarshipSidebarMaxFiresFull(root, actor, app, entry.ctx, entry.signature, renderGen);
					break;
			}
		}
		return "full";
	};

	if ( !canPartial ) {
		const outcome = await runFullFallback();
		if ( outcome !== "skipped" && !isStarshipPartialFailed(app) ) setStarshipPartialFailed(app, false);
		return outcome;
	}

	try {
		for ( const entry of entries ) {
			if ( !entry.dirty ) continue;
			if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";

			if ( entry.id === STARSHIP_SECTION.SIDEBAR_VITALS ) {
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				if ( !tryApplySidebarVitalsPatch(existing, entry.ctx) ) {
					const rendered = await foundry.applications.handlebars.renderTemplate(
						getModulePath("templates/starship-sidebar-vitals.hbs"),
						entry.ctx
					);
					if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
					const mount = document.createElement("section");
					mount.className = "sw5e-starship-sidebar-vitals";
					mount.innerHTML = rendered;
					applyStableSidebarSubtree(existing, mount, entry.id);
					bindStarshipVitalsMeterControls(root, actor, app);
				}
			} else if ( entry.id === STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE ) {
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				if ( !tryApplySidebarSystemDamagePatch(existing, entry.ctx) ) {
					const rendered = await foundry.applications.handlebars.renderTemplate(
						getModulePath("templates/starship-sidebar-system-damage.hbs"),
						entry.ctx
					);
					if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
					const mount = document.createElement("section");
					mount.className = "sw5e-starship-sidebar-system-damage";
					if ( entry.ctx.catastrophic ) mount.classList.add("sw5e-starship-sidebar-system-damage--catastrophic");
					mount.innerHTML = rendered;
					applyStableSidebarSubtree(existing, mount, entry.id);
				}
			} else if ( entry.id === STARSHIP_SECTION.SIDEBAR_DESTRUCTION ) {
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				const rendered = await foundry.applications.handlebars.renderTemplate(
					getModulePath("templates/starship-sidebar-destruction-saves.hbs"),
					entry.ctx
				);
				if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
				const mount = document.createElement("div");
				mount.innerHTML = rendered.trim();
				const tray = mount.firstElementChild;
				if ( !(tray instanceof HTMLElement) ) throw new Error("Invalid destruction tray render.");
				applyStableSidebarSubtree(existing, tray, entry.id);
				syncDestructionTrayControlState(app, root);
			} else if ( entry.id === STARSHIP_SECTION.SIDEBAR_MOVEMENT ) {
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				const rendered = await foundry.applications.handlebars.renderTemplate(
					getModulePath("templates/starship-sidebar-movement.hbs"),
					entry.ctx
				);
				if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
				const mount = document.createElement("div");
				mount.innerHTML = rendered.trim();
				const movementBlock = mount.firstElementChild;
				if ( !(movementBlock instanceof HTMLElement) ) throw new Error("Invalid movement sidebar render.");
				applyStableSidebarSubtree(existing, movementBlock, entry.id);
				bindStarshipSidebarMovementConfig(existing, actor, app);
			} else if ( entry.id === STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION ) {
				if ( !entry.ctx.sheetEditMode && !entry.ctx.showInPlay ) continue;
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				const rendered = await foundry.applications.handlebars.renderTemplate(
					getModulePath("templates/starship-sidebar-damage-reduction.hbs"),
					entry.ctx
				);
				if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
				const mount = document.createElement("div");
				mount.innerHTML = rendered.trim();
				const block = mount.firstElementChild;
				if ( !(block instanceof HTMLElement) ) throw new Error("Invalid damage reduction render.");
				applyStableSidebarSubtree(existing, block, entry.id);
				bindStarshipSidebarDamageReduction(existing, actor, app);
			} else if ( entry.id === STARSHIP_SECTION.SIDEBAR_MAX_FIRES ) {
				if ( !entry.ctx.show ) continue;
				const existing = getSidebarSurfaceExisting(shell, entry.id).elements[0];
				const rendered = await foundry.applications.handlebars.renderTemplate(
					getModulePath("templates/starship-sidebar-max-fires.hbs"),
					entry.ctx
				);
				if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
				const mount = document.createElement("div");
				mount.innerHTML = rendered.trim();
				const block = mount.firstElementChild;
				if ( !(block instanceof HTMLElement) ) throw new Error("Invalid max fires render.");
				applyStableSidebarSubtree(existing, block, entry.id);
			}
		}

		for ( const entry of entries ) setStarshipSectionSignature(app, entry.id, entry.signature);
		setStarshipPartialFailed(app, false);
		return "partial";
	} catch ( err ) {
		console.error("SW5E MODULE | Starship sidebar partial update failed.", err);
		setStarshipPartialFailed(app, true);
		if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return "skipped";
		return runFullFallback();
	}
}

async function renderStarshipSidebarMovementFull(root, actor, app = null, ctx = null, signature = null, renderGen = null, runtime = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	suppressStockVehicleMovementSidebarForStarship(root, actor, app);
	ensureStarshipMovementConfigBlocked(root, app, actor);

	const speedGroup = findStarshipSidebarPillsGroup(shell, "Speed");
	const sizeGroup = findStarshipSidebarPillsGroup(shell, "Size");
	const insertParent = speedGroup?.parentElement ?? sizeGroup?.parentElement;
	if ( !insertParent ) return;

	const resolvedCtx = ctx ?? buildStarshipSidebarMovementContext(actor, app, { runtime });
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-movement.hbs"),
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;

	shell.querySelectorAll(".sw5e-starship-sidebar-movement").forEach(node => node.remove());
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const movementBlock = mount.firstElementChild;
	if ( !(movementBlock instanceof HTMLElement) ) return;
	markStarshipSectionElement(movementBlock, STARSHIP_SECTION.SIDEBAR_MOVEMENT);

	if ( sizeGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, sizeGroup);
	else if ( speedGroup?.parentElement === insertParent ) insertParent.insertBefore(movementBlock, speedGroup);
	else insertParent.prepend(movementBlock);

	bindStarshipSidebarMovementConfig(movementBlock, actor, app);
	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_MOVEMENT, signature);
}

export async function renderStarshipSidebarMovement(root, actor, app = null, { runtime, renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		runtime,
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_MOVEMENT],
		allowPartial
	});
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
		value,
		ariaLabel: `${label} ${value}`,
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

async function renderStarshipSidebarDamageReductionFull(root, actor, app = null, ctx = null, signature = null, renderGen = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	const resolvedCtx = ctx ?? buildStarshipSidebarDamageReductionContext(actor, app);
	if ( !resolvedCtx.sheetEditMode && !resolvedCtx.showInPlay ) {
		shell.querySelectorAll(".sw5e-starship-sidebar-damage-reduction").forEach(node => node.remove());
		if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION, signature);
		return;
	}

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
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;
	shell.querySelectorAll(".sw5e-starship-sidebar-damage-reduction").forEach(node => node.remove());
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const drBlock = mount.firstElementChild;
	if ( !(drBlock instanceof HTMLElement) ) return;
	markStarshipSectionElement(drBlock, STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION);

	if ( insertBefore?.parentElement === insertParent ) insertParent.insertBefore(drBlock, insertBefore);
	else insertParent.append(drBlock);

	bindStarshipSidebarDamageReduction(drBlock, actor, app);
	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION, signature);
}

export async function renderStarshipSidebarDamageReduction(root, actor, app = null, { renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_DAMAGE_REDUCTION],
		allowPartial
	});
}

/**
 * Display-only Max Fires per Round sidebar context (Bug 8).
 * Live-derived from prepared Strength mod + RAW size multipliers; never persisted.
 * @param {object|null|undefined} actor
 * @returns {{ show: boolean, label: string, value: number|null, ariaLabel: string }}
 */
export function buildStarshipSidebarMaxFiresContext(actor) {
	const label = localizeOrFallback("SW5E.StarshipSheet.MaxFiresPerRound", "Max Fires/Round");
	return buildStarshipMaxFiresDisplayContext(actor, { label });
}

function findStarshipSidebarResistancesInsertBefore(shell) {
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
	return findStarshipSidebarPillsGroup(shell, resistancesLabel)
		?? findStarshipSidebarPillsGroup(shell, "Resistances")
		?? findStarshipSidebarPillsGroup(shell, immunitiesLabel)
		?? findStarshipSidebarPillsGroup(shell, "Immunities")
		?? shell.querySelector(
			".sheet-sidebar .pills-group, [data-application-part='sidebar'] .pills-group, .sidebar .pills-group"
		);
}

async function renderStarshipSidebarMaxFiresFull(root, actor, app = null, ctx = null, signature = null, renderGen = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	const resolvedCtx = ctx ?? buildStarshipSidebarMaxFiresContext(actor);
	if ( !resolvedCtx.show ) {
		shell.querySelectorAll(".sw5e-starship-sidebar-max-fires").forEach(node => node.remove());
		if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_MAX_FIRES, signature);
		return;
	}

	const drBlock = shell.querySelector(".sw5e-starship-sidebar-damage-reduction");
	const insertBefore = drBlock?.nextSibling
		? null
		: findStarshipSidebarResistancesInsertBefore(shell);
	const insertParent = drBlock?.parentElement
		?? insertBefore?.parentElement
		?? getStarshipSidebarAside(shell);
	if ( !insertParent ) return;

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-max-fires.hbs"),
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;
	shell.querySelectorAll(".sw5e-starship-sidebar-max-fires").forEach(node => node.remove());
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const maxFiresBlock = mount.firstElementChild;
	if ( !(maxFiresBlock instanceof HTMLElement) ) return;
	markStarshipSectionElement(maxFiresBlock, STARSHIP_SECTION.SIDEBAR_MAX_FIRES);

	if ( drBlock?.parentElement === insertParent ) {
		drBlock.after(maxFiresBlock);
	} else if ( insertBefore?.parentElement === insertParent ) {
		insertParent.insertBefore(maxFiresBlock, insertBefore);
	} else {
		insertParent.append(maxFiresBlock);
	}

	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_MAX_FIRES, signature);
}

export async function renderStarshipSidebarMaxFires(root, actor, app = null, { renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_MAX_FIRES],
		allowPartial
	});
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

async function renderStarshipSidebarVitalsFull(root, actor, app = null, ctx = null, signature = null, renderGen = null) {
	const shell = getStarshipSidebarShell(root, app);
	const mountPoint = getStarshipSidebarVitalsMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const resolvedCtx = ctx ?? await buildStarshipSidebarVitalsRenderContext(actor, app);
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-vitals.hbs"),
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;
	shell?.querySelectorAll(".sw5e-starship-sidebar-vitals").forEach(node => node.remove());

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-vitals";
	wrapper.innerHTML = rendered;
	markStarshipSectionElement(wrapper, STARSHIP_SECTION.SIDEBAR_VITALS);

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
	bindStarshipVitalsMeterControls(root, actor, app);
	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_VITALS, signature);
}

export async function renderStarshipSidebarVitals(root, actor, app = null, { renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_VITALS],
		allowPartial
	});
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

async function renderStarshipSidebarSystemDamageFull(root, actor, app = null, ctx = null, signature = null, renderGen = null) {
	const shell = getStarshipSidebarShell(root, app);
	const mountPoint = getStarshipSystemDamageMountPoint(root, app);
	if ( !mountPoint?.reference ) return;

	const resolvedCtx = ctx ?? buildSystemDamageSidebarContext(actor, {
		editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
	});
	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-system-damage.hbs"),
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;
	shell?.querySelectorAll(".sw5e-starship-sidebar-system-damage").forEach(node => node.remove());

	const wrapper = document.createElement("section");
	wrapper.className = "sw5e-starship-sidebar-system-damage";
	if ( resolvedCtx.catastrophic ) wrapper.classList.add("sw5e-starship-sidebar-system-damage--catastrophic");
	wrapper.innerHTML = rendered;
	markStarshipSectionElement(wrapper, STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE);

	mountPoint.reference.insertAdjacentElement("afterend", wrapper);
	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE, signature);
}

export async function renderStarshipSidebarSystemDamage(root, actor, app = null, { renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_SYSTEM_DAMAGE],
		allowPartial
	});
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

async function renderStarshipSidebarDestructionSavesFull(root, actor, app = null, ctx = null, signature = null, renderGen = null) {
	const shell = getStarshipSidebarShell(root, app);
	if ( !(shell instanceof HTMLElement) ) return;

	const mountPoint = getStarshipDestructionTrayMountPoint(root, app);
	if ( !mountPoint?.parent || !(mountPoint.reference instanceof HTMLElement) ) return;

	const resolvedCtx = ctx ?? buildDestructionSaveSidebarContext(actor, {
		open: app?._sw5eDestructionTrayOpen === true,
		editMode: Boolean(isStarshipSheetEditMode(app) && app?.isEditable !== false),
		editable: app?.isEditable !== false && canCurrentUserUpdateStarshipActor(actor)
	});

	const rendered = await foundry.applications.handlebars.renderTemplate(
		getModulePath("templates/starship-sidebar-destruction-saves.hbs"),
		resolvedCtx
	);
	if ( renderGen != null && !isStarshipSheetRenderCurrent(app, renderGen) ) return;
	shell.querySelectorAll(".sw5e-starship-destruction-tray").forEach(node => node.remove());
	const mount = document.createElement("div");
	mount.innerHTML = rendered.trim();
	const tray = mount.firstElementChild;
	if ( !(tray instanceof HTMLElement) ) return;
	markStarshipSectionElement(tray, STARSHIP_SECTION.SIDEBAR_DESTRUCTION);

	mountPoint.reference.insertAdjacentElement(mountPoint.insertAfter ? "afterend" : "beforebegin", tray);

	syncDestructionTrayControlState(app, root);
	if ( signature ) setStarshipSectionSignature(app, STARSHIP_SECTION.SIDEBAR_DESTRUCTION, signature);
}

export async function renderStarshipSidebarDestructionSaves(root, actor, app = null, { renderGen, allowPartial } = {}) {
	return renderStarshipSidebarSections(root, actor, app, {
		renderGen,
		surfaces: [STARSHIP_SECTION.SIDEBAR_DESTRUCTION],
		allowPartial
	});
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




