/**
 * Starship Power Die recovery.
 *
 * Explicit Recover Power (default allocationMode "prompt"):
 *   reactor roll or manual total → one combined multi-pool allocation dialog.
 *
 * Regen / legacy callers (allocationMode "legacyCentralFirst"):
 *   preserve historical Central-first + remainder checkbox behavior.
 *
 * DialogV2.wait (Foundry v13): resolves button.callback ?? button.action.
 * Prefer button.form; never treat action strings as submitted values.
 */
import {
	STARSHIP_POWER_DIE_SLOTS,
	buildStarshipLegacyAttributeMirrorUpdate,
	getLegacyStarshipActorSystem,
	getStarshipPowerRecoverySlots,
	getStarshipPowerRecoverySummary,
	recordStarshipPowerSlotPeak
} from "./starship-data.mjs";
import { notifyOrSkipStarshipPowerRecoveryFullCapacity } from "./starship-power-recovery-notify.mjs";

export { notifyOrSkipStarshipPowerRecoveryFullCapacity } from "./starship-power-recovery-notify.mjs";

export const STARSHIP_POWER_RECOVERY_AMOUNT_FIELD = "recovered";
export const STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT = "prompt";
export const STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_LEGACY = "legacyCentralFirst";

function localizeOrFallback(key, fallback, data = {}) {
	const formatted = game?.i18n?.format?.(key, data);
	if ( formatted && formatted !== key ) return formatted;
	const localized = game?.i18n?.localize?.(key);
	if ( localized && localized !== key ) return localized;
	return Object.entries(data).reduce(
		(text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
		fallback
	);
}

function escapeHtml(text) {
	return globalThis.foundry?.utils?.escapeHTML?.(String(text ?? "")) ?? String(text ?? "");
}

function isValidRecoveryFormula(formula) {
	if ( typeof formula !== "string" ) return false;
	const trimmed = formula.trim().toLowerCase();
	if ( !trimmed || trimmed === "1d1" || trimmed === "d1" || trimmed === "0" ) return false;
	return true;
}

function findEquippedReactor(actor) {
	const items = actor?.items?.contents ?? [];
	return items.find(item => {
		const typeVal = item.system?.type?.value ?? item._source?.system?.type?.value;
		const equipped = item.system?.equipped ?? item._source?.system?.equipped;
		return typeVal === "reactor" && equipped !== false;
	}) ?? null;
}

export function normalizeStarshipPowerRecoveryAmount(raw) {
	if ( typeof raw === "string" && raw.trim() === "" ) return null;
	const amount = Math.trunc(Number(raw));
	if ( !Number.isFinite(amount) || amount < 1 ) return null;
	return amount;
}

/** Non-negative whole quantity for per-pool fields (0 allowed). Invalid → null. */
export function normalizeStarshipPowerPoolAllocationQty(raw) {
	if ( raw === undefined || raw === null ) return 0;
	if ( typeof raw === "string" && raw.trim() === "" ) return 0;
	const amount = Math.trunc(Number(raw));
	if ( !Number.isFinite(amount) || amount < 0 ) return null;
	return amount;
}

export function clampStarshipPowerRecoveryAmount(requested, totalMissing) {
	const req = normalizeStarshipPowerRecoveryAmount(requested);
	const missing = Math.max(0, Math.trunc(Number(totalMissing) || 0));
	if ( req === null ) return 0;
	return Math.min(req, missing);
}

export function getStarshipPowerRecoveryDialogForm(button, dialog) {
	const el = button?.form ?? dialog?.form ?? dialog?.element?.querySelector?.("form");
	if ( !el ) return null;
	const FormCtor = globalThis.HTMLFormElement;
	if ( FormCtor && el instanceof FormCtor ) return el;
	if ( el.tagName === "FORM" ) return el;
	return null;
}

export function emptyStarshipPowerAllocations() {
	return Object.fromEntries(STARSHIP_POWER_DIE_SLOTS.map(key => [key, 0]));
}

export function selectFieldNameForPowerPool(slotKey) {
	return `select-${slotKey}`;
}

export function qtyFieldNameForPowerPool(slotKey) {
	return `qty-${slotKey}`;
}

/**
 * Validate a combined multi-pool allocation against slot headroom.
 * Does not write. Does not display current/max in UI — headroom is internal only.
 *
 * @param {object} options
 * @param {unknown} options.recoveredAvailable Requested recovered dice (before or after clamp input)
 * @param {Array<{key:string,label:string,missing:number,value:number,allocationMax:number}>} options.slots
 * @param {Record<string, boolean>} options.selected
 * @param {Record<string, unknown>} options.quantities
 * @returns {{ ok: true, recovered: number, allocations: Record<string, number> }
 *   | { ok: false, code: string, pool?: string, headroom?: number, recovered?: number, allocated?: number, remaining?: number }}
 */
export function validateStarshipCombinedPowerRecoveryAllocation({
	recoveredAvailable,
	slots = [],
	selected = {},
	quantities = {}
} = {}) {
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const totalHeadroom = slots.reduce((sum, slot) => sum + Math.max(0, slot.missing ?? 0), 0);
	const requested = normalizeStarshipPowerRecoveryAmount(recoveredAvailable);
	if ( requested === null ) {
		return { ok: false, code: "invalidRecovered" };
	}
	const recovered = Math.min(requested, totalHeadroom);
	if ( recovered <= 0 ) {
		return { ok: false, code: "noHeadroom" };
	}

	const allocations = emptyStarshipPowerAllocations();
	let allocated = 0;

	for ( const slotKey of STARSHIP_POWER_DIE_SLOTS ) {
		const slot = byKey[slotKey];
		const headroom = Math.max(0, slot?.missing ?? 0);
		const isSelected = selected[slotKey] === true;
		const qty = normalizeStarshipPowerPoolAllocationQty(quantities[slotKey]);
		if ( qty === null ) {
			return { ok: false, code: "invalidQty", pool: slotKey };
		}
		if ( !isSelected ) {
			if ( qty !== 0 ) return { ok: false, code: "uncheckedNonzero", pool: slotKey };
			allocations[slotKey] = 0;
			continue;
		}
		if ( headroom <= 0 ) {
			if ( qty !== 0 ) return { ok: false, code: "ineligibleNonzero", pool: slotKey };
			allocations[slotKey] = 0;
			continue;
		}
		if ( qty > headroom ) {
			return {
				ok: false,
				code: "exceedsHeadroom",
				pool: slotKey,
				headroom,
				label: slot?.label ?? slotKey
			};
		}
		allocations[slotKey] = qty;
		allocated += qty;
	}

	if ( allocated > recovered ) {
		return { ok: false, code: "overAllocated", recovered, allocated };
	}
	if ( allocated < recovered ) {
		return {
			ok: false,
			code: "underAllocated",
			recovered,
			allocated,
			remaining: recovered - allocated
		};
	}
	if ( allocated <= 0 ) {
		return { ok: false, code: "noneAllocated", recovered };
	}

	return { ok: true, recovered, allocations };
}

/**
 * Read combined dialog form into selected/quantities maps.
 * @param {HTMLFormElement|null|undefined} form
 * @param {boolean} [manualAmountEditable]
 */
export function readStarshipCombinedPowerRecoveryFromForm(form, { manualAmountEditable=false, fixedRecovered=null } = {}) {
	const selected = {};
	const quantities = {};
	for ( const slotKey of STARSHIP_POWER_DIE_SLOTS ) {
		const selectEl = form?.elements?.namedItem?.(selectFieldNameForPowerPool(slotKey))
			?? form?.querySelector?.(`[name='${selectFieldNameForPowerPool(slotKey)}']`);
		const qtyEl = form?.elements?.namedItem?.(qtyFieldNameForPowerPool(slotKey))
			?? form?.querySelector?.(`[name='${qtyFieldNameForPowerPool(slotKey)}']`);
		selected[slotKey] = Boolean(selectEl?.checked) && !selectEl?.disabled;
		quantities[slotKey] = qtyEl?.value ?? "0";
	}
	let recoveredAvailable = fixedRecovered;
	if ( manualAmountEditable ) {
		const field = form?.elements?.namedItem?.(STARSHIP_POWER_RECOVERY_AMOUNT_FIELD)
			?? form?.querySelector?.(`[name='${STARSHIP_POWER_RECOVERY_AMOUNT_FIELD}']`);
		recoveredAvailable = field?.value;
	}
	return { recoveredAvailable, selected, quantities };
}

export function warnStarshipCombinedPowerRecoveryValidation(result) {
	if ( !result || result.ok ) return;
	switch ( result.code ) {
		case "invalidRecovered":
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerManualRecoveryInvalid",
				"Enter a whole number of recovered dice greater than zero."
			));
			break;
		case "exceedsHeadroom":
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerPoolHeadroomExceeded",
				"{label} can recover no more than {headroom} Power Dice.",
				{ label: result.label ?? result.pool, headroom: result.headroom ?? 0 }
			));
			break;
		case "underAllocated":
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerAllocationIncomplete",
				"{recovered} Power Dice are available, but only {allocated} are allocated. Allocate the remaining {remaining} Power Dice.",
				{
					recovered: result.recovered ?? 0,
					allocated: result.allocated ?? 0,
					remaining: result.remaining ?? 0
				}
			));
			break;
		case "overAllocated":
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerAllocationOver",
				"{allocated} Power Dice allocated exceeds {recovered} available.",
				{ allocated: result.allocated ?? 0, recovered: result.recovered ?? 0 }
			));
			break;
		case "stale":
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerAllocationStale",
				"Power Die pools changed while the dialog was open. Reopen Recover Power and try again."
			));
			break;
		default:
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerAllocationInvalid",
				"Enter a valid Power Die allocation before recovering."
			));
	}
}

/**
 * DialogV2 Recover callback for combined allocation.
 * @returns {object|false} Normalized allocation result, or false to keep dialog open
 */
export function starshipCombinedPowerRecoveryDialogCallback(
	_event,
	button,
	dialog,
	{ slots, manualAmountEditable, fixedRecovered } = {}
) {
	const form = getStarshipPowerRecoveryDialogForm(button, dialog);
	const parsed = readStarshipCombinedPowerRecoveryFromForm(form, { manualAmountEditable, fixedRecovered });
	const result = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: parsed.recoveredAvailable,
		slots,
		selected: parsed.selected,
		quantities: parsed.quantities
	});
	if ( !result.ok ) {
		warnStarshipCombinedPowerRecoveryValidation(result);
		return false;
	}
	return result;
}

export function coerceStarshipCombinedPowerRecoveryDialogResult(result) {
	if ( !result || typeof result !== "object" || Array.isArray(result) ) return null;
	if ( result.ok !== true ) return null;
	if ( !Number.isFinite(result.recovered) || result.recovered < 1 ) return null;
	if ( !result.allocations || typeof result.allocations !== "object" ) return null;
	return result;
}

/** @deprecated Kept for legacy Central-first tests / Regen path helpers. */
export function readStarshipPowerRecoveryAmountFromForm(form) {
	if ( !form ) return null;
	const field = form.elements?.namedItem?.(STARSHIP_POWER_RECOVERY_AMOUNT_FIELD)
		?? form.querySelector?.(`[name='${STARSHIP_POWER_RECOVERY_AMOUNT_FIELD}']`);
	return normalizeStarshipPowerRecoveryAmount(field?.value);
}

/** @deprecated Legacy remainder-dialog helpers retained for Regen isolation. */
export function starshipPowerRecoveryManualDialogCallback(_event, button, dialog) {
	const amount = readStarshipPowerRecoveryAmountFromForm(
		getStarshipPowerRecoveryDialogForm(button, dialog)
	);
	if ( amount !== null ) return amount;
	ui.notifications?.warn?.(localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryInvalid",
		"Enter a whole number of recovered dice greater than zero."
	));
	return false;
}

export function coerceStarshipPowerRecoveryManualDialogResult(result) {
	if ( typeof result === "number" ) return normalizeStarshipPowerRecoveryAmount(result);
	return null;
}

export function readStarshipPowerAllocationFromForm(form, allocatable = []) {
	if ( !form ) return [];
	return allocatable
		.filter(slot => {
			const el = form.elements?.namedItem?.(slot.key)
				?? form.querySelector?.(`[name="${slot.key}"]`);
			return Boolean(el?.checked);
		})
		.map(slot => slot.key);
}

export function starshipPowerAllocationDialogCallback(_event, button, dialog, allocatable, count) {
	const form = getStarshipPowerRecoveryDialogForm(button, dialog);
	const allocation = readStarshipPowerAllocationFromForm(form, allocatable);
	const required = Math.max(0, Math.trunc(Number(count) || 0));
	if ( allocation.length !== required ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerAllocateCountMismatch",
			"Select exactly {count} subsystem pools.",
			{ count: required }
		));
		return false;
	}
	return allocation;
}

export function coerceStarshipPowerAllocationDialogResult(result, allowedKeys = []) {
	if ( !Array.isArray(result) ) return null;
	const allowed = new Set(allowedKeys);
	const keys = result.filter(key => typeof key === "string" && allowed.has(key));
	return keys.length === result.length ? keys : null;
}

export function planStarshipPowerDiceRecovery(slots, recoveredAmount) {
	const amount = Math.max(0, Math.trunc(Number(recoveredAmount) || 0));
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const totalMissing = slots.reduce((sum, slot) => sum + slot.missing, 0);
	if ( amount <= 0 || totalMissing <= 0 ) {
		return { mode: "noop", updates: {}, toAllocate: 0, allocatable: [] };
	}

	if ( amount >= totalMissing ) {
		const updates = {};
		for ( const slot of slots ) updates[slot.key] = slot.allocationMax;
		return { mode: "fill-all", updates, toAllocate: 0, allocatable: [] };
	}

	const centralMissing = byKey.central?.missing ?? 0;
	if ( centralMissing >= amount ) {
		return {
			mode: "central-only",
			updates: { central: (byKey.central?.value ?? 0) + amount },
			toAllocate: 0,
			allocatable: []
		};
	}

	const updates = { central: byKey.central?.allocationMax ?? 0 };
	const toAllocate = amount - centralMissing;
	const allocatable = slots.filter(slot => slot.key !== "central" && !slot.isFull);
	if ( !allocatable.length ) {
		return { mode: "no-allocatable", updates, toAllocate, allocatable: [] };
	}
	return { mode: "central-then-allocate", updates, toAllocate, allocatable };
}

export function buildStarshipPowerRecoveryValueUpdate(updates = {}) {
	let payload = {};
	for ( const [slotKey, newValue] of Object.entries(updates) ) {
		if ( !STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) continue;
		payload = {
			...payload,
			...buildStarshipLegacyAttributeMirrorUpdate(
				`system.attributes.power.${slotKey}.value`,
				newValue
			)
		};
	}
	return payload;
}

/**
 * Build value updates from per-pool allocation deltas against live slots.
 * @param {Array<{key:string,value:number}>} slots
 * @param {Record<string, number>} allocations
 */
export function buildStarshipPowerRecoveryUpdatesFromAllocations(slots, allocations = {}) {
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const updates = {};
	for ( const slotKey of STARSHIP_POWER_DIE_SLOTS ) {
		const add = Math.max(0, Math.trunc(Number(allocations[slotKey]) || 0));
		if ( add <= 0 ) continue;
		const current = byKey[slotKey]?.value ?? 0;
		updates[slotKey] = current + add;
	}
	return updates;
}

export async function getStarshipPowerRecoveryFormula(actor) {
	const reactor = findEquippedReactor(actor);
	const legacySystem = getLegacyStarshipActorSystem(actor);
	const candidates = [
		reactor?.system?.attributes?.powerdicerec?.value,
		reactor?._source?.system?.attributes?.powerdicerec?.value,
		legacySystem?.attributes?.equip?.reactor?.powerRecDie,
		reactor?.flags?.sw5e?.legacyStarshipEquipment?.attributes?.powerdicerec?.value
	];
	for ( const candidate of candidates ) {
		if ( isValidRecoveryFormula(candidate) ) return String(candidate).trim();
	}

	const compendiumSource = reactor?._stats?.compendiumSource ?? reactor?.flags?.core?.sourceId;
	if ( compendiumSource ) {
		try {
			const doc = await fromUuid(compendiumSource);
			const fromPack = doc?.system?.attributes?.powerdicerec?.value;
			if ( isValidRecoveryFormula(fromPack) ) return String(fromPack).trim();
		} catch {
			// best-effort
		}
	}

	return null;
}

async function rollRecoveryFormula(actor, formula) {
	const roll = await new Roll(formula, actor?.getRollData?.() ?? {}).evaluate();
	const flavor = localizeOrFallback("SW5E.PowerDiceRecovery", "Power Dice Recovery");
	await roll.toMessage({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: `${flavor}: ${actor?.name ?? ""}`.trim(),
		flags: { sw5e: { roll: { type: "pwrDieRec" } } }
	});
	return Math.max(0, Math.trunc(roll.total));
}

export function buildStarshipCombinedPowerRecoveryDialogContent({ slots, manualAmountEditable, fixedRecovered }) {
	const recoveredLabel = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerRecoveredAvailable",
		"Recovered Dice Available"
	);
	const manualHint = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryHint",
		"Manual recovery — no equipped reactor recovery formula was found."
	);

	const recoveredBlock = manualAmountEditable
		? `<p class="notes">${escapeHtml(manualHint)}</p>
			<div class="form-group">
				<label for="sw5e-power-recovery-amount">${escapeHtml(recoveredLabel)}</label>
				<input id="sw5e-power-recovery-amount" name="${STARSHIP_POWER_RECOVERY_AMOUNT_FIELD}" type="number" min="1" step="1" value="1" />
			</div>`
		: `<div class="form-group">
				<label>${escapeHtml(recoveredLabel)}</label>
				<div class="form-fields"><span class="sw5e-starship-power-recovery-available-fixed">${escapeHtml(String(fixedRecovered))}</span></div>
			</div>`;

	const rows = slots.map(slot => {
		const eligible = (slot.missing ?? 0) > 0;
		const selectName = selectFieldNameForPowerPool(slot.key);
		const qtyName = qtyFieldNameForPowerPool(slot.key);
		const selectId = `sw5e-power-rec-select-${slot.key}`;
		const qtyId = `sw5e-power-rec-qty-${slot.key}`;
		const disabledAttr = eligible ? "" : " disabled";
		return `<div class="form-group sw5e-starship-power-recovery-pool-row${eligible ? "" : " is-ineligible"}">
			<div class="sw5e-starship-power-recovery-pool-left">
				<input id="${escapeHtml(selectId)}" type="checkbox" name="${escapeHtml(selectName)}" data-sw5e-power-pool-select="${escapeHtml(slot.key)}"${disabledAttr} />
				<label for="${escapeHtml(selectId)}">${escapeHtml(slot.label)}</label>
			</div>
			<div class="sw5e-starship-power-recovery-pool-right">
				<input id="${escapeHtml(qtyId)}" class="sw5e-starship-power-recovery-pool-qty" type="number" name="${escapeHtml(qtyName)}" data-sw5e-power-pool-qty="${escapeHtml(slot.key)}" min="0" step="1" value="0" disabled aria-label="${escapeHtml(slot.label)}" />
			</div>
		</div>`;
	}).join("");

	return `<div class="sw5e-starship-power-recovery-combined">
		${recoveredBlock}
		<div class="sw5e-starship-power-recovery-pool-list" role="group" aria-label="${escapeHtml(localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerTitle", "Power Die Allocation"))}">
			${rows}
		</div>
	</div>`;
}

function bindCombinedRecoveryDialogInteractions(dialog) {
	const root = dialog?.element instanceof HTMLElement
		? dialog.element
		: dialog?.element?.[0] ?? null;
	if ( !(root instanceof HTMLElement) ) return;
	if ( root.dataset.sw5ePowerCombinedBound === "1" ) return;
	root.dataset.sw5ePowerCombinedBound = "1";
	root.addEventListener("change", event => {
		const cb = event.target?.closest?.("input[type='checkbox'][data-sw5e-power-pool-select]");
		if ( !(cb instanceof HTMLInputElement) ) return;
		const key = cb.dataset.sw5ePowerPoolSelect;
		const qty = root.querySelector(`input[data-sw5e-power-pool-qty="${key}"]`);
		if ( !(qty instanceof HTMLInputElement) ) return;
		if ( cb.checked && !cb.disabled ) {
			qty.disabled = false;
		} else {
			qty.value = "0";
			qty.disabled = true;
		}
	});
}

async function promptCombinedPowerRecovery(actor, {
	slots,
	manualAmountEditable,
	fixedRecovered
}) {
	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power")
		},
		content: buildStarshipCombinedPowerRecoveryDialogContent({ slots, manualAmountEditable, fixedRecovered }),
		position: { width: 460 },
		buttons: [
			{
				action: "recover",
				label: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power"),
				icon: "fas fa-bolt",
				default: true,
				callback: (event, button, dialog) => starshipCombinedPowerRecoveryDialogCallback(
					event,
					button,
					dialog,
					{ slots, manualAmountEditable, fixedRecovered }
				)
			},
			{
				action: "cancel",
				label: localizeOrFallback("Cancel", "Cancel"),
				icon: "fas fa-times"
			}
		],
		render: (...args) => {
			const dialog = args.find(a => a && (a.element || a.form)) ?? args[1] ?? args[0];
			bindCombinedRecoveryDialogInteractions(dialog);
		}
	});
	return coerceStarshipCombinedPowerRecoveryDialogResult(result);
}

async function postCombinedRecoveryChat(actor, { recovered, allocations, slots }) {
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const lines = STARSHIP_POWER_DIE_SLOTS
		.filter(key => (allocations[key] ?? 0) > 0)
		.map(key => {
			const label = byKey[key]?.label ?? key;
			const amount = allocations[key];
			return localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerRecoveryChatPoolLine",
				"{label}: +{amount}",
				{ label, amount }
			);
		});
	if ( !lines.length ) return;
	const heading = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerRecoveryChatHeading",
		"{name} recovered {recovered} Power Dice",
		{ name: actor?.name ?? "", recovered }
	);
	await ChatMessage.create({
		speaker: ChatMessage.getSpeaker({ actor }),
		flavor: localizeOrFallback("SW5E.PowerDiceRecovery", "Power Dice Recovery"),
		content: `<p>${escapeHtml(heading)}</p><ul>${lines.map(l => `<li>${escapeHtml(l)}</li>`).join("")}</ul>`,
		flags: { sw5e: { roll: { type: "pwrDieRecAlloc" } } }
	});
}

/**
 * Apply a validated combined allocation after live revalidation.
 * @returns {Promise<boolean>}
 */
export async function applyCombinedPowerDiceRecovery(actor, planned) {
	if ( !actor || !planned?.ok ) return false;
	const liveSlots = getStarshipPowerRecoverySlots(actor);
	const recheck = validateStarshipCombinedPowerRecoveryAllocation({
		recoveredAvailable: planned.recovered,
		slots: liveSlots,
		selected: Object.fromEntries(
			STARSHIP_POWER_DIE_SLOTS.map(key => [key, (planned.allocations?.[key] ?? 0) > 0])
		),
		quantities: planned.allocations
	});
	if ( !recheck.ok ) {
		const staleCodes = new Set([
			"exceedsHeadroom",
			"underAllocated",
			"overAllocated",
			"noneAllocated",
			"ineligibleNonzero",
			"uncheckedNonzero"
		]);
		warnStarshipCombinedPowerRecoveryValidation({
			ok: false,
			code: staleCodes.has(recheck.code) ? "stale" : recheck.code
		});
		return false;
	}

	const updates = buildStarshipPowerRecoveryUpdatesFromAllocations(liveSlots, recheck.allocations);
	if ( !Object.keys(updates).length ) return false;

	for ( const [slotKey, newValue] of Object.entries(updates) ) {
		await recordStarshipPowerSlotPeak(actor, slotKey, newValue);
	}
	const payload = buildStarshipPowerRecoveryValueUpdate(updates);
	await actor.update(payload);
	await postCombinedRecoveryChat(actor, {
		recovered: recheck.recovered,
		allocations: recheck.allocations,
		slots: liveSlots
	});
	return true;
}

/* —— Legacy Central-first (Regen isolation) —— */

async function promptManualRecoveryAmountLegacy() {
	const DialogV2 = foundry.applications.api.DialogV2;
	const hint = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryHint",
		"Manual recovery — no equipped reactor recovery formula was found."
	);
	const label = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerManualRecoveryAmount",
		"Recovered dice"
	);
	const content = `<div class="sw5e-starship-power-recovery-manual">
		<p class="notes">${escapeHtml(hint)}</p>
		<div class="form-group">
			<label for="sw5e-power-recovery-amount">${escapeHtml(label)}</label>
			<input id="sw5e-power-recovery-amount" name="${STARSHIP_POWER_RECOVERY_AMOUNT_FIELD}" type="number" min="1" step="1" value="1" />
		</div>
	</div>`;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerManualRecoveryTitle", "Manual Power Recovery")
		},
		content,
		position: { width: 380 },
		buttons: [
			{
				action: "recover",
				label: localizeOrFallback("SW5E.StarshipSheet.AdvancedPowerRecover", "Recover Power"),
				icon: "fas fa-bolt",
				default: true,
				callback: starshipPowerRecoveryManualDialogCallback
			},
			{ action: "cancel", label: localizeOrFallback("Cancel", "Cancel"), icon: "fas fa-times" }
		]
	});
	return coerceStarshipPowerRecoveryManualDialogResult(result);
}

async function promptCheckboxAllocation(actor, slots, count) {
	const allocatable = slots.filter(slot => !slot.isFull);
	if ( !allocatable.length ) return null;
	const intro = localizeOrFallback(
		"SW5E.StarshipSheet.AdvancedPowerAllocateIntro",
		"Allocate {count} recovered power dice to available subsystem pools.",
		{ count }
	);
	const rows = allocatable.map(slot => {
		const poolLabel = localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerSlotPool",
			"{label}: {current} / {max}",
			{ label: slot.label, current: slot.value, max: slot.allocationMax }
		);
		return `<div class="form-group sw5e-starship-power-alloc-row">
			<label for="sw5e-power-alloc-${escapeHtml(slot.key)}">${escapeHtml(poolLabel)}</label>
			<input id="sw5e-power-alloc-${escapeHtml(slot.key)}" type="checkbox" name="${escapeHtml(slot.key)}" />
		</div>`;
	}).join("");
	const DialogV2 = foundry.applications.api.DialogV2;
	const result = await DialogV2.wait({
		rejectClose: false,
		window: {
			title: `${localizeOrFallback("SW5E.AllocatePowerDice", "Allocate Power Dice")}: ${actor.name}`
		},
		content: `<div class="sw5e-starship-power-recovery-allocate"><p class="notes">${escapeHtml(intro)}</p>${rows}</div>`,
		position: { width: 420 },
		buttons: [
			{
				action: "allocate",
				label: localizeOrFallback("SW5E.AllocatePowerDice", "Allocate Power Dice"),
				icon: "fas fa-wrench",
				default: true,
				callback: (event, button, dialog) => starshipPowerAllocationDialogCallback(
					event, button, dialog, allocatable, count
				)
			},
			{ action: "cancel", label: localizeOrFallback("Cancel", "Cancel"), icon: "fas fa-times" }
		]
	});
	return coerceStarshipPowerAllocationDialogResult(result, allocatable.map(s => s.key));
}

export async function applyPowerDiceRecovery(actor, recoveredAmount) {
	const slots = getStarshipPowerRecoverySlots(actor);
	const byKey = Object.fromEntries(slots.map(slot => [slot.key, slot]));
	const plan = planStarshipPowerDiceRecovery(slots, recoveredAmount);

	if ( plan.mode === "noop" ) return false;
	if ( plan.mode === "no-allocatable" ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerNoAllocatableSlots",
			"No subsystem pools can accept recovered dice."
		));
		return false;
	}

	const updates = { ...plan.updates };
	if ( plan.mode === "central-then-allocate" ) {
		if ( plan.toAllocate > plan.allocatable.length ) {
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerAllocateMoreThanPools",
				"Cannot place {count} recovered dice: only {available} subsystem pools have headroom (one die per pool per recovery).",
				{ count: plan.toAllocate, available: plan.allocatable.length }
			));
			return false;
		}
		const allocation = await promptCheckboxAllocation(actor, plan.allocatable, plan.toAllocate);
		if ( !allocation ) return false;
		for ( const slotKey of allocation ) {
			updates[slotKey] = (byKey[slotKey]?.value ?? 0) + 1;
		}
	}

	for ( const [slotKey, newValue] of Object.entries(updates) ) {
		if ( !STARSHIP_POWER_DIE_SLOTS.includes(slotKey) ) continue;
		await recordStarshipPowerSlotPeak(actor, slotKey, newValue);
	}
	const payload = buildStarshipPowerRecoveryValueUpdate(updates);
	if ( !Object.keys(payload).length ) return false;
	await actor.update(payload);
	return true;
}

async function recoverWithPromptAllocation(actor) {
	const slots = getStarshipPowerRecoverySlots(actor);
	const { totalMissing } = getStarshipPowerRecoverySummary(actor);
	const formula = await getStarshipPowerRecoveryFormula(actor);

	let fixedRecovered = null;
	let manualAmountEditable = false;

	if ( formula ) {
		const rolled = await rollRecoveryFormula(actor, formula);
		if ( !Number.isFinite(rolled) || rolled <= 0 ) {
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerRecoveryNone",
				"No power dice were recovered."
			));
			return false;
		}
		fixedRecovered = clampStarshipPowerRecoveryAmount(rolled, totalMissing);
		if ( fixedRecovered <= 0 ) {
			ui.notifications?.warn?.(localizeOrFallback(
				"SW5E.StarshipSheet.AdvancedPowerRecoveryNone",
				"No power dice were recovered."
			));
			return false;
		}
	} else {
		manualAmountEditable = true;
	}

	const planned = await promptCombinedPowerRecovery(actor, {
		slots,
		manualAmountEditable,
		fixedRecovered
	});
	if ( !planned ) return false;
	return applyCombinedPowerDiceRecovery(actor, planned);
}

async function recoverWithLegacyCentralFirst(actor) {
	const { totalMissing } = getStarshipPowerRecoverySummary(actor);
	const formula = await getStarshipPowerRecoveryFormula(actor);
	let recoveredAmount = 0;
	if ( formula ) {
		recoveredAmount = await rollRecoveryFormula(actor, formula);
	} else {
		const manual = await promptManualRecoveryAmountLegacy();
		if ( manual === null || manual === undefined ) return false;
		recoveredAmount = manual;
	}
	if ( !Number.isFinite(recoveredAmount) || recoveredAmount <= 0 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerRecoveryNone",
			"No power dice were recovered."
		));
		return false;
	}
	const recoverable = clampStarshipPowerRecoveryAmount(recoveredAmount, totalMissing);
	if ( recoverable <= 0 ) {
		ui.notifications?.warn?.(localizeOrFallback(
			"SW5E.StarshipSheet.AdvancedPowerRecoveryNone",
			"No power dice were recovered."
		));
		return false;
	}
	return applyPowerDiceRecovery(actor, recoverable);
}

/**
 * @param {Actor} actor
 * @param {object} [options]
 * @param {boolean} [options.notifyFullCapacity=true]
 * @param {"prompt"|"legacyCentralFirst"} [options.allocationMode="prompt"]
 *   Explicit sheet Recover uses "prompt" (combined multi-pool dialog).
 *   Regen must pass "legacyCentralFirst" to preserve historical auto Central-first flow.
 */
export async function recoverStarshipPowerDice(actor, {
	notifyFullCapacity = true,
	allocationMode = STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_PROMPT
} = {}) {
	if ( !actor ) return false;

	const { totalMissing } = getStarshipPowerRecoverySummary(actor);
	if ( totalMissing <= 0 ) {
		return notifyOrSkipStarshipPowerRecoveryFullCapacity({ notifyFullCapacity });
	}

	if ( allocationMode === STARSHIP_POWER_RECOVERY_ALLOCATION_MODE_LEGACY ) {
		return recoverWithLegacyCentralFirst(actor);
	}
	return recoverWithPromptAllocation(actor);
}
