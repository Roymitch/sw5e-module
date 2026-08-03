/**
 * EDIT-mode Ship’s Stores configuration dialog (Fuel + Food eight-field save).
 * Six numeric attributes dual-write via legacy mirror; cost modes use
 * flags.sw5e.starship.{fuel|food}.replenishCostMode (no legacy mirror).
 * All eight values are Actor-owned and merge into one Actor.update.
 */
import { getModulePath } from "./module-support.mjs";
import {
	buildStarshipLegacyAttributeBatchMirrorUpdate,
	getLegacyStarshipActorSystem
} from "./starship-data.mjs";
import {
	canCurrentUserUpdateStarshipActor,
	warnStarshipActorUpdateDenied
} from "./starship-permissions.mjs";
import {
	STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG,
	STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG,
	STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK,
	STARSHIP_REPLENISH_COST_MODE_PER_UNIT,
	normalizeStarshipNonNegativeInt
} from "./starship-replenish-math.mjs";
import {
	buildStarshipReplenishCostModeUpdate,
	localizeStarshipReplenishCostModeLabel,
	resolveActorStarshipReplenishCostMode,
	validateStarshipReplenishCostModeSubmission
} from "./starship-replenish-cost-mode.mjs";

const SHIPS_STORES_FIELD_PATHS = Object.freeze([
	"system.attributes.fuel.value",
	"system.attributes.fuel.fuelCap",
	"system.attributes.fuel.cost",
	"system.attributes.food.value",
	"system.attributes.food.foodCap",
	"system.attributes.food.cost"
]);

/** Form field names for Fuel/Food cost modes (exact Actor flag paths). */
export const SHIPS_STORES_FUEL_COST_MODE_PATH = STARSHIP_FUEL_REPLENISH_COST_MODE_FLAG;
export const SHIPS_STORES_FOOD_COST_MODE_PATH = STARSHIP_FOOD_REPLENISH_COST_MODE_FLAG;

/** Display order for mode options (locked Gate C-R2 dialog). */
export const SHIPS_STORES_COST_MODE_OPTION_VALUES = Object.freeze([
	STARSHIP_REPLENISH_COST_MODE_PER_UNIT,
	STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK
]);

function localizeOrFallback(key, fallback) {
	const localized = game.i18n.localize(key);
	return localized && localized !== key ? localized : fallback;
}

/**
 * Strict non-negative integer parse for Ship’s Stores config.
 * Empty / non-numeric / negative → reject (no write).
 * Zero is valid.
 * @param {unknown} raw
 * @returns {{ ok: true, value: number } | { ok: false }}
 */
export function parseStarshipShipsStoresConfigNumber(raw) {
	const text = String(raw ?? "").trim();
	if ( !text ) return { ok: false };
	if ( !/^-?\d+(?:\.\d+)?$/.test(text) ) return { ok: false };
	const numeric = Number(text);
	if ( !Number.isFinite(numeric) ) return { ok: false };
	const truncated = Math.trunc(numeric);
	if ( truncated !== numeric ) return { ok: false };
	if ( truncated < 0 ) return { ok: false };
	return { ok: true, value: truncated };
}

/**
 * Build dual-write payload for the six numeric Fuel/Food attribute paths.
 * @param {Record<string, number>} values
 * @returns {object}
 */
export function buildStarshipShipsStoresConfigUpdate(values) {
	return buildStarshipLegacyAttributeBatchMirrorUpdate(
		SHIPS_STORES_FIELD_PATHS.map(path => [path, values[path]])
	);
}

/**
 * Build cost-mode option rows for the dialog select (display fallback selected; no write).
 * @param {string} selectedMode Effective mode (`perUnit` | `perRestock`)
 * @returns {{ value: string, label: string, selected: boolean }[]}
 */
export function buildStarshipShipsStoresCostModeOptions(selectedMode) {
	const selected = validateStarshipReplenishCostModeSubmission(selectedMode)
		?? STARSHIP_REPLENISH_COST_MODE_PER_RESTOCK;
	return SHIPS_STORES_COST_MODE_OPTION_VALUES.map(value => ({
		value,
		label: localizeStarshipReplenishCostModeLabel(value),
		selected: value === selected
	}));
}

/**
 * Merge numeric dual-write + optional Fuel/Food mode flag writes into one Actor payload.
 * Invalid modes → `{ ok: false }`. Unchanged modes omit flag keys (no dirty write of fallback).
 *
 * @param {Actor} actor
 * @param {Record<string, number>} numericValues
 * @param {unknown} fuelModeRaw
 * @param {unknown} foodModeRaw
 * @returns {{ ok: true, update: object, fuelMode: string, foodMode: string } | { ok: false, reason: string }}
 */
export function buildStarshipShipsStoresConfigSaveUpdate(actor, numericValues, fuelModeRaw, foodModeRaw) {
	const fuelMode = validateStarshipReplenishCostModeSubmission(fuelModeRaw);
	const foodMode = validateStarshipReplenishCostModeSubmission(foodModeRaw);
	if ( !fuelMode || !foodMode ) return { ok: false, reason: "invalidMode" };

	const update = buildStarshipShipsStoresConfigUpdate(numericValues);
	const fuelPlanned = buildStarshipReplenishCostModeUpdate(actor, "fuel", fuelMode);
	const foodPlanned = buildStarshipReplenishCostModeUpdate(actor, "food", foodMode);
	if ( fuelPlanned ) Object.assign(update, fuelPlanned.update);
	if ( foodPlanned ) Object.assign(update, foodPlanned.update);
	return { ok: true, update, fuelMode, foodMode };
}

/**
 * Read current stored Fuel/Food values + effective cost modes for dialog preload.
 * Mode display uses resolve fallback; does not write.
 * @param {Actor} actor
 */
export function readStarshipShipsStoresConfigValues(actor) {
	const legacy = getLegacyStarshipActorSystem(actor);
	const fuel = legacy?.attributes?.fuel ?? {};
	const food = legacy?.attributes?.food ?? {};
	const systemFuel = actor?.system?.attributes?.fuel ?? {};
	const systemFood = actor?.system?.attributes?.food ?? {};
	const fuelMode = resolveActorStarshipReplenishCostMode(actor, "fuel");
	const foodMode = resolveActorStarshipReplenishCostMode(actor, "food");
	return {
		fuel: {
			value: normalizeStarshipNonNegativeInt(systemFuel.value ?? fuel.value) ?? 0,
			fuelCap: normalizeStarshipNonNegativeInt(systemFuel.fuelCap ?? fuel.fuelCap) ?? 0,
			cost: normalizeStarshipNonNegativeInt(systemFuel.cost ?? fuel.cost) ?? 0,
			replenishCostMode: fuelMode,
			costModeOptions: buildStarshipShipsStoresCostModeOptions(fuelMode)
		},
		food: {
			value: normalizeStarshipNonNegativeInt(systemFood.value ?? food.value) ?? 0,
			foodCap: normalizeStarshipNonNegativeInt(systemFood.foodCap ?? food.foodCap) ?? 0,
			cost: normalizeStarshipNonNegativeInt(systemFood.cost ?? food.cost) ?? 0,
			replenishCostMode: foodMode,
			costModeOptions: buildStarshipShipsStoresCostModeOptions(foodMode)
		}
	};
}

function createStarshipShipsStoresConfigAppClass() {
	const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
	return class StarshipShipsStoresConfigApp extends HandlebarsApplicationMixin(ApplicationV2) {
		constructor({ actor } = {}) {
			super();
			this.actor = actor;
			this.#submitting = false;
		}

		#submitting;

		static DEFAULT_OPTIONS = {
			tag: "section",
			classes: ["config-sheet", "sw5e-starship-ships-stores-config"],
			window: { resizable: true },
			position: { width: 420, height: "auto" }
		};

		static PARTS = {
			config: { template: getModulePath("templates/apps/starship-ships-stores-config.hbs") }
		};

		get title() {
			return localizeOrFallback("SW5E.StarshipSheet.ConfigureShipsStores", "Configure Ship’s Stores");
		}

		async _prepareContext() {
			const values = readStarshipShipsStoresConfigValues(this.actor);
			return {
				...values,
				fuelCostModePath: SHIPS_STORES_FUEL_COST_MODE_PATH,
				foodCostModePath: SHIPS_STORES_FOOD_COST_MODE_PATH,
				submitting: this.#submitting,
				labels: {
					fuelLegend: localizeOrFallback("SW5E.Fuel", "Fuel"),
					foodLegend: localizeOrFallback("SW5E.Food", "Food"),
					fuelCurrent: localizeOrFallback("SW5E.StarshipFuelFieldCurrent", "Current Fuel"),
					fuelCap: localizeOrFallback("SW5E.FuelCap", "Fuel Capacity"),
					fuelCost: localizeOrFallback("SW5E.FuelCost", "Regeneration Cost"),
					fuelCostMode: localizeOrFallback(
						"SW5E.StarshipSheet.FuelRegenerationCostMode",
						"Regeneration Cost Mode"
					),
					foodCurrent: localizeOrFallback("SW5E.StarshipSheet.FoodCurrent", "Current Food"),
					foodCapacity: localizeOrFallback("SW5E.StarshipSheet.FoodCapacity", "Food Capacity"),
					foodRestockCost: localizeOrFallback("SW5E.StarshipSheet.FoodRestockCost", "Restock Cost"),
					foodCostMode: localizeOrFallback(
						"SW5E.StarshipSheet.FoodRestockCostMode",
						"Restock Cost Mode"
					),
					save: localizeOrFallback("DND5E.Save", "Save")
				}
			};
		}

		_onRender(context, options) {
			super._onRender(context, options);
			const root = this.element instanceof HTMLElement ? this.element : this.element?.[0] ?? null;
			const form = root?.querySelector("form.sw5e-starship-ships-stores-config-form");
			if ( !form || form.dataset.sw5eBound === "true" ) return;
			form.dataset.sw5eBound = "true";
			form.addEventListener("submit", this.#onSubmit.bind(this));
		}

		async #onSubmit(event) {
			event.preventDefault();
			if ( this.#submitting ) return;
			const actor = this.actor;
			if ( !actor ) return;
			if ( !canCurrentUserUpdateStarshipActor(actor) ) {
				warnStarshipActorUpdateDenied();
				return;
			}

			const formData = new FormData(event.currentTarget);
			const parsed = {};
			for ( const path of SHIPS_STORES_FIELD_PATHS ) {
				const result = parseStarshipShipsStoresConfigNumber(formData.get(path));
				if ( !result.ok ) {
					ui.notifications?.warn?.(localizeOrFallback(
						"SW5E.StarshipSheet.ShipsStoresConfigInvalid",
						"Enter non-negative whole numbers for all Ship’s Stores fields."
					));
					return;
				}
				parsed[path] = result.value;
			}

			const planned = buildStarshipShipsStoresConfigSaveUpdate(
				actor,
				parsed,
				formData.get(SHIPS_STORES_FUEL_COST_MODE_PATH),
				formData.get(SHIPS_STORES_FOOD_COST_MODE_PATH)
			);
			if ( !planned.ok ) {
				ui.notifications?.warn?.(localizeOrFallback(
					"SW5E.StarshipSheet.ShipsStoresConfigInvalidMode",
					"Select a valid cost mode for Fuel and Food."
				));
				return;
			}

			this.#submitting = true;
			try {
				await actor.update(planned.update);
				this.close();
			} catch ( err ) {
				console.error("SW5E MODULE | Ship’s Stores configuration update failed.", err);
				ui.notifications?.error?.(localizeOrFallback(
					"SW5E.StarshipSheet.ShipsStoresConfigSaveFailed",
					"Could not save Ship’s Stores."
				));
			} finally {
				this.#submitting = false;
			}
		}
	};
}

/**
 * Open the combined Ship’s Stores configuration dialog.
 * @param {Actor} actor
 */
export function openStarshipShipsStoresConfig(actor) {
	if ( !actor ) return;
	if ( !canCurrentUserUpdateStarshipActor(actor) ) {
		warnStarshipActorUpdateDenied();
		return;
	}
	const StarshipShipsStoresConfigApp = createStarshipShipsStoresConfigAppClass();
	new StarshipShipsStoresConfigApp({ actor }).render(true);
}

export { SHIPS_STORES_FIELD_PATHS };
