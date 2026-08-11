/**
 * Phase 3B / Bug 12 — Slice 3B-3 partial Fuel Refuel dialog + cost display.
 *
 * Sibling to starship-fuel-burn.mjs — does not change Burn behavior.
 * DialogV2.wait contract (Foundry v13): resolve amount from button.callback via
 * button.form; config.submit return is NOT the wait result.
 *
 * Per Unit live preview: updates when the quantity input changes (dialog render hook).
 * Final transaction cost always uses applied (post-clamp) quantity.
 */

import { isLegacyStarshipActor } from "./augmentations.mjs";
import { getModulePath, localizeOrFallback as localizeSimple } from "./module-support.mjs";
import {
	normalizeStarshipNonNegativeInt,
	normalizeStarshipPositiveQuantity,
	resolveStarshipReplenishAdd,
	resolveStarshipReplenishRoom,
	calculateStarshipReplenishDisplayCost,
	prepareStarshipReplenishClampWarning,
	resolveStarshipReplenishCostMode
} from "./starship-replenish-math.mjs";
import {
	localizeStarshipReplenishCostModeLabel,
	resolveActorStarshipReplenishCostMode
} from "./starship-replenish-cost-mode.mjs";
import { escapeHtml } from "./starship-sheet-html.mjs";

const REFUEL_AMOUNT_FIELD = "refueled";
export const STARSHIP_FUEL_REFUEL_CHAT_TEMPLATE = "templates/chat/starship-fuel-refuel.hbs";

/**
 * Localize with `{name}` interpolation when format is available.
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, string|number>} [data]
 * @returns {string}
 */
export function localizeStarshipFuelRefuel(key, fallback, data={}) {
	const formatted = globalThis.game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = globalThis.game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) {
		return Object.entries(data).reduce(
			(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
			localized
		);
	}
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

/**
 * Format a display cost for the dialog. Unsafe products are not shown as exact values.
 * @param {{displayCost: number, safeInteger: boolean, applied: number}} costInfo
 * @returns {{text: string, trustworthy: boolean}}
 */
export function formatStarshipFuelRefuelCostDisplay(costInfo) {
	const applied = Number(costInfo?.applied) || 0;
	if ( applied <= 0 ) {
		return {
			text: localizeSimple("SW5E.StarshipSheet.RefuelCostNone", "—"),
			trustworthy: true
		};
	}
	if ( costInfo?.safeInteger === false ) {
		return {
			text: localizeSimple(
				"SW5E.StarshipSheet.RefuelCostUnavailable",
				"Unavailable (too large to display exactly)"
			),
			trustworthy: false
		};
	}
	const n = Number(costInfo.displayCost);
	return {
		text: Number.isFinite(n) ? String(n) : localizeSimple("SW5E.StarshipSheet.RefuelCostNone", "—"),
		trustworthy: true
	};
}

/**
 * Build Refuel dialog content (no nested form).
 * @param {{
 *   current: number,
 *   capacity: number,
 *   room: number,
 *   defaultQuantity: number,
 *   modeLabel: string,
 *   costText: string
 * }} ctx
 * @returns {string}
 */
export function buildStarshipFuelRefuelDialogContent(ctx) {
	const amountLabel = localizeSimple(
		"SW5E.StarshipSheet.RefuelAmountLabel",
		"Units to add"
	);
	const stockLabel = localizeStarshipFuelRefuel(
		"SW5E.StarshipSheet.RefuelStockLabel",
		"Fuel: {current} / {capacity} (room {room})",
		{ current: ctx.current, capacity: ctx.capacity, room: ctx.room }
	);
	const modeLabel = localizeStarshipFuelRefuel(
		"SW5E.StarshipSheet.RefuelModeLabel",
		"Cost mode: {mode}",
		{ mode: ctx.modeLabel }
	);
	const costLabel = localizeSimple(
		"SW5E.StarshipSheet.RefuelCostLabel",
		"Replenishment cost"
	);
	return `<div class="form-group">
		<p class="notes">${escapeHtml(stockLabel)}</p>
		<label for="sw5e-fuel-refuel-amount">${escapeHtml(amountLabel)}</label>
		<input id="sw5e-fuel-refuel-amount" name="${REFUEL_AMOUNT_FIELD}" type="number" min="1" step="1" value="${escapeHtml(String(ctx.defaultQuantity))}" />
	</div>
	<div class="form-group">
		<p class="notes">${escapeHtml(modeLabel)}</p>
		<label>${escapeHtml(costLabel)}</label>
		<div id="sw5e-fuel-refuel-cost" data-sw5e-refuel-cost>${escapeHtml(ctx.costText)}</div>
	</div>`;
}

/**
 * @param {HTMLButtonElement|null|undefined} button
 * @param {object|null|undefined} dialog
 * @returns {HTMLFormElement|null}
 */
export function getStarshipFuelRefuelDialogForm(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	if ( !el ) return null;
	const FormCtor = globalThis.HTMLFormElement;
	if ( FormCtor && el instanceof FormCtor ) return el;
	if ( el.tagName === "FORM" ) return el;
	return null;
}

/**
 * @param {HTMLFormElement|null|undefined} form
 * @returns {number|null}
 */
export function readStarshipFuelRefuelAmountFromForm(form) {
	if ( !form ) return null;
	const field = form.elements?.namedItem?.(REFUEL_AMOUNT_FIELD)
		?? form.querySelector?.(`[name='${REFUEL_AMOUNT_FIELD}']`);
	return normalizeStarshipPositiveQuantity(field?.value);
}

/**
 * DialogV2 Refuel callback — returns parsed positive quantity or null.
 * @param {Event} _event
 * @param {HTMLButtonElement} button
 * @param {object} dialog
 * @returns {number|null}
 */
export function starshipFuelRefuelDialogCallback(_event, button, dialog) {
	return readStarshipFuelRefuelAmountFromForm(getStarshipFuelRefuelDialogForm(button, dialog));
}

/**
 * @param {unknown} result
 * @returns {number|null}
 */
export function coerceStarshipFuelRefuelDialogResult(result) {
	return normalizeStarshipPositiveQuantity(result);
}

/**
 * Over-request soft warning text (requested vs applied).
 * @param {number} requested
 * @param {number} applied
 * @returns {string}
 */
export function formatStarshipFuelRefuelOverRequestWarning(requested, applied) {
	return localizeStarshipFuelRefuel(
		"SW5E.StarshipSheet.RefuelOverRequestWarning",
		"Requested {requested} fuel, but only {applied} could be added.",
		{ requested, applied }
	);
}

/**
 * Emit over-request soft warning when requested exceeds room.
 * @param {number} requested
 * @param {number} applied
 */
export function notifyStarshipFuelRefuelOverRequest(requested, applied) {
	const warn = prepareStarshipReplenishClampWarning("refuel", requested, applied);
	if ( !warn ) return;
	ui.notifications.warn(formatStarshipFuelRefuelOverRequestWarning(warn.requested, warn.applied));
}

/**
 * Wire Per Unit (and flat) cost preview updates on the quantity input.
 * @param {object} dialog
 * @param {{mode: string, configuredCost: number, room: number}} costCtx
 */
export function bindStarshipFuelRefuelCostPreview(dialog, costCtx) {
	const root = dialog?.element instanceof HTMLElement
		? dialog.element
		: dialog?.element?.[0] ?? dialog?.element?.querySelector?.("form")?.closest?.("*") ?? null;
	const input = root?.querySelector?.(`#sw5e-fuel-refuel-amount, [name='${REFUEL_AMOUNT_FIELD}']`);
	const costEl = root?.querySelector?.("[data-sw5e-refuel-cost]");
	if ( !(input instanceof HTMLInputElement) || !costEl ) return;

	const refresh = () => {
		const requested = normalizeStarshipPositiveQuantity(input.value);
		const previewQty = requested === null
			? 0
			: Math.min(requested, Math.max(0, Number(costCtx.room) || 0));
		const costInfo = calculateStarshipReplenishDisplayCost(
			costCtx.mode,
			costCtx.configuredCost,
			previewQty
		);
		costEl.textContent = formatStarshipFuelRefuelCostDisplay(costInfo).text;
	};
	input.addEventListener("input", refresh);
	input.addEventListener("change", refresh);
}

/**
 * Prompt for units to add. Default = room. Cancel/dismiss → null.
 * @param {{
 *   current: number,
 *   capacity: number,
 *   room: number,
 *   mode: string,
 *   configuredCost: number
 * }} options
 * @returns {Promise<number|null>}
 */
export async function promptStarshipFuelRefuelAmount(options) {
	const current = normalizeStarshipNonNegativeInt(options?.current) ?? 0;
	const capacity = normalizeStarshipNonNegativeInt(options?.capacity) ?? 0;
	const roomInfo = resolveStarshipReplenishRoom(current, capacity);
	const room = roomInfo.room;
	if ( room <= 0 ) return null;

	const mode = options?.mode ?? "perRestock";
	const configuredCost = normalizeStarshipNonNegativeInt(options?.configuredCost) ?? 0;
	const initialCost = calculateStarshipReplenishDisplayCost(mode, configuredCost, room);
	const costDisplay = formatStarshipFuelRefuelCostDisplay(initialCost);
	const content = buildStarshipFuelRefuelDialogContent({
		current: roomInfo.current,
		capacity: roomInfo.capacity,
		room,
		defaultQuantity: room,
		modeLabel: localizeStarshipReplenishCostModeLabel(mode),
		costText: costDisplay.text
	});

	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple("SW5E.StarshipSheet.RefuelDialogTitle", "Refuel")
		},
		content,
		position: { width: 380 },
		buttons: [
			{
				action: "refuel",
				label: localizeSimple("SW5E.Refuel", "Refuel"),
				icon: "fas fa-gas-pump",
				default: true,
				callback: starshipFuelRefuelDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		],
		render: (...args) => {
			const dialog = args.find(a => a && (a.element || a.form)) ?? args[1] ?? args[0];
			bindStarshipFuelRefuelCostPreview(dialog, { mode, configuredCost, room });
		}
	});

	return coerceStarshipFuelRefuelDialogResult(result);
}

/**
 * Resolve whether Refuel should open a dialog / write, using 3B-1 helpers.
 * @param {unknown} current
 * @param {unknown} capacity
 * @returns {{
 *   ok: boolean,
 *   reason: "no-cap"|"full"|"ready",
 *   current: number,
 *   capacity: number,
 *   room: number
 * }}
 */
export function evaluateStarshipFuelRefuelGate(current, capacity) {
	const roomInfo = resolveStarshipReplenishRoom(current, capacity);
	if ( roomInfo.capacity <= 0 ) {
		return { ok: false, reason: "no-cap", ...roomInfo };
	}
	if ( roomInfo.room <= 0 ) {
		return { ok: false, reason: "full", ...roomInfo };
	}
	return { ok: true, reason: "ready", ...roomInfo };
}

/**
 * Build the Actor update shape expected for Fuel value mirror persistence tests.
 * Does not call Actor.update — mirrors persistStarshipLegacyAttributePath fuel shape.
 * @param {number} newValue
 * @returns {Record<string, number>}
 */
export function buildStarshipFuelValueMirrorUpdate(newValue) {
	const value = normalizeStarshipNonNegativeInt(newValue) ?? 0;
	return {
		"system.attributes.fuel.value": value,
		"flags.sw5e.legacyStarshipActor.system.attributes.fuel.value": value
	};
}

/**
 * Run Refuel resolution for a requested quantity (pure).
 * @param {unknown} current
 * @param {unknown} capacity
 * @param {unknown} requested
 */
export function resolveStarshipFuelRefuel(current, capacity, requested) {
	return resolveStarshipReplenishAdd(requested, current, capacity);
}

/**
 * Read Fuel snapshot for Refuel from a Starship Actor (no writes).
 * @param {Actor} actor
 * @param {object} legacyFuel
 * @returns {{current: number, capacity: number, cost: number, mode: string}|null}
 */
export function readStarshipFuelRefuelSnapshot(actor, legacyFuel={}) {
	if ( !isLegacyStarshipActor(actor) ) return null;
	const current = normalizeStarshipNonNegativeInt(legacyFuel.value) ?? 0;
	const capacity = normalizeStarshipNonNegativeInt(legacyFuel.fuelCap) ?? 0;
	const cost = normalizeStarshipNonNegativeInt(legacyFuel.cost) ?? 0;
	const mode = resolveActorStarshipReplenishCostMode(actor, "fuel");
	return { current, capacity, cost, mode };
}

/**
 * Pure chat payload for a successful Refuel. No Actor writes / currency reads.
 * @param {{
 *   actorName?: string,
 *   applied: unknown,
 *   before: unknown,
 *   after: unknown,
 *   capacity: unknown,
 *   mode?: unknown,
 *   configuredCost?: unknown
 * }} input
 * @returns {object|null}
 */
export function buildStarshipFuelRefuelChatContext(input={}) {
	const applied = normalizeStarshipNonNegativeInt(input.applied) ?? 0;
	if ( applied <= 0 ) return null;
	const before = normalizeStarshipNonNegativeInt(input.before) ?? 0;
	const after = normalizeStarshipNonNegativeInt(input.after) ?? 0;
	const capacity = normalizeStarshipNonNegativeInt(input.capacity) ?? 0;
	const mode = resolveStarshipReplenishCostMode(input.mode);
	const configuredCost = normalizeStarshipNonNegativeInt(input.configuredCost) ?? 0;
	const costInfo = calculateStarshipReplenishDisplayCost(mode, configuredCost, applied);
	const costDisplay = formatStarshipFuelRefuelCostDisplay(costInfo);
	const modeLabel = localizeStarshipReplenishCostModeLabel(mode);
	const unavailableText = localizeSimple(
		"SW5E.StarshipSheet.RefuelChatCostUnavailable",
		"Unavailable"
	);
	// Chat Cost line uses a short unavailable label; dialog keeps the longer RefuelCostUnavailable text.
	const costText = costDisplay.trustworthy ? costDisplay.text : unavailableText;
	const configuredCostText = Number.isSafeInteger(configuredCost)
		? String(configuredCost)
		: unavailableText;
	return {
		name: String(input.actorName ?? ""),
		applied,
		before,
		after,
		capacity,
		mode,
		modeLabel,
		configuredCost,
		displayCost: costInfo.displayCost,
		safeInteger: costInfo.safeInteger,
		costText,
		costUnavailable: !costDisplay.trustworthy,
		heading: localizeStarshipFuelRefuel(
			"SW5E.StarshipSheet.RefuelChatHeading",
			"{name} refueled",
			{ name: String(input.actorName ?? "") }
		),
		fuelLine: localizeStarshipFuelRefuel(
			"SW5E.StarshipSheet.RefuelChatFuelLine",
			"Fuel: {before}/{capacity} → {after}/{capacity}",
			{ before, after, capacity }
		),
		costLine: localizeStarshipFuelRefuel(
			"SW5E.StarshipSheet.RefuelChatCostLine",
			"Cost: {cost} ({configuredCost} {mode})",
			{ cost: costText, configuredCost: configuredCostText, mode: modeLabel }
		),
		noCurrencyNote: localizeSimple(
			"SW5E.StarshipSheet.RefuelChatNoCurrencyNote",
			"Cost shown for reference. No currency was automatically deducted."
		)
	};
}

/**
 * Soft warn when chat fails after Fuel already persisted.
 */
export function notifyStarshipFuelRefuelChatPostFailed() {
	ui.notifications?.warn?.(localizeSimple(
		"SW5E.StarshipSheet.RefuelChatPostFailed",
		"Fuel was updated, but the Refuel chat confirmation could not be posted."
	));
}

/**
 * Post one public Refuel confirmation after successful Fuel persistence.
 * Chat failures do not roll back Fuel and must not look like Refuel failure.
 *
 * @param {Actor} actor
 * @param {object} payload — from buildStarshipFuelRefuelChatContext
 * @returns {Promise<{posted: boolean, error?: Error}>}
 */
export async function postStarshipFuelRefuelChatMessage(actor, payload) {
	if ( !isLegacyStarshipActor(actor) ) return { posted: false };
	if ( !payload || !(Number(payload.applied) > 0) ) return { posted: false };
	try {
		const templatePath = getModulePath(STARSHIP_FUEL_REFUEL_CHAT_TEMPLATE);
		// Foundry v13: use the namespaced Handlebars renderer only.
		// Do not access the deprecated global `renderTemplate` (removed in v15).
		const render = globalThis.foundry?.applications?.handlebars?.renderTemplate;
		if ( typeof render !== "function" ) {
			throw new Error("foundry.applications.handlebars.renderTemplate is unavailable");
		}
		const content = await render(templatePath, payload);
		const flavor = localizeStarshipFuelRefuel(
			"SW5E.StarshipSheet.RefuelChatFlavor",
			"Refuel",
			{ name: actor.name }
		);
		await ChatMessage.create({
			author: globalThis.game?.user?.id,
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor,
			content
		});
		return { posted: true };
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Refuel chat confirmation failed.", err);
		notifyStarshipFuelRefuelChatPostFailed();
		return { posted: false, error: err };
	}
}
