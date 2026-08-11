/**
 * Phase 3B / Bug 12 — Slice 3B-5 shared Ship’s Stores Consume.
 *
 * Dual Fuel+Food DialogV2 (defaults 0/0), independent clamps, one atomic batch-mirror
 * update, one Consume chat. Reuses replenish consume math; does not call Fuel Burn UI.
 */

import { isLegacyStarshipActor } from "./augmentations.mjs";
import { buildStarshipLegacyAttributeBatchMirrorUpdate } from "./starship-data.mjs";
import { getModulePath, localizeOrFallback as localizeSimple } from "./module-support.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import {
	normalizeStarshipNonNegativeInt,
	prepareStarshipReplenishClampWarning,
	resolveStarshipReplenishConsume
} from "./starship-replenish-math.mjs";
import { readStarshipFoodResourceSnapshot } from "./starship-food.mjs";
import { escapeHtml } from "./starship-sheet-html.mjs";
import {
	localizeStarshipSupplies,
	parseStarshipSuppliesRequestedQuantity
} from "./starship-supplies-quantity.mjs";
import { formatStarshipWholeNumber } from "./starship-number-format.mjs";

export const STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD = "consumeFuel";
export const STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD = "consumeFood";
export const STARSHIP_SUPPLIES_CONSUME_CHAT_TEMPLATE = "templates/chat/starship-supplies-consume.hbs";

/**
 * @param {HTMLButtonElement|null|undefined} button
 * @param {object|null|undefined} dialog
 * @returns {HTMLFormElement|null}
 */
export function getStarshipSuppliesDialogForm(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	if ( !el ) return null;
	const FormCtor = globalThis.HTMLFormElement;
	if ( FormCtor && el instanceof FormCtor ) return el;
	if ( el.tagName === "FORM" ) return el;
	return null;
}

/**
 * @param {{fuelCurrent?: number, foodCurrent?: number, fuelDisabled?: boolean, foodDisabled?: boolean}} ctx
 * @returns {string}
 */
export function buildStarshipSuppliesConsumeDialogContent(ctx={}) {
	const fuelCurrent = normalizeStarshipNonNegativeInt(ctx.fuelCurrent) ?? 0;
	const foodCurrent = normalizeStarshipNonNegativeInt(ctx.foodCurrent) ?? 0;
	const fuelDisabled = ctx.fuelDisabled === true || fuelCurrent <= 0;
	const foodDisabled = ctx.foodDisabled === true || foodCurrent <= 0;
	const fuelLabel = escapeHtml(localizeSimple("SW5E.Fuel", "Fuel"));
	const foodLabel = escapeHtml(localizeSimple("SW5E.Food", "Food"));
	const fuelStock = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesConsumeFuelStock",
		"Available: {current}",
		{ current: formatStarshipWholeNumber(fuelCurrent) }
	));
	const foodStock = escapeHtml(localizeStarshipSupplies(
		"SW5E.StarshipSheet.SuppliesConsumeFoodStock",
		"Available: {current}",
		{ current: formatStarshipWholeNumber(foodCurrent) }
	));
	const fuelDisabledAttr = fuelDisabled ? " disabled" : "";
	const foodDisabledAttr = foodDisabled ? " disabled" : "";
	return `
		<div class="form-group">
			<label for="sw5e-supplies-consume-fuel">${fuelLabel}</label>
			<p class="notes">${fuelStock}</p>
			<input id="sw5e-supplies-consume-fuel" name="${STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD}" type="number" min="0" step="1" value="0"${fuelDisabledAttr} />
		</div>
		<div class="form-group">
			<label for="sw5e-supplies-consume-food">${foodLabel}</label>
			<p class="notes">${foodStock}</p>
			<input id="sw5e-supplies-consume-food" name="${STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD}" type="number" min="0" step="1" value="0"${foodDisabledAttr} />
		</div>
	`;
}

/**
 * @param {HTMLFormElement|null|undefined} form
 * @returns {{fuel: number, food: number}|null}
 */
export function readStarshipSuppliesConsumeFromForm(form) {
	if ( !form ) return null;
	const fuelRaw = form.elements?.[STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD]?.value
		?? form.querySelector?.(`[name="${STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD}"]`)?.value;
	const foodRaw = form.elements?.[STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD]?.value
		?? form.querySelector?.(`[name="${STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD}"]`)?.value;
	const fuelField = form.querySelector?.(`[name="${STARSHIP_SUPPLIES_CONSUME_FUEL_FIELD}"]`);
	const foodField = form.querySelector?.(`[name="${STARSHIP_SUPPLIES_CONSUME_FOOD_FIELD}"]`);
	const fuelParsed = fuelField?.disabled
		? { ok: true, value: 0 }
		: parseStarshipSuppliesRequestedQuantity(fuelRaw);
	const foodParsed = foodField?.disabled
		? { ok: true, value: 0 }
		: parseStarshipSuppliesRequestedQuantity(foodRaw);
	if ( !fuelParsed.ok || !foodParsed.ok ) return null;
	return { fuel: fuelParsed.value, food: foodParsed.value };
}

/**
 * @param {Event} _event
 * @param {HTMLButtonElement} button
 * @param {object} dialog
 * @returns {{fuel: number, food: number}|null}
 */
export function starshipSuppliesConsumeDialogCallback(_event, button, dialog) {
	return readStarshipSuppliesConsumeFromForm(getStarshipSuppliesDialogForm(button, dialog));
}

/**
 * @param {unknown} result
 * @returns {{fuel: number, food: number}|null}
 */
export function coerceStarshipSuppliesConsumeDialogResult(result) {
	if ( !result || typeof result !== "object" ) return null;
	const fuel = parseStarshipSuppliesRequestedQuantity(result.fuel);
	const food = parseStarshipSuppliesRequestedQuantity(result.food);
	if ( !fuel.ok || !food.ok ) return null;
	return { fuel: fuel.value, food: food.value };
}

/**
 * @param {number} fuelCurrent
 * @param {number} foodCurrent
 * @param {number} requestedFuel
 * @param {number} requestedFood
 */
export function resolveStarshipSuppliesConsume(fuelCurrent, foodCurrent, requestedFuel, requestedFood) {
	const fuelReq = normalizeStarshipNonNegativeInt(requestedFuel) ?? 0;
	const foodReq = normalizeStarshipNonNegativeInt(requestedFood) ?? 0;
	const fuelResolved = fuelReq > 0
		? resolveStarshipReplenishConsume(fuelReq, fuelCurrent)
		: {
			requested: 0,
			current: normalizeStarshipNonNegativeInt(fuelCurrent) ?? 0,
			applied: 0,
			newValue: normalizeStarshipNonNegativeInt(fuelCurrent) ?? 0,
			overRequest: false,
			shouldUpdate: false
		};
	const foodResolved = foodReq > 0
		? resolveStarshipReplenishConsume(foodReq, foodCurrent)
		: {
			requested: 0,
			current: normalizeStarshipNonNegativeInt(foodCurrent) ?? 0,
			applied: 0,
			newValue: normalizeStarshipNonNegativeInt(foodCurrent) ?? 0,
			overRequest: false,
			shouldUpdate: false
		};
	// Positive request against empty / short stock always counts as over-request for warnings.
	if ( fuelReq > fuelResolved.applied ) fuelResolved.overRequest = true;
	if ( foodReq > foodResolved.applied ) foodResolved.overRequest = true;
	return {
		fuel: { ...fuelResolved, requested: fuelReq },
		food: { ...foodResolved, requested: foodReq },
		shouldUpdate: fuelResolved.shouldUpdate || foodResolved.shouldUpdate
	};
}

/**
 * @param {{fuel?: object, food?: object}} resolved
 */
export function notifyStarshipSuppliesConsumeOverRequest(resolved={}) {
	const parts = [];
	if ( resolved.fuel?.overRequest && resolved.fuel.requested > 0 ) {
		const data = prepareStarshipReplenishClampWarning(
			"consume",
			resolved.fuel.requested,
			resolved.fuel.applied
		);
		parts.push(localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesConsumeFuelOverWarn",
			"Fuel: requested {requested}, applied {applied}.",
			{ requested: data.requested, applied: data.applied }
		));
	}
	if ( resolved.food?.overRequest && resolved.food.requested > 0 ) {
		const data = prepareStarshipReplenishClampWarning(
			"consume",
			resolved.food.requested,
			resolved.food.applied
		);
		parts.push(localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesConsumeFoodOverWarn",
			"Food: requested {requested}, applied {applied}.",
			{ requested: data.requested, applied: data.applied }
		));
	}
	if ( !parts.length ) return;
	ui.notifications?.warn?.(parts.join(" "));
}

/**
 * @param {object} input
 * @returns {object|null}
 */
export function buildStarshipSuppliesConsumeChatContext(input={}) {
	const fuelApplied = normalizeStarshipNonNegativeInt(input.fuelApplied) ?? 0;
	const foodApplied = normalizeStarshipNonNegativeInt(input.foodApplied) ?? 0;
	if ( fuelApplied <= 0 && foodApplied <= 0 ) return null;
	const name = String(input.actorName ?? "");
	const fuelCap = normalizeStarshipNonNegativeInt(input.fuelCap) ?? 0;
	const foodCap = normalizeStarshipNonNegativeInt(input.foodEffectiveCap) ?? 0;
	const fuelBefore = normalizeStarshipNonNegativeInt(input.fuelBefore) ?? 0;
	const fuelAfter = normalizeStarshipNonNegativeInt(input.fuelAfter) ?? 0;
	const foodBefore = normalizeStarshipNonNegativeInt(input.foodBefore) ?? 0;
	const foodAfter = normalizeStarshipNonNegativeInt(input.foodAfter) ?? 0;
	return {
		name,
		heading: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesConsumeChatHeading",
			"{name} consumed from Ship’s Stores",
			{ name }
		),
		showFuel: fuelApplied > 0,
		showFood: foodApplied > 0,
		fuelLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesConsumeChatFuelLine",
			"Fuel: {before}/{capacity} → {after}/{capacity}",
			{
				before: formatStarshipWholeNumber(fuelBefore),
				after: formatStarshipWholeNumber(fuelAfter),
				capacity: formatStarshipWholeNumber(fuelCap)
			}
		),
		foodLine: localizeStarshipSupplies(
			"SW5E.StarshipSheet.SuppliesConsumeChatFoodLine",
			"Food: {before}/{capacity} → {after}/{capacity}",
			{
				before: formatStarshipWholeNumber(foodBefore),
				after: formatStarshipWholeNumber(foodAfter),
				capacity: formatStarshipWholeNumber(foodCap)
			}
		)
	};
}

export function notifyStarshipSuppliesConsumeChatPostFailed() {
	ui.notifications?.warn?.(localizeSimple(
		"SW5E.StarshipSheet.SuppliesConsumeChatPostFailed",
		"Ship’s Stores were updated, but the Consume chat confirmation could not be posted."
	));
}

/**
 * @param {Actor} actor
 * @param {object} payload
 */
export async function postStarshipSuppliesConsumeChatMessage(actor, payload) {
	if ( !isLegacyStarshipActor(actor) ) return { posted: false };
	if ( !payload || (!payload.showFuel && !payload.showFood) ) return { posted: false };
	try {
		const templatePath = getModulePath(STARSHIP_SUPPLIES_CONSUME_CHAT_TEMPLATE);
		const render = globalThis.foundry?.applications?.handlebars?.renderTemplate;
		if ( typeof render !== "function" ) {
			throw new Error("foundry.applications.handlebars.renderTemplate is unavailable");
		}
		const content = await render(templatePath, payload);
		await ChatMessage.create({
			author: globalThis.game?.user?.id,
			speaker: ChatMessage.getSpeaker({ actor }),
			flavor: localizeSimple("SW5E.StarshipSheet.SuppliesConsumeChatFlavor", "Consume"),
			content
		});
		return { posted: true };
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Supplies Consume chat failed.", err);
		notifyStarshipSuppliesConsumeChatPostFailed();
		return { posted: false, error: err };
	}
}

/**
 * Build batch-mirror update for changed Fuel/Food values only.
 * @param {{fuelApplied: number, fuelNew: number, foodApplied: number, foodNew: number}} resolved
 * @returns {object|null}
 */
export function buildStarshipSuppliesValueUpdate(resolved={}) {
	const entries = [];
	if ( (normalizeStarshipNonNegativeInt(resolved.fuelApplied) ?? 0) > 0 ) {
		entries.push(["system.attributes.fuel.value", normalizeStarshipNonNegativeInt(resolved.fuelNew) ?? 0]);
	}
	if ( (normalizeStarshipNonNegativeInt(resolved.foodApplied) ?? 0) > 0 ) {
		entries.push(["system.attributes.food.value", normalizeStarshipNonNegativeInt(resolved.foodNew) ?? 0]);
	}
	if ( !entries.length ) return null;
	return buildStarshipLegacyAttributeBatchMirrorUpdate(entries);
}

/**
 * @param {Actor} actor
 * @returns {Promise<{fuel: number, food: number}|null>}
 */
export async function promptStarshipSuppliesConsume(actor) {
	if ( !isLegacyStarshipActor(actor) ) return null;
	const legacyFuel = actor.system?.attributes?.fuel
		?? actor.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.fuel
		?? {};
	const foodSnap = readStarshipFoodResourceSnapshot(actor);
	const fuelCurrent = normalizeStarshipNonNegativeInt(legacyFuel.value) ?? 0;
	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple(
				"SW5E.StarshipSheet.SuppliesConsumeTitle",
				"Consume Ship’s Stores"
			)
		},
		content: buildStarshipSuppliesConsumeDialogContent({
			fuelCurrent,
			foodCurrent: foodSnap.value
		}),
		position: { width: 400 },
		buttons: [
			{
				action: "consume",
				label: localizeSimple("SW5E.StarshipSheet.SuppliesConsumeConfirm", "Consume"),
				icon: "fas fa-check",
				default: true,
				callback: starshipSuppliesConsumeDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		]
	});
	return coerceStarshipSuppliesConsumeDialogResult(result);
}

/**
 * Full Consume workflow for a Starship Actor.
 * @param {Actor} actor
 * @returns {Promise<{updated: boolean, chatPosted?: boolean}>}
 */
export async function runStarshipSuppliesConsume(actor) {
	if ( !isLegacyStarshipActor(actor) ) return { updated: false };
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return { updated: false };
	}
	const requested = await promptStarshipSuppliesConsume(actor);
	if ( requested === null ) return { updated: false };

	const legacyFuel = actor.system?.attributes?.fuel
		?? actor.flags?.sw5e?.legacyStarshipActor?.system?.attributes?.fuel
		?? {};
	const foodSnap = readStarshipFoodResourceSnapshot(actor);
	const fuelCurrent = normalizeStarshipNonNegativeInt(legacyFuel.value) ?? 0;
	const fuelCap = normalizeStarshipNonNegativeInt(legacyFuel.fuelCap) ?? 0;
	const foodCurrent = foodSnap.value;
	const foodCap = foodSnap.capacity.effectiveCapacity;

	const resolved = resolveStarshipSuppliesConsume(
		fuelCurrent,
		foodCurrent,
		requested.fuel,
		requested.food
	);
	if ( !resolved.shouldUpdate ) return { updated: false };

	notifyStarshipSuppliesConsumeOverRequest(resolved);

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
		console.error("SW5E MODULE | Starship Supplies Consume update failed.", err);
		ui.notifications?.error?.(localizeSimple(
			"SW5E.StarshipSheet.SuppliesConsumeSaveFailed",
			"Could not update Ship’s Stores."
		));
		return { updated: false };
	}

	const chat = buildStarshipSuppliesConsumeChatContext({
		actorName: actor.name,
		fuelApplied: resolved.fuel.applied,
		foodApplied: resolved.food.applied,
		fuelBefore: fuelCurrent,
		fuelAfter: resolved.fuel.newValue,
		fuelCap,
		foodBefore: foodCurrent,
		foodAfter: resolved.food.newValue,
		foodEffectiveCap: foodCap
	});
	let chatPosted = false;
	if ( chat ) {
		const posted = await postStarshipSuppliesConsumeChatMessage(actor, chat);
		chatPosted = posted.posted === true;
	}
	return { updated: true, chatPosted };
}
