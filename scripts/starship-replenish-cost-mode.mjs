/**
 * Phase 3B / Bug 12 — Slice 3B-2/3B-4 Fuel and Food replenishment cost-mode configuration.
 *
 * Reads/writes `flags.sw5e.starship.{fuel|food}.replenishCostMode`.
 * Modes are independent — Fuel updates never write Food and vice versa.
 *
 * DialogV2.wait contract (Foundry v13): resolve selection from button.callback
 * via button.form — not from config.submit return.
 */

import { isLegacyStarshipActor } from "./augmentations.mjs";
import { localizeOrFallback as localizeSimple } from "./module-support.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
	STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK,
	STARSHIP_REPLENISH_COST_MODE_PER_UNIT,
	resolveStarshipReplenishCostMode
} from "./starship-replenish-math.mjs";
import { escapeHtml } from "./starship-sheet-html.mjs";

/** @typedef {"fuel"|"food"} StarshipReplenishCostResource */
/** @typedef {"perRestock"|"perUnit"} StarshipReplenishCostMode */

export const STARSHIP_REPLENISH_COST_MODE_FIELD = "replenishCostMode";

/** Known resources and their flag paths (do not construct paths from raw input). */
export const STARSHIP_REPLENISH_COST_MODE_RESOURCES = Object.freeze({
	fuel: Object.freeze({
		key: "fuel",
		flagPath: STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG
	}),
	food: Object.freeze({
		key: "food",
		flagPath: STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG
	})
});

/**
 * Slice 3B-4 production writable set — Fuel and Food.
 */
export const STARSHIP_REPLENISH_COST_MODE_WRITABLE_RESOURCES = Object.freeze(
	new Set(["fuel", "food"])
);

/**
 * @param {unknown} resourceKey
 * @returns {StarshipReplenishCostResource|null}
 */
export function normalizeStarshipReplenishCostResource(resourceKey) {
	if ( resourceKey === "fuel" || resourceKey === "food" ) return resourceKey;
	return null;
}

/**
 * Whitelisted flag path for a resource. Never builds paths from unvalidated input.
 * @param {unknown} resourceKey
 * @returns {string|null}
 */
export function getStarshipReplenishCostModeFlagPath(resourceKey) {
	const key = normalizeStarshipReplenishCostResource(resourceKey);
	if ( !key ) return null;
	return STARSHIP_REPLENISH_COST_MODE_RESOURCES[key].flagPath;
}

/**
 * Whether production code may write this resource's mode flag.
 * @param {unknown} resourceKey
 * @returns {boolean}
 */
export function isStarshipReplenishCostModeWritable(resourceKey) {
	const key = normalizeStarshipReplenishCostResource(resourceKey);
	return Boolean(key && STARSHIP_REPLENISH_COST_MODE_WRITABLE_RESOURCES.has(key));
}

/**
 * Read raw stored mode without defaulting write-back.
 * @param {Actor|null|undefined} actor
 * @param {unknown} resourceKey
 * @returns {unknown}
 */
export function readStarshipReplenishCostModeRaw(actor, resourceKey) {
	const key = normalizeStarshipReplenishCostResource(resourceKey);
	if ( !key || !actor ) return undefined;
	return actor.flags?.sw5e?.starship?.[key]?.[STARSHIP_REPLENISH_COST_MODE_FIELD];
}

/**
 * Effective mode for a resource. Missing/invalid → perRestock. Does not write.
 * @param {Actor|null|undefined} actor
 * @param {unknown} resourceKey
 * @returns {StarshipReplenishCostMode}
 */
export function resolveActorStarshipReplenishCostMode(actor, resourceKey) {
	return resolveStarshipReplenishCostMode(readStarshipReplenishCostModeRaw(actor, resourceKey));
}

/**
 * Validate a submitted mode into a canonical value, or null.
 * Rejects action strings and unknown values (no silent default for writes).
 * @param {unknown} raw
 * @returns {StarshipReplenishCostMode|null}
 */
export function validateStarshipReplenishCostModeSubmission(raw) {
	if ( raw === STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK ) return STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK;
	if ( raw === STARSHIP_REPLENISH_COST_MODE_PER_UNIT ) return STARSHIP_REPLENISH_COST_MODE_PER_UNIT;
	return null;
}

/**
 * Build an Actor update payload for a resource mode, or null when unchanged/invalid/non-writable.
 * Does not call Actor.update.
 *
 * @param {Actor|null|undefined} actor
 * @param {unknown} resourceKey
 * @param {unknown} rawMode
 * @returns {{update: Record<string, string>, mode: StarshipReplenishCostMode}|null}
 */
export function buildStarshipReplenishCostModeUpdate(actor, resourceKey, rawMode) {
	if ( !isLegacyStarshipActor(actor) ) return null;
	if ( !isStarshipReplenishCostModeWritable(resourceKey) ) return null;
	const flagPath = getStarshipReplenishCostModeFlagPath(resourceKey);
	if ( !flagPath ) return null;
	const mode = validateStarshipReplenishCostModeSubmission(rawMode);
	if ( !mode ) return null;
	const current = resolveActorStarshipReplenishCostMode(actor, resourceKey);
	// Missing/invalid raw resolves to perRestock — selecting that default must not dirty the Actor.
	if ( mode === current ) return null;
	return { update: { [flagPath]: mode }, mode };
}

/**
 * Persist a validated mode for a writable resource (Fuel or Food).
 * @param {Actor} actor
 * @param {unknown} resourceKey
 * @param {unknown} rawMode
 * @returns {Promise<{written: boolean, mode: StarshipReplenishCostMode|null}>}
 */
export async function applyStarshipReplenishCostMode(actor, resourceKey, rawMode) {
	const planned = buildStarshipReplenishCostModeUpdate(actor, resourceKey, rawMode);
	if ( !planned ) {
		const mode = validateStarshipReplenishCostModeSubmission(rawMode);
		return { written: false, mode: mode ?? null };
	}
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return { written: false, mode: planned.mode };
	}
	await actor.update(planned.update);
	return { written: true, mode: planned.mode };
}

/**
 * DialogV2 form resolution (Foundry v13) — prefer button.form.
 * @param {HTMLButtonElement|null|undefined} button
 * @param {object|null|undefined} dialog
 * @returns {HTMLFormElement|null}
 */
export function getStarshipReplenishCostModeDialogForm(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	if ( !el ) return null;
	const FormCtor = globalThis.HTMLFormElement;
	if ( FormCtor && el instanceof FormCtor ) return el;
	if ( el.tagName === "FORM" ) return el;
	return null;
}

/**
 * Read selected mode from DialogV2 form field name=replenishCostMode.
 * @param {HTMLFormElement|null|undefined} form
 * @returns {StarshipReplenishCostMode|null}
 */
export function readStarshipReplenishCostModeFromForm(form) {
	if ( !form ) return null;
	const field = form.elements?.namedItem?.(STARSHIP_REPLENISH_COST_MODE_FIELD)
		?? form.querySelector?.(`[name='${STARSHIP_REPLENISH_COST_MODE_FIELD}']`);
	const raw = field?.value;
	return validateStarshipReplenishCostModeSubmission(raw);
}

/**
 * DialogV2 confirm callback — returns parsed mode or null.
 * @param {Event} _event
 * @param {HTMLButtonElement} button
 * @param {object} dialog
 * @returns {StarshipReplenishCostMode|null}
 */
export function starshipReplenishCostModeDialogCallback(_event, button, dialog) {
	return readStarshipReplenishCostModeFromForm(getStarshipReplenishCostModeDialogForm(button, dialog));
}

/**
 * Coerce DialogV2.wait result to a validated mode. Action strings → null.
 * @param {unknown} result
 * @returns {StarshipReplenishCostMode|null}
 */
export function coerceStarshipReplenishCostModeDialogResult(result) {
	return validateStarshipReplenishCostModeSubmission(result);
}

/**
 * Build DialogV2 content markup (no nested form).
 * @param {StarshipReplenishCostMode} selectedMode
 * @returns {string}
 */
export function buildStarshipReplenishCostModeDialogContent(selectedMode) {
	const mode = resolveStarshipReplenishCostMode(selectedMode);
	const fieldLabel = localizeSimple(
		"SW5E.StarshipSheet.ReplenishCostMode",
		"Replenishment cost mode"
	);
	const perRestock = localizeSimple(
		"SW5E.StarshipSheet.ReplenishCostModePerRestock",
		"Per Restock"
	);
	const perUnit = localizeSimple(
		"SW5E.StarshipSheet.ReplenishCostModePerUnit",
		"Per Unit"
	);
	const restockSelected = mode === STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK ? " selected" : "";
	const unitSelected = mode === STARSHIP_REPLENISH_COST_MODE_PER_UNIT ? " selected" : "";
	return `<div class="form-group">
		<label for="sw5e-replenish-cost-mode">${escapeHtml(fieldLabel)}</label>
		<select id="sw5e-replenish-cost-mode" name="${STARSHIP_REPLENISH_COST_MODE_FIELD}">
			<option value="${STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK}"${restockSelected}>${escapeHtml(perRestock)}</option>
			<option value="${STARSHIP_REPLENISH_COST_MODE_PER_UNIT}"${unitSelected}>${escapeHtml(perUnit)}</option>
		</select>
	</div>`;
}

/**
 * Prompt for replenishment cost mode. Production callers must pass "fuel" only.
 * Cancel / dismiss → null.
 * @param {Actor} actor
 * @param {unknown} resourceKey
 * @returns {Promise<StarshipReplenishCostMode|null>}
 */
export async function promptStarshipReplenishCostMode(actor, resourceKey) {
	if ( !isStarshipReplenishCostModeWritable(resourceKey) ) return null;
	if ( !isLegacyStarshipActor(actor) ) return null;
	const DialogV2 = foundry.applications.api.DialogV2;
	const current = resolveActorStarshipReplenishCostMode(actor, resourceKey);
	const content = buildStarshipReplenishCostModeDialogContent(current);
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple(
				"SW5E.StarshipSheet.ConfigureReplenishCost",
				"Configure replenishment cost"
			)
		},
		content,
		position: { width: 360 },
		buttons: [
			{
				action: "save",
				label: localizeSimple("SaveChanges", "Save"),
				icon: "fas fa-check",
				default: true,
				callback: starshipReplenishCostModeDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		]
	});
	return coerceStarshipReplenishCostModeDialogResult(result);
}

/**
 * Open Fuel cost-mode dialog and persist when confirmed.
 * Surfaces update failures (does not swallow).
 * @param {Actor} actor
 * @param {unknown} [resourceKey="fuel"]
 * @returns {Promise<void>}
 */
export async function openStarshipReplenishCostModeConfig(actor, resourceKey="fuel") {
	if ( !isLegacyStarshipActor(actor) ) return;
	if ( !isStarshipReplenishCostModeWritable(resourceKey) ) return;
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return;
	}
	const selected = await promptStarshipReplenishCostMode(actor, resourceKey);
	if ( selected === null ) return;
	await applyStarshipReplenishCostMode(actor, resourceKey, selected);
}

/**
 * Localized label for an effective mode (sheet accessibility).
 * @param {StarshipReplenishCostMode|unknown} mode
 * @returns {string}
 */
export function localizeStarshipReplenishCostModeLabel(mode) {
	const resolved = resolveStarshipReplenishCostMode(mode);
	if ( resolved === STARSHIP_REPLENISH_COST_MODE_PER_UNIT ) {
		return localizeSimple("SW5E.StarshipSheet.ReplenishCostModePerUnit", "Per Unit");
	}
	return localizeSimple("SW5E.StarshipSheet.ReplenishCostModePerRestock", "Per Restock");
}

/**
 * Fuel-only sheet context for EDIT cog (no Food context).
 * Does not write flags.
 * @param {Actor} actor
 * @param {{costConfigEditable?: boolean}} [options]
 * @returns {{
 *   mode: StarshipReplenishCostMode,
 *   modeLabel: string,
 *   configEditable: boolean,
 *   configureLabel: string
 * }}
 */
export function buildStarshipFuelReplenishCostModeContext(actor, { costConfigEditable=false } = {}) {
	const mode = resolveActorStarshipReplenishCostMode(actor, "fuel");
	return {
		mode,
		modeLabel: localizeStarshipReplenishCostModeLabel(mode),
		configEditable: Boolean(costConfigEditable) && isLegacyStarshipActor(actor),
		configureLabel: localizeSimple(
			"SW5E.StarshipSheet.ConfigureReplenishCost",
			"Configure replenishment cost"
		)
	};
}

/**
 * Food Restock Cost mode context for Core sheet. Does not write.
 * @param {Actor} actor
 * @param {{costConfigEditable?: boolean}} [options]
 */
export function buildStarshipFoodReplenishCostModeContext(actor, { costConfigEditable=false } = {}) {
	const mode = resolveActorStarshipReplenishCostMode(actor, "food");
	return {
		mode,
		modeLabel: localizeStarshipReplenishCostModeLabel(mode),
		configEditable: Boolean(costConfigEditable) && isLegacyStarshipActor(actor),
		configureLabel: localizeSimple(
			"SW5E.StarshipSheet.ConfigureReplenishCost",
			"Configure replenishment cost"
		)
	};
}
