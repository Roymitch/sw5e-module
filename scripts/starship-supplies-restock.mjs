/**
 * Phase 3B / Bug 12 — Slice 3B-5 shared Ship’s Stores Restock.
 *
 * Dual Fuel+Food DialogV2 (room defaults), independent costs, one atomic batch-mirror
 * update, one Restock chat. Reuses replenish add/cost math; does not post Fuel-only Refuel chat.
 */

import { isLegacyStarshipActor } from "./augmentations.mjs";
import { getModulePath, localizeOrFallback as localizeSimple } from "./module-support.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import {
	normalizeStarshipNonNegativeInt,
	resolveStarshipReplenishAdd,
	resolveStarshipReplenishRoom,
	calculateStarshipReplenishDisplayCost,
	prepareStarshipReplenishClampWarning
} from "./starship-replenish-math.mjs";
import {
	localizeStarshipReplenishCostModeLabel,
	resolveActorStarshipReplenishCostMode
} from "./starship-replenish-cost-mode.mjs";
import { readStarshipFoodResourceSnapshot } from "./starship-food.mjs";
import { escapeHtml } from "./starship-sheet-html.mjs";
import {
	buildStarshipSuppliesValueUpdate,
	getStarshipSuppliesDialogForm
} from "./starship-supplies-consume.mjs";
import {
	localizeStarshipSupplies,
	parseStarshipSuppliesRequestedQuantity
} from "./starship-supplies-quantity.mjs";
import { formatStarshipWholeNumber } from "./starship-number-format.mjs";

export const STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD = "restockFuel";
export const STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD = "restockFood";
export const STARSHIP_SUPPLIES_RESTOCK_CHAT_TEMPLATE = "templates/chat/starship-supplies-restock.hbs";

/**
 * Format a display cost. Unsafe products are not shown as exact values.
 * @param {{displayCost: number, safeInteger: boolean, applied: number}} costInfo
 * @returns {{text: string, trustworthy: boolean, displayCost: number, safeInteger: boolean}}
 */
export function formatStarshipSuppliesRestockCostDisplay(costInfo) {
	const applied = Number(costInfo?.applied) || 0;
	if ( applied <= 0 ) {
		return {
			text: localizeSimple("SW5E.StarshipSheet.RefuelCostNone", "—"),
			trustworthy: true,
			displayCost: 0,
			safeInteger: true
		};
	}
	if ( costInfo?.safeInteger === false ) {
		return {
			text: localizeSimple(
				"SW5E.StarshipSheet.RefuelCostUnavailable",
				"Unavailable (too large to display exactly)"
			),
			trustworthy: false,
			displayCost: Number(costInfo.displayCost),
			safeInteger: false
		};
	}
	const n = Number(costInfo.displayCost);
	if ( !Number.isFinite(n) ) {
		return {
			text: localizeSimple("SW5E.StarshipSheet.RefuelCostNone", "—"),
			trustworthy: true,
			displayCost: 0,
			safeInteger: true
		};
	}
	return {
		text: formatStarshipWholeNumber(n, { safeInteger: Number.isSafeInteger(n) }),
		trustworthy: Number.isSafeInteger(n),
		displayCost: n,
		safeInteger: Number.isSafeInteger(n)
	};
}

/**
 * @param {object} ctx
 * @returns {string}
 */
export function buildStarshipSuppliesRestockDialogContent(ctx={}) {
	const fuelCurrent = normalizeStarshipNonNegativeInt(ctx.fuelCurrent) ?? 0;
	const fuelCap = normalizeStarshipNonNegativeInt(ctx.fuelCap) ?? 0;
	const fuelRoom = normalizeStarshipNonNegativeInt(ctx.fuelRoom) ?? 0;
	const foodCurrent = normalizeStarshipNonNegativeInt(ctx.foodCurrent) ?? 0;
	const foodCap = normalizeStarshipNonNegativeInt(ctx.foodCap) ?? 0;
	const foodRoom = normalizeStarshipNonNegativeInt(ctx.foodRoom) ?? 0;
	const fuelDefault = fuelRoom > 0 ? fuelRoom : 0;
	const foodDefault = foodRoom > 0 ? foodRoom : 0;
	const fuelDisabled = fuelRoom <= 0;
	const foodDisabled = foodRoom <= 0;
	const fuelLabel = escapeHtml(localizeSimple("SW5E.Fuel", "Fuel"));
	const foodLabel = escapeHtml(localizeSimple("SW5E.Food", "Food"));
	const fuelStock = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesRestockFuelStock",
		"Fuel: {current} / {capacity} (room {room})",
		{
			current: formatStarshipWholeNumber(fuelCurrent),
			capacity: formatStarshipWholeNumber(fuelCap),
			room: formatStarshipWholeNumber(fuelRoom)
		}
	));
	const foodStock = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesRestockFoodStock",
		"Food: {current} / {capacity} (room {room})",
		{
			current: formatStarshipWholeNumber(foodCurrent),
			capacity: formatStarshipWholeNumber(foodCap),
			room: formatStarshipWholeNumber(foodRoom)
		}
	));
	const fuelMode = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesRestockModeLabel",
		"Cost mode: {mode}",
		{ mode: ctx.fuelModeLabel ?? "" }
	));
	const foodMode = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesRestockModeLabel",
		"Cost mode: {mode}",
		{ mode: ctx.foodModeLabel ?? "" }
	));
	const costLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.SuppliesRestockCostLabel",
		"Replenishment cost"
	));
	const totalLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.SuppliesRestockTotalLabel",
		"Total cost"
	));
	const fuelDisabledAttr = fuelDisabled ? " disabled" : "";
	const foodDisabledAttr = foodDisabled ? " disabled" : "";
	return `
		<div class="form-group sw5e-supplies-restock-fuel">
			<label for="sw5e-supplies-restock-fuel">${fuelLabel}</label>
			<p class="notes">${fuelStock}</p>
			<input id="sw5e-supplies-restock-fuel" name="${STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD}" type="number" min="0" step="1" value="${fuelDefault}"${fuelDisabledAttr} />
			<p class="notes">${fuelMode}</p>
			<label>${costLabel}</label>
			<p class="sw5e-supplies-restock-fuel-cost" data-sw5e-supplies-restock-fuel-cost>${escapeHtml(String(ctx.fuelCostText ?? "—"))}</p>
		</div>
		<div class="form-group sw5e-supplies-restock-food">
			<label for="sw5e-supplies-restock-food">${foodLabel}</label>
			<p class="notes">${foodStock}</p>
			<input id="sw5e-supplies-restock-food" name="${STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD}" type="number" min="0" step="1" value="${foodDefault}"${foodDisabledAttr} />
			<p class="notes">${foodMode}</p>
			<label>${costLabel}</label>
			<p class="sw5e-supplies-restock-food-cost" data-sw5e-supplies-restock-food-cost>${escapeHtml(String(ctx.foodCostText ?? "—"))}</p>
		</div>
		<div class="form-group">
			<label>${totalLabel}</label>
			<p class="sw5e-supplies-restock-total-cost" data-sw5e-supplies-restock-total-cost>${escapeHtml(String(ctx.totalCostText ?? "—"))}</p>
		</div>
	`;
}

/**
 * @param {HTMLFormElement|null|undefined} form
 * @returns {{fuel: number, food: number}|null}
 */
export function readStarshipSuppliesRestockFromForm(form) {
	if ( !form ) return null;
	const fuelField = form.querySelector?.(`[name="${STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD}"]`);
	const foodField = form.querySelector?.(`[name="${STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD}"]`);
	const fuelRaw = form.elements?.[STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD]?.value ?? fuelField?.value;
	const foodRaw = form.elements?.[STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD]?.value ?? foodField?.value;
	const fuelParsed = fuelField?.disabled
		? { ok: true, value: 0 }
		: parseStarshipSuppliesRequestedQuantity(fuelRaw);
	const foodParsed = foodField?.disabled
		? { ok: true, value: 0 }
		: parseStarshipSuppliesRequestedQuantity(foodRaw);
	if ( !fuelParsed.ok || !foodParsed.ok ) return null;
	return { fuel: fuelParsed.value, food: foodParsed.value };
}

export function starshipSuppliesRestockDialogCallback(_event, button, dialog) {
	return readStarshipSuppliesRestockFromForm(getStarshipSuppliesDialogForm(button, dialog));
}

export function coerceStarshipSuppliesRestockDialogResult(result) {
	if ( !result || typeof result !== "object" ) return null;
	const fuel = parseStarshipSuppliesRequestedQuantity(result.fuel);
	const food = parseStarshipSuppliesRequestedQuantity(result.food);
	if ( !fuel.ok || !food.ok ) return null;
	return { fuel: fuel.value, food: food.value };
}

/**
 * @param {object} snap
 * @param {number} requestedFuel
 * @param {number} requestedFood
 */
export function resolveStarshipSuppliesRestock(snap, requestedFuel, requestedFood) {
	const fuelReq = normalizeStarshipNonNegativeInt(requestedFuel) ?? 0;
	const foodReq = normalizeStarshipNonNegativeInt(requestedFood) ?? 0;
	const fuelResolved = fuelReq > 0
		? resolveStarshipReplenishAdd(fuelReq, snap.fuelCurrent, snap.fuelCap)
		: {
			requested: 0,
			current: snap.fuelCurrent,
			capacity: snap.fuelCap,
			room: snap.fuelRoom,
			applied: 0,
			newValue: snap.fuelCurrent,
			overRequest: false,
			shouldUpdate: false
		};
	const foodResolved = foodReq > 0
		? resolveStarshipReplenishAdd(foodReq, snap.foodCurrent, snap.foodCap)
		: {
			requested: 0,
			current: snap.foodCurrent,
			capacity: snap.foodCap,
			room: snap.foodRoom,
			applied: 0,
			newValue: snap.foodCurrent,
			overRequest: false,
			shouldUpdate: false
		};
	if ( fuelReq > fuelResolved.applied ) fuelResolved.overRequest = true;
	if ( foodReq > foodResolved.applied ) foodResolved.overRequest = true;

	const fuelCostInfo = calculateStarshipReplenishDisplayCost(
		snap.fuelMode,
		snap.fuelConfiguredCost,
		fuelResolved.applied
	);
	const foodCostInfo = calculateStarshipReplenishDisplayCost(
		snap.foodMode,
		snap.foodConfiguredCost,
		foodResolved.applied
	);
	const fuelCostDisplay = formatStarshipSuppliesRestockCostDisplay(fuelCostInfo);
	const foodCostDisplay = formatStarshipSuppliesRestockCostDisplay(foodCostInfo);
	const bothSafe = fuelCostDisplay.safeInteger && foodCostDisplay.safeInteger
		&& Number.isSafeInteger(fuelCostDisplay.displayCost + foodCostDisplay.displayCost);
	const combined = fuelCostDisplay.displayCost + foodCostDisplay.displayCost;
	return {
		fuel: { ...fuelResolved, requested: fuelReq, costDisplay: fuelCostDisplay, costInfo: fuelCostInfo },
		food: { ...foodResolved, requested: foodReq, costDisplay: foodCostDisplay, costInfo: foodCostInfo },
		shouldUpdate: fuelResolved.shouldUpdate || foodResolved.shouldUpdate,
		combinedTotal: combined,
		combinedSafe: bothSafe,
		combinedText: bothSafe
			? formatStarshipWholeNumber(combined)
			: localizeSimple("SW5E.StarshipSheet.RefuelChatCostUnavailable", "Unavailable")
	};
}

export function notifyStarshipSuppliesRestockOverRequest(resolved={}) {
	const parts = [];
	if ( resolved.fuel?.overRequest && resolved.fuel.requested > 0 ) {
		const data = prepareStarshipReplenishClampWarning(
			"restock",
			resolved.fuel.requested,
			resolved.fuel.applied
		);
		parts.push(localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockFuelOverWarn",
			"Fuel: requested {requested}, applied {applied}.",
			{ requested: data.requested, applied: data.applied }
		));
	}
	if ( resolved.food?.overRequest && resolved.food.requested > 0 ) {
		const data = prepareStarshipReplenishClampWarning(
			"restock",
			resolved.food.requested,
			resolved.food.applied
		);
		parts.push(localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockFoodOverWarn",
			"Food: requested {requested}, applied {applied}.",
			{ requested: data.requested, applied: data.applied }
		));
	}
	if ( !parts.length ) return;
	ui.notifications?.warn?.(parts.join(" "));
}

/**
 * Live cost preview binding for Restock dialog.
 */
export function bindStarshipSuppliesRestockCostPreview(dialog, snap) {
	const root = dialog?.form
		?? dialog?.element?.querySelector?.("form")
		?? dialog?.element
		?? dialog;
	if ( !root?.querySelector ) return;
	const fuelInput = root.querySelector(`[name="${STARSHIP_SUPPLIES_RESTOCK_FUEL_FIELD}"]`);
	const foodInput = root.querySelector(`[name="${STARSHIP_SUPPLIES_RESTOCK_FOOD_FIELD}"]`);
	const fuelCostEl = root.querySelector("[data-sw5e-supplies-restock-fuel-cost]");
	const foodCostEl = root.querySelector("[data-sw5e-supplies-restock-food-cost]");
	const totalEl = root.querySelector("[data-sw5e-supplies-restock-total-cost]");
	if ( !fuelInput || !foodInput ) return;

	const refresh = () => {
		const fuelParsed = fuelInput.disabled
			? { ok: true, value: 0 }
			: parseStarshipSuppliesRequestedQuantity(fuelInput.value);
		const foodParsed = foodInput.disabled
			? { ok: true, value: 0 }
			: parseStarshipSuppliesRequestedQuantity(foodInput.value);
		const fuelQty = fuelParsed.ok ? fuelParsed.value : 0;
		const foodQty = foodParsed.ok ? foodParsed.value : 0;
		const preview = resolveStarshipSuppliesRestock(snap, fuelQty, foodQty);
		if ( fuelCostEl ) fuelCostEl.textContent = preview.fuel.costDisplay.text;
		if ( foodCostEl ) foodCostEl.textContent = preview.food.costDisplay.text;
		if ( totalEl ) totalEl.textContent = preview.combinedText;
	};
	fuelInput.addEventListener("input", refresh);
	fuelInput.addEventListener("change", refresh);
	foodInput.addEventListener("input", refresh);
	foodInput.addEventListener("change", refresh);
	refresh();
}

/**
 * @param {object} input
 * @returns {object|null}
 */
export function buildStarshipSuppliesRestockChatContext(input={}) {
	const fuelApplied = normalizeStarshipNonNegativeInt(input.fuelApplied) ?? 0;
	const foodApplied = normalizeStarshipNonNegativeInt(input.foodApplied) ?? 0;
	if ( fuelApplied <= 0 && foodApplied <= 0 ) return null;
	const name = String(input.actorName ?? "");
	const unavailable = localizeSimple("SW5E.StarshipSheet.RefuelChatCostUnavailable", "Unavailable");
	const fuelModeLabel = localizeStarshipReplenishCostModeLabel(input.fuelMode);
	const foodModeLabel = localizeStarshipReplenishCostModeLabel(input.foodMode);
	const fuelCostText = input.fuelCostTrustworthy === false ? unavailable : String(input.fuelCostText ?? "—");
	const foodCostText = input.foodCostTrustworthy === false ? unavailable : String(input.foodCostText ?? "—");
	const fuelConfigured = Number.isSafeInteger(Number(input.fuelConfiguredCost))
		? formatStarshipWholeNumber(input.fuelConfiguredCost)
		: unavailable;
	const foodConfigured = Number.isSafeInteger(Number(input.foodConfiguredCost))
		? formatStarshipWholeNumber(input.foodConfiguredCost)
		: unavailable;
	const showTotal = input.combinedSafe === true;
	return {
		name,
		heading: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatHeading",
			"{name} restocked Ship’s Stores",
			{ name }
		),
		showFuel: fuelApplied > 0,
		showFood: foodApplied > 0,
		showTotal,
		fuelLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatFuelLine",
			"Fuel: {before}/{capacity} → {after}/{capacity}",
			{
				before: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.fuelBefore) ?? 0),
				after: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.fuelAfter) ?? 0),
				capacity: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.fuelCap) ?? 0)
			}
		),
		fuelCostLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatCostLine",
			"Cost: {cost} ({configuredCost} {mode})",
			{ cost: fuelCostText, configuredCost: fuelConfigured, mode: fuelModeLabel }
		),
		foodLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatFoodLine",
			"Food: {before}/{capacity} → {after}/{capacity}",
			{
				before: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.foodBefore) ?? 0),
				after: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.foodAfter) ?? 0),
				capacity: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(input.foodCap) ?? 0)
			}
		),
		foodCostLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatCostLine",
			"Cost: {cost} ({configuredCost} {mode})",
			{ cost: foodCostText, configuredCost: foodConfigured, mode: foodModeLabel }
		),
		totalLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesRestockChatTotalLine",
			"Total Cost: {total}",
			{
				total: showTotal
					? formatStarshipWholeNumber(input.combinedTotal ?? 0)
					: unavailable
			}
		),
		noCurrencyNote: localizeSimple(
			"SW5E.StarshipSheet.RefuelChatNoCurrencyNote",
			"Cost shown for reference. No currency was automatically deducted."
		)
	};
}

export function notifyStarshipSuppliesRestockChatPostFailed() {
	ui.notifications?.warn?.(localizeSimple(
		"SW5E.StarshipSheet.SuppliesRestockChatPostFailed",
		"Ship’s Stores were updated, but the Restock chat confirmation could not be posted."
	));
}

export async function postStarshipSuppliesRestockChatMessage(actor, payload) {
	if ( !isLegacyStarshipActor(actor) ) return { posted: false };
	if ( !payload || (!payload.showFuel && !payload.showFood) ) return { posted: false };
	try {
		const templatePath = getModulePath(STARSHIP_SUPPLIES_RESTOCK_CHAT_TEMPLATE);
		const render = globalThis.foundry?.applications?.handlebars?.renderTemplate;
		if ( typeof render !== "function" ) {
			throw new Error("foundry.applications.handlebars.renderTemplate is unavailable");
		}
		const content = await render(templatePath, payload);
		await ChatMessage.create({
			user: globalThis.game?.user?.id,
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: localizeSimple("SW5E.StarshipSheet.SuppliesRestockChatFlavor", "Restock"),
			content
		});
		return { posted: true };
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Supplies Restock chat failed.", err);
		notifyStarshipSuppliesRestockChatPostFailed();
		return { posted: false, error: err };
	}
}

/**
 * Snapshot for Restock dialog / resolve.
 * @param {Actor} actor
 */
export function readStarshipSuppliesRestockSnapshot(actor) {
	if ( !isLegacyStarshipActor(actor) ) return null;
	const legacyFuel = actor.system?.attributes?.fuel
		?? actor.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.fuel
		?? {};
	const foodSnap = readStarshipFoodResourceSnapshot(actor);
	const fuelCurrent = normalizeStarshipNonNegativeInt(legacyFuel.value) ?? 0;
	const fuelCap = normalizeStarshipNonNegativeInt(legacyFuel.fuelCap) ?? 0;
	const fuelRoomInfo = resolveStarshipReplenishRoom(fuelCurrent, fuelCap);
	const foodCurrent = foodSnap.value;
	const foodCap = foodSnap.capacity.effectiveCapacity;
	const foodRoomInfo = resolveStarshipReplenishRoom(foodCurrent, foodCap);
	const fuelMode = resolveActorStarshipReplenishCostMode(actor, "fuel");
	const foodMode = resolveActorStarshipReplenishCostMode(actor, "food");
	const fuelConfiguredCost = normalizeStarshipNonNegativeInt(legacyFuel.cost) ?? 0;
	const foodConfiguredCost = foodSnap.cost;
	return {
		fuelCurrent,
		fuelCap,
		fuelRoom: fuelRoomInfo.room,
		foodCurrent,
		foodCap,
		foodRoom: foodRoomInfo.room,
		fuelMode,
		foodMode,
		fuelConfiguredCost,
		foodConfiguredCost,
		fuelModeLabel: localizeStarshipReplenishCostModeLabel(fuelMode),
		foodModeLabel: localizeStarshipReplenishCostModeLabel(foodMode)
	};
}

/**
 * @param {Actor} actor
 * @returns {Promise<{fuel: number, food: number}|null>}
 */
export async function promptStarshipSuppliesRestock(actor) {
	const snap = readStarshipSuppliesRestockSnapshot(actor);
	if ( !snap ) return null;
	if ( snap.fuelRoom <= 0 && snap.foodRoom <= 0 ) {
		ui.notifications?.warn?.(localizeSimple(
			"SW5E.StarshipSheet.SuppliesRestockFullWarning",
			"Ship’s Stores are already full."
		));
		return null;
	}
	const initial = resolveStarshipSuppliesRestock(
		snap,
		snap.fuelRoom > 0 ? snap.fuelRoom : 0,
		snap.foodRoom > 0 ? snap.foodRoom : 0
	);
	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple(
				"SW5E.StarshipSheet.SuppliesRestockTitle",
				"Restock Ship’s Stores"
			)
		},
		content: buildStarshipSuppliesRestockDialogContent({
			...snap,
			fuelCostText: initial.fuel.costDisplay.text,
			foodCostText: initial.food.costDisplay.text,
			totalCostText: initial.combinedText
		}),
		position: { width: 420 },
		buttons: [
			{
				action: "restock",
				label: localizeSimple("SW5E.StarshipSheet.SuppliesRestockConfirm", "Restock"),
				icon: "fas fa-check",
				default: true,
				callback: starshipSuppliesRestockDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		],
		render: (...args) => {
			const dialog = args.find(a => a && (a.element || a.form)) ?? args[1] ?? args[0];
			bindStarshipSuppliesRestockCostPreview(dialog, snap);
		}
	});
	return coerceStarshipSuppliesRestockDialogResult(result);
}

/**
 * @param {Actor} actor
 * @returns {Promise<{updated: boolean, chatPosted?: boolean}>}
 */
export async function runStarshipSuppliesRestock(actor) {
	if ( !isLegacyStarshipActor(actor) ) return { updated: false };
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return { updated: false };
	}
	const requested = await promptStarshipSuppliesRestock(actor);
	if ( requested === null ) return { updated: false };

	const snap = readStarshipSuppliesRestockSnapshot(actor);
	if ( !snap ) return { updated: false };
	const resolved = resolveStarshipSuppliesRestock(snap, requested.fuel, requested.food);
	if ( !resolved.shouldUpdate ) return { updated: false };

	notifyStarshipSuppliesRestockOverRequest(resolved);

	const update = buildStarshipSuppliesValueUpdate({
		fuelApplied: resolved.fuel.applied,
		fuelNew: resolved.fuel.newValue,
		foodApplied: resolved.food.applied,
		foodNew: resolved.food.newValue
	});
	if ( !update ) return { updated: false };

	try {
		await actor.update(update);
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Supplies Restock update failed.", err);
		ui.notifications?.error?.(localizeSimple(
			"SW5E.StarshipSheet.SuppliesRestockSaveFailed",
			"Could not update Ship’s Stores."
		));
		return { updated: false };
	}

	const chat = buildStarshipSuppliesRestockChatContext({
		actorName: actor.name,
		fuelApplied: resolved.fuel.applied,
		foodApplied: resolved.food.applied,
		fuelBefore: snap.fuelCurrent,
		fuelAfter: resolved.fuel.newValue,
		fuelCap: snap.fuelCap,
		foodBefore: snap.foodCurrent,
		foodAfter: resolved.food.newValue,
		foodCap: snap.foodCap,
		fuelMode: snap.fuelMode,
		foodMode: snap.foodMode,
		fuelConfiguredCost: snap.fuelConfiguredCost,
		foodConfiguredCost: snap.foodConfiguredCost,
		fuelCostText: resolved.fuel.costDisplay.text,
		foodCostText: resolved.food.costDisplay.text,
		fuelCostTrustworthy: resolved.fuel.costDisplay.trustworthy,
		foodCostTrustworthy: resolved.food.costDisplay.trustworthy,
		combinedTotal: resolved.combinedTotal,
		combinedSafe: resolved.combinedSafe
	});
	let chatPosted = false;
	if ( chat ) {
		const posted = await postStarshipSuppliesRestockChatMessage(actor, chat);
		chatPosted = posted.posted === true;
	}
	return { updated: true, chatPosted };
}
