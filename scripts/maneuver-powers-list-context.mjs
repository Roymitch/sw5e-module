/**
 * Powers-tab Maneuver list-row context + spellbook column helpers (Bug 25 / Phase 0C-A).
 *
 * Column fallback and Time/Range ctx shapes mirror dnd5e 5.2.5 `_prepareSpellbook` /
 * `_prepareItemSpell` exactly. Do not invent descriptor tables or alternate ctx shapes.
 */
import { getModulePath } from "./module-support.mjs";

/**
 * Exact `Inventory.mapColumns` *input* used by dnd5e 5.2.5 `_prepareSpellbook`.
 * Not a final columns array — always pass through `mapColumns` before assigning to a section.
 * @type {ReadonlyArray<string|{id: string, order?: number, priority?: number}>}
 */
export const STOCK_SPELLBOOK_COLUMN_MAP_INPUT = Object.freeze([
	"school",
	"time",
	"range",
	"target",
	"roll",
	Object.freeze({ id: "uses", order: 650, priority: 300 }),
	Object.freeze({ id: "formula", priority: 200 }),
	"controls"
]);

/** Maneuver school column template — superiority.types icons, not spellSchools. */
export const MANEUVER_TYPE_COLUMN_TEMPLATE = getModulePath("templates/inventory/columns/maneuver-type.hbs");

/**
 * Remap the stock school column onto the Maneuver type-icon template.
 * Always returns a new array so Force/Tech section columns are not mutated.
 *
 * @param {object[]} columns
 * @returns {object[]}
 */
export function applyManeuverTypeSchoolColumn(columns) {
	if ( !Array.isArray(columns) ) return [];
	return columns.map(col => {
		if ( !col || col.id !== "school" ) return col;
		return { ...col, template: MANEUVER_TYPE_COLUMN_TEMPLATE };
	});
}

/**
 * Resolve inventory column descriptors for Maneuver spellbook sections.
 * Prefer a non-empty prepared Force/Tech section columns array; otherwise map the stock
 * spellbook input via the sheet's inventory element class.
 * School column always points at the Maneuver type-icon template.
 *
 * @param {unknown[]} existingColumns  Columns already on the first spellbook section, if any.
 * @param {object} [sheet]             Actor sheet application (`options.elements.inventory`).
 * @returns {object[]}
 */
export function resolveManeuverSpellbookColumns(existingColumns, sheet) {
	let columns;
	if ( Array.isArray(existingColumns) && existingColumns.length ) {
		columns = existingColumns;
	} else {
		const tag = sheet?.options?.elements?.inventory ?? "dnd5e-inventory";
		const Inventory = globalThis.customElements?.get?.(tag);
		if ( typeof Inventory?.mapColumns !== "function" ) {
			console.warn(
				"SW5E | Maneuver Powers-tab columns: inventory mapColumns unavailable;",
				`tag=${tag}`
			);
			return applyManeuverTypeSchoolColumn(Array.isArray(existingColumns) ? existingColumns : []);
		}
		columns = Inventory.mapColumns([...STOCK_SPELLBOOK_COLUMN_MAP_INPUT]);
	}

	return applyManeuverTypeSchoolColumn(columns);
}

/**
 * Enrich Maneuver inventory row context for Time/Range columns.
 * Mirrors dnd5e 5.2.5 `BaseActorSheet#_prepareItemSpell` activation/range branches.
 * Does not invent target/roll/uses (those come from stock `_prepareItem`).
 *
 * @param {Item} item
 * @param {object} ctx
 */
export function enrichManeuverListRowContext(item, ctx) {
	if ( !item || !ctx || (typeof ctx !== "object") ) return;

	const cost = item.system?.activation?.value ?? "";
	const abbr = {
		action: "DND5E.ActionAbbr",
		bonus: "DND5E.BonusActionAbbr",
		reaction: "DND5E.ReactionAbbr",
		minute: "DND5E.TimeMinuteAbbr",
		hour: "DND5E.TimeHourAbbr",
		day: "DND5E.TimeDayAbbr"
	}[item.system?.activation?.type];
	ctx.activation = abbr
		? `${cost}${game.i18n.localize(abbr)}`
		: item.labels?.activation;

	const units = item.system?.range?.units;
	if ( !units || (units === "none") ) return;

	if ( units in (CONFIG.DND5E.movementUnits ?? {}) ) {
		const formatLength = globalThis.dnd5e?.utils?.formatLength;
		ctx.range = {
			distance: true,
			value: item.system.range.value,
			unit: CONFIG.DND5E.movementUnits[units].abbreviation,
			parts: typeof formatLength === "function"
				? formatLength(item.system.range.value, units, { parts: true })
				: undefined
		};
	}
	else ctx.range = { distance: false };
}
