/**
 * Phase 3B / Bug 12 — Slice 3B-4 Food capacity configuration + read helpers.
 *
 * Capacity source flag: flags.sw5e.starship.food.capOverride
 * DialogV2.wait: resolve from button.callback via button.form (no nested form).
 * Panel shows Current / effective Capacity / Restock Cost only; Capacity cog
 * configures Size|Custom base + source foodCapMod (never prepared AE / effective).
 */

import { isLegacyStarshipActor } from "./augmentations.mjs";
import { localizeOrFallback as localizeSimple } from "./module-support.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import {
	getLegacySizeSystem,
	getLegacyStarshipSize,
	persistStarshipLegacyAttributePath
} from "./starship-data.mjs";
import {
	normalizeStarshipNonNegativeInt,
	normalizeStarshipSignedInt,
	resolveStarshipFoodCapacity
} from "./starship-replenish-math.mjs";
import { escapeHtml } from "./starship-sheet-html.mjs";
import { formatStarshipWholeNumber } from "./starship-number-format.mjs";

export const STARSHIP_FOOD_CAP_OVERRIDE_FLAG = "flags.sw5e.starship.food.capOverride";
export const STARSHIP_FOOD_CAP_SOURCE_FIELD = "foodCapSource";
export const STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD = "foodCapCustomBase";
export const STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD = "foodCapSourceMod";
export const STARSHIP_FOOD_CAP_SOURCE_SIZE = "size";
export const STARSHIP_FOOD_CAP_SOURCE_CUSTOM = "custom";

/** Paths dual-written to legacy mirror (foodCapMod excluded). */
export const STARSHIP_FOOD_LEGACY_MIRROR_PATHS = Object.freeze([
	"system.attributes.food.value",
	"system.attributes.food.foodCap",
	"system.attributes.food.cost"
]);

export const STARSHIP_FOOD_SYSTEM_ONLY_PATHS = Object.freeze([
	"system.attributes.food.foodCapMod"
]);

/**
 * Read Size item foodCap for a Starship Actor. Missing → 0. No writes.
 * @param {Actor} actor
 * @returns {number}
 */
export function readStarshipSizeFoodCap(actor) {
	if ( !isLegacyStarshipActor(actor) ) return 0;
	const items = actor?.items?.contents ?? actor?.items ?? [];
	const sizeItem = getLegacyStarshipSize(Array.isArray(items) ? items : [...items]);
	const sizeSystem = getLegacySizeSystem(sizeItem);
	return normalizeStarshipNonNegativeInt(sizeSystem?.foodCap) ?? 0;
}

/**
 * Read capOverride without write-back. Missing/invalid → false.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function readStarshipFoodCapOverride(actor) {
	const raw = actor?.flags?.sw5e?.starship?.food?.capOverride;
	return raw === true || raw === "true" || raw === 1;
}

/**
 * Source (pre-AE) Food capacity modifier for EDIT.
 * @param {Actor} actor
 * @returns {number}
 */
export function readStarshipFoodCapModSource(actor) {
	const raw = actor?._source?.system?.attributes?.food?.foodCapMod
		?? actor?.system?.attributes?.food?.foodCapMod;
	return normalizeStarshipSignedInt(raw);
}

/**
 * Prepared (post-AE) Food capacity modifier for effective capacity.
 * @param {Actor} actor
 * @returns {number}
 */
export function readStarshipFoodCapModPrepared(actor) {
	return normalizeStarshipSignedInt(actor?.system?.attributes?.food?.foodCapMod);
}

/**
 * Read Food resource fields used by Core context. Does not write.
 * @param {Actor} actor
 * @param {object} [legacyFood] — optional legacy merge food object
 * @returns {object}
 */
export function readStarshipFoodResourceSnapshot(actor, legacyFood={}) {
	const systemFood = actor?.system?.attributes?.food ?? {};
	const value = normalizeStarshipNonNegativeInt(
		systemFood.value ?? legacyFood.value
	) ?? 0;
	const customCap = normalizeStarshipNonNegativeInt(
		systemFood.foodCap ?? legacyFood.foodCap
	) ?? 0;
	const cost = normalizeStarshipNonNegativeInt(
		systemFood.cost ?? legacyFood.cost
	) ?? 0;
	const rawSizeCap = readStarshipSizeFoodCap(actor);
	const overrideActive = readStarshipFoodCapOverride(actor);
	const sourceModifier = readStarshipFoodCapModSource(actor);
	const preparedModifier = readStarshipFoodCapModPrepared(actor);
	const capacity = resolveStarshipFoodCapacity(
		rawSizeCap,
		customCap,
		overrideActive,
		preparedModifier
	);
	return {
		value,
		customCap,
		cost,
		rawSizeCap,
		overrideActive,
		sourceModifier,
		preparedModifier,
		capacity
	};
}

/**
 * Bar context for Food (portions). Never mutates Actor.
 * @param {number} current
 * @param {number} effectiveCap
 * @returns {{foodPct: number, foodBarLabel: string, foodHasCap: boolean}}
 */
export function buildStarshipFoodBarContext(current, effectiveCap) {
	const value = normalizeStarshipNonNegativeInt(current) ?? 0;
	const cap = normalizeStarshipNonNegativeInt(effectiveCap) ?? 0;
	const pct = cap > 0
		? Math.min(100, Math.max(0, Math.round((value / cap) * 100)))
		: (value > 0 ? 100 : 0);
	const valueFmt = formatStarshipWholeNumber(value);
	const capFmt = formatStarshipWholeNumber(cap);
	const barLabel = `${valueFmt} / ${capFmt} portions`;
	return {
		foodPct: pct,
		foodBarLabel: barLabel,
		foodHasCap: cap > 0,
		foodValueFormatted: valueFmt,
		foodCapacityFormatted: capFmt
	};
}

/**
 * @param {unknown} raw
 * @returns {"size"|"custom"|null}
 */
export function validateStarshipFoodCapSourceSubmission(raw) {
	if ( raw === STARSHIP_FOOD_CAP_SOURCE_SIZE ) return STARSHIP_FOOD_CAP_SOURCE_SIZE;
	if ( raw === STARSHIP_FOOD_CAP_SOURCE_CUSTOM ) return STARSHIP_FOOD_CAP_SOURCE_CUSTOM;
	return null;
}

/**
 * Capacity tooltip: `[base] + [mod] = [effective]`, with parenthesized negatives.
 * Unsafe effective → unavailable presentation (never show an unsafe integer as exact).
 * @param {{
 *   selectedBase?: number,
 *   preparedModifier?: number,
 *   effectiveCapacity?: number,
 *   safeInteger?: boolean
 * }} options
 * @returns {string}
 */
export function formatStarshipFoodCapacityTooltip(options={}) {
	if ( options.safeInteger === false ) {
		return localizeSimple(
			"SW5E.StarshipSheet.FoodCapacityUnavailable",
			"Unavailable (too large to display exactly)"
		);
	}
	const base = normalizeStarshipNonNegativeInt(options.selectedBase) ?? 0;
	const preparedModifier = normalizeStarshipSignedInt(options.preparedModifier);
	const effective = normalizeStarshipNonNegativeInt(options.effectiveCapacity) ?? 0;
	const baseFmt = formatStarshipWholeNumber(base);
	const modFmt = formatStarshipWholeNumber(preparedModifier, { allowNegative: true });
	const effectiveFmt = formatStarshipWholeNumber(effective);
	const modPart = preparedModifier < 0 ? `(${modFmt})` : modFmt;
	return `${baseFmt} + ${modPart} = ${effectiveFmt}`;
}

/**
 * Resolve DialogV2 form element from button / dialog.
 * @param {HTMLButtonElement} button
 * @param {object} [dialog]
 * @returns {HTMLFormElement|null}
 */
function getStarshipFoodCapDialogForm(button, dialog) {
	return button?.form
		?? button?.closest?.("form")
		?? dialog?.element?.querySelector?.("form")
		?? button?.closest?.(".window-content")?.querySelector?.("form")
		?? null;
}

/**
 * Build DialogV2 content for Food capacity configuration.
 * Includes Size/Custom source, custom base, source Capacity Modifier, and compact summary.
 * @param {{
 *   overrideActive?: boolean,
 *   customBase?: number,
 *   sourceModifier?: number,
 *   selectedBase?: number,
 *   effectiveCapacity?: number,
 *   safeInteger?: boolean
 * }} options
 * @returns {string}
 */
export function buildStarshipFoodCapSourceDialogContent(options={}) {
	const overrideActive = options.overrideActive === true;
	const sizeSelected = !overrideActive ? " selected" : "";
	const customSelected = overrideActive ? " selected" : "";
	const customBase = normalizeStarshipNonNegativeInt(options.customBase) ?? 0;
	const sourceModifier = normalizeStarshipSignedInt(options.sourceModifier);
	const selectedBase = normalizeStarshipNonNegativeInt(options.selectedBase) ?? 0;
	const effectiveCapacity = options.safeInteger === false
		? "—"
		: formatStarshipWholeNumber(normalizeStarshipNonNegativeInt(options.effectiveCapacity) ?? 0);
	const label = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodCapSource",
		"Food capacity source"
	));
	const sizeLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodUseSizeCapacity",
		"Use Size Capacity"
	));
	const customLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodUseCustomCapacity",
		"Use Custom Capacity"
	));
	const customBaseLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodCustomBaseCapacity",
		"Custom Base Capacity"
	));
	const sourceModLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodCapacityModifier",
		"Capacity Modifier"
	));
	const summaryLabel = escapeHtml(localizeSimple(
		"SW5E.StarshipSheet.FoodCapacitySummary",
		"Base {base} · Source mod {mod} · Effective {effective}"
	)
		.replace("{base}", formatStarshipWholeNumber(selectedBase))
		.replace("{mod}", formatStarshipWholeNumber(sourceModifier, { allowNegative: true }))
		.replace("{effective}", effectiveCapacity));
	const customDisabled = overrideActive ? "" : " disabled";
	const customHidden = overrideActive ? "" : " hidden";
	return `
		<div class="form-group">
			<label for="sw5e-food-cap-source">${label}</label>
			<select id="sw5e-food-cap-source" name="${STARSHIP_FOOD_CAP_SOURCE_FIELD}">
				<option value="${STARSHIP_FOOD_CAP_SOURCE_SIZE}"${sizeSelected}>${sizeLabel}</option>
				<option value="${STARSHIP_FOOD_CAP_SOURCE_CUSTOM}"${customSelected}>${customLabel}</option>
			</select>
		</div>
		<div class="form-group sw5e-food-cap-custom-group"${customHidden}>
			<label for="sw5e-food-cap-custom-base">${customBaseLabel}</label>
			<input
				id="sw5e-food-cap-custom-base"
				type="number"
				name="${STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD}"
				value="${customBase}"
				min="0"
				step="1"
				${customDisabled}
			/>
		</div>
		<div class="form-group">
			<label for="sw5e-food-cap-source-mod">${sourceModLabel}</label>
			<input
				id="sw5e-food-cap-source-mod"
				type="number"
				name="${STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD}"
				value="${sourceModifier}"
				step="1"
			/>
		</div>
		<p class="notes sw5e-food-cap-summary">${summaryLabel}</p>
	`;
}

/**
 * Wire Size/Custom toggle for custom-base field visibility.
 * @param {HTMLElement} root
 */
export function bindStarshipFoodCapSourceDialogControls(root) {
	if ( !root ) return;
	const select = root.querySelector?.(`#sw5e-food-cap-source, [name="${STARSHIP_FOOD_CAP_SOURCE_FIELD}"]`);
	const group = root.querySelector?.(".sw5e-food-cap-custom-group");
	const input = root.querySelector?.(`#sw5e-food-cap-custom-base, [name="${STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD}"]`);
	if ( !select || !group || !input ) return;
	const sync = () => {
		const isCustom = select.value === STARSHIP_FOOD_CAP_SOURCE_CUSTOM;
		group.hidden = !isCustom;
		input.disabled = !isCustom;
	};
	select.addEventListener("change", sync);
	sync();
}

/**
 * DialogV2 callback — read full capacity config from button.form.
 * @param {PointerEvent} _event
 * @param {HTMLButtonElement} button
 * @param {object} [dialog]
 * @returns {{source: "size"|"custom", customBase: number, sourceModifier: number}|null}
 */
export function starshipFoodCapSourceDialogCallback(_event, button, dialog) {
	const form = getStarshipFoodCapDialogForm(button, dialog);
	const rawSource = form?.elements?.[STARSHIP_FOOD_CAP_SOURCE_FIELD]?.value
		?? form?.querySelector?.(`[name="${STARSHIP_FOOD_CAP_SOURCE_FIELD}"]`)?.value;
	const source = validateStarshipFoodCapSourceSubmission(rawSource);
	if ( !source ) return null;
	const rawCustom = form?.elements?.[STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD]?.value
		?? form?.querySelector?.(`[name="${STARSHIP_FOOD_CAP_CUSTOM_BASE_FIELD}"]`)?.value;
	const rawMod = form?.elements?.[STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD]?.value
		?? form?.querySelector?.(`[name="${STARSHIP_FOOD_CAP_SOURCE_MOD_FIELD}"]`)?.value;
	return {
		source,
		customBase: normalizeStarshipNonNegativeInt(rawCustom) ?? 0,
		sourceModifier: normalizeStarshipSignedInt(rawMod)
	};
}

/**
 * Prompt Food capacity configuration. Cancel/dismiss → null.
 * @param {Actor} actor
 * @returns {Promise<{source: "size"|"custom", customBase: number, sourceModifier: number}|null>}
 */
export async function promptStarshipFoodCapSource(actor) {
	const snap = readStarshipFoodResourceSnapshot(actor);
	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple(
				"SW5E.StarshipSheet.ConfigureFoodCapacity",
				"Configure Food Capacity"
			)
		},
		content: buildStarshipFoodCapSourceDialogContent({
			overrideActive: snap.overrideActive,
			customBase: snap.customCap,
			sourceModifier: snap.sourceModifier,
			selectedBase: snap.capacity.selectedBase,
			effectiveCapacity: snap.capacity.effectiveCapacity,
			safeInteger: snap.capacity.safeInteger
		}),
		position: { width: 400 },
		render: (...args) => {
			const dialog = args.find(a => a && (a.element || a.form)) ?? args[1] ?? args[0];
			const root = dialog?.form
				?? dialog?.element?.querySelector?.("form")
				?? dialog?.element
				?? dialog;
			bindStarshipFoodCapSourceDialogControls(root);
		},
		buttons: [
			{
				action: "save",
				label: localizeSimple("SaveChanges", "Save Changes"),
				icon: "fas fa-check",
				default: true,
				callback: starshipFoodCapSourceDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		]
	});
	if ( result && typeof result === "object" && result.source ) {
		const source = validateStarshipFoodCapSourceSubmission(result.source);
		if ( !source ) return null;
		return {
			source,
			customBase: normalizeStarshipNonNegativeInt(result.customBase) ?? 0,
			sourceModifier: normalizeStarshipSignedInt(result.sourceModifier)
		};
	}
	// Backward-compatible: plain size/custom string from older callers/tests.
	if ( result === STARSHIP_FOOD_CAP_SOURCE_SIZE || result === STARSHIP_FOOD_CAP_SOURCE_CUSTOM ) {
		return {
			source: result,
			customBase: snap.customCap,
			sourceModifier: snap.sourceModifier
		};
	}
	return null;
}

/**
 * Apply Size/Custom selection. Skips unchanged writes. Seeds custom base when needed.
 * @param {Actor} actor
 * @param {"size"|"custom"} source
 * @returns {Promise<{updated: boolean}>}
 */
export async function applyStarshipFoodCapSource(actor, source) {
	return applyStarshipFoodCapacityConfig(actor, { source });
}

/**
 * Apply Food capacity configuration (source, optional custom base, optional source mod).
 * Never writes effective capacity or prepared AE modifier results.
 * @param {Actor} actor
 * @param {{source?: "size"|"custom", customBase?: number, sourceModifier?: number}} config
 * @returns {Promise<{updated: boolean}>}
 */
export async function applyStarshipFoodCapacityConfig(actor, config={}) {
	if ( !isLegacyStarshipActor(actor) ) return { updated: false };
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return { updated: false };
	}
	const selected = config.source !== undefined
		? validateStarshipFoodCapSourceSubmission(config.source)
		: (readStarshipFoodCapOverride(actor)
			? STARSHIP_FOOD_CAP_SOURCE_CUSTOM
			: STARSHIP_FOOD_CAP_SOURCE_SIZE);
	if ( !selected ) return { updated: false };

	const wantOverride = selected === STARSHIP_FOOD_CAP_SOURCE_CUSTOM;
	const currentOverride = readStarshipFoodCapOverride(actor);
	const rawSizeCap = readStarshipSizeFoodCap(actor);
	const currentCustom = normalizeStarshipNonNegativeInt(
		actor._source?.system?.attributes?.food?.foodCap
			?? actor.system?.attributes?.food?.foodCap
	) ?? 0;
	const currentSourceMod = readStarshipFoodCapModSource(actor);

	const update = {};
	if ( wantOverride !== currentOverride ) {
		update[STARSHIP_FOOD_CAP_OVERRIDE_FLAG] = wantOverride;
	}

	if ( wantOverride ) {
		if ( config.customBase !== undefined ) {
			const nextCustom = normalizeStarshipNonNegativeInt(config.customBase) ?? 0;
			if ( nextCustom !== currentCustom ) {
				update["system.attributes.food.foodCap"] = nextCustom;
				update["flags.sw5e.legacyStarshipActor.system.attributes.food.foodCap"] = nextCustom;
			}
		} else if ( currentCustom <= 0 && rawSizeCap > 0 ) {
			// Seed custom base from Size when no usable dormant custom exists.
			update["system.attributes.food.foodCap"] = rawSizeCap;
			update["flags.sw5e.legacyStarshipActor.system.attributes.food.foodCap"] = rawSizeCap;
		} else if ( currentCustom <= 0 && rawSizeCap === 0 && !("system.attributes.food.foodCap" in (actor._source?.system?.attributes?.food ?? {})) ) {
			update["system.attributes.food.foodCap"] = 0;
			update["flags.sw5e.legacyStarshipActor.system.attributes.food.foodCap"] = 0;
		}
	}
	// Size mode: do not write Size into Actor foodCap; preserve dormant custom.

	if ( config.sourceModifier !== undefined ) {
		const nextMod = normalizeStarshipSignedInt(config.sourceModifier);
		if ( nextMod !== currentSourceMod ) {
			update["system.attributes.food.foodCapMod"] = nextMod;
		}
	}

	if ( !Object.keys(update).length ) return { updated: false };
	await actor.update(update);
	return { updated: true };
}

/**
 * Open capacity configuration dialog and apply.
 * @param {Actor} actor
 */
export async function openStarshipFoodCapSourceConfig(actor) {
	if ( !isLegacyStarshipActor(actor) ) return;
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return;
	}
	const selected = await promptStarshipFoodCapSource(actor);
	if ( selected === null ) return;
	try {
		await applyStarshipFoodCapacityConfig(actor, selected);
	} catch ( err ) {
		console.error("SW5E MODULE | Starship Food capacity configuration update failed.", err);
		ui.notifications?.error?.(localizeSimple(
			"SW5E.StarshipSheet.FoodCapSourceSaveFailed",
			"Could not save Food capacity source."
		));
	}
}

/**
 * Persist a Food system path with approved mirror rules.
 * foodCapMod → system only; value/foodCap/cost → dual-write.
 * @param {Actor} actor
 * @param {string} systemPath
 * @param {unknown} rawValue
 */
export async function persistStarshipFoodAttributePath(actor, systemPath, rawValue) {
	if ( !isLegacyStarshipActor(actor) ) return;
	if ( systemPath === "system.attributes.food.foodCapMod" ) {
		const value = normalizeStarshipSignedInt(rawValue);
		const current = normalizeStarshipSignedInt(
			actor._source?.system?.attributes?.food?.foodCapMod
				?? actor.system?.attributes?.food?.foodCapMod
		);
		if ( value === current ) return;
		await actor.update({ [systemPath]: value });
		return;
	}
	if ( !STARSHIP_FOOD_LEGACY_MIRROR_PATHS.includes(systemPath) ) return;
	const value = normalizeStarshipNonNegativeInt(rawValue) ?? 0;
	await persistStarshipLegacyAttributePath(actor, systemPath, value);
}
