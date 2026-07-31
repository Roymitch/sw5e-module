/**
 * Phase 3A / Bug 7 — Starship multi-unit Fuel burn helpers.
 * Dialog amount prompt + clamp-to-available resolution; persistence stays in sheet delegates.
 *
 * DialogV2.wait contract (Foundry v13): resolves with button.callback return value, or
 * button.action when no callback. The config.submit return value is NOT used as the wait result.
 */

import { escapeHtml, localizeOrFallback as localizeSimple } from "./starship-sheet-html.mjs";

/**
 * Localize with `{name}` interpolation (game.i18n.format when available).
 * @param {string} key
 * @param {string} fallback
 * @param {Record<string, string|number>} [data]
 * @returns {string}
 */
export function localizeStarshipFuelBurn(key, fallback, data={}) {
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
 * Parse a burn-amount dialog input into a positive integer, or null if invalid.
 * @param {unknown} raw
 * @returns {number|null}
 */
export function normalizeStarshipFuelBurnRequest(raw) {
	const amount = Math.trunc(Number(raw));
	if ( !Number.isFinite(amount) || amount < 1 ) return null;
	return amount;
}

/**
 * Resolve DialogV2 form element from the submitting button (Foundry v13 pattern).
 * Prefer `button.form` — DialogV2 wraps content in its own form; nested `<form>` in content is invalid.
 * @param {HTMLButtonElement|null|undefined} button
 * @param {object|null|undefined} dialog
 * @returns {HTMLFormElement|null}
 */
export function getStarshipFuelBurnDialogForm(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	if ( !el ) return null;
	const FormCtor = globalThis.HTMLFormElement;
	if ( FormCtor && el instanceof FormCtor ) return el;
	if ( el.tagName === "FORM" ) return el;
	return null;
}

/**
 * Read the burned-amount field from a DialogV2 form.
 * @param {HTMLFormElement|null|undefined} form
 * @returns {number|null}
 */
export function readStarshipFuelBurnAmountFromForm(form) {
	if ( !form ) return null;
	const field = form.elements?.namedItem?.("burned")
		?? form.querySelector?.("[name='burned']");
	const raw = field?.value;
	return normalizeStarshipFuelBurnRequest(raw);
}

/**
 * DialogV2 Burn button callback — returns parsed amount or null.
 * Signature matches Foundry v13: (event, button, dialog).
 * @param {Event} _event
 * @param {HTMLButtonElement} button
 * @param {object} dialog
 * @returns {number|null}
 */
export function starshipFuelBurnDialogCallback(_event, button, dialog) {
	return readStarshipFuelBurnAmountFromForm(getStarshipFuelBurnDialogForm(button, dialog));
}

/**
 * Normalize DialogV2.wait result into a burn amount.
 * Numbers from button.callback pass through; action strings / cancel / dismiss → null.
 * @param {unknown} result
 * @returns {number|null}
 */
export function coerceStarshipFuelBurnDialogResult(result) {
	if ( typeof result === "number" ) return normalizeStarshipFuelBurnRequest(result);
	return null;
}

/**
 * Resolve how much fuel to burn given current stock and a requested amount.
 * @param {number} current
 * @param {number} requested
 * @returns {{requested: number, applied: number, newValue: number, overBurn: boolean}|null}
 */
export function resolveStarshipFuelBurn(current, requested) {
	const cur = Number(current);
	const safeCurrent = Number.isFinite(cur) ? Math.max(0, Math.trunc(cur)) : 0;
	const req = normalizeStarshipFuelBurnRequest(requested);
	if ( req === null ) return null;
	if ( safeCurrent <= 0 ) {
		return { requested: req, applied: 0, newValue: 0, overBurn: req > 0 };
	}
	const applied = Math.min(req, safeCurrent);
	return {
		requested: req,
		applied,
		newValue: safeCurrent - applied,
		overBurn: req > safeCurrent
	};
}

/**
 * Over-burn warning text (requested vs applied). Transient notification copy.
 * @param {number} requested
 * @param {number} applied
 * @returns {string}
 */
export function formatStarshipFuelOverBurnWarning(requested, applied) {
	return localizeStarshipFuelBurn(
		"SW5E.StarshipSheet.BurnFuelOverRequestWarning",
		"Requested {requested} fuel, but only {applied} remaining was burned.",
		{ requested, applied }
	);
}

/**
 * Emit the over-burn soft warning when requested exceeds available.
 * @param {number} requested
 * @param {number} applied
 */
export function notifyStarshipFuelOverBurn(requested, applied) {
	ui.notifications.warn(formatStarshipFuelOverBurnWarning(requested, applied));
}

/**
 * Prompt for how many fuel units to burn. Default 1. Cancel → null.
 * No helper/notes paragraph. Content fields sit in DialogV2's outer form (no nested form).
 * @returns {Promise<number|null>}
 */
export async function promptStarshipFuelBurnAmount() {
	const DialogV2 = foundry.applications.api.DialogV2;
	const label = localizeSimple(
		"SW5E.StarshipSheet.BurnFuelAmountLabel",
		"Units to burn"
	);
	// Bare field markup only — DialogV2#_renderHTML already wraps content in <form>.
	const content = `<div class="form-group">
		<label for="sw5e-fuel-burn-amount">${escapeHtml(label)}</label>
		<input id="sw5e-fuel-burn-amount" name="burned" type="number" min="1" step="1" value="1" />
	</div>`;

	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeSimple("SW5E.StarshipSheet.BurnFuelDialogTitle", "Burn Fuel")
		},
		content,
		position: { width: 360 },
		buttons: [
			{
				action: "burn",
				label: localizeSimple("SW5E.BurnFuel", "Burn"),
				icon: "fas fa-fire",
				default: true,
				callback: starshipFuelBurnDialogCallback
			},
			{
				action: "cancel",
				label: localizeSimple("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		]
	});

	return coerceStarshipFuelBurnDialogResult(result);
}
