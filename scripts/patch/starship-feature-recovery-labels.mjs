/**
 * Starship Feature recovery terminology — Item sheet + Features-tab wiring.
 */

import { getModuleId, getModulePath } from "../module-support.mjs";
import {
	buildStarshipRecoveryCompactLabel,
	cloneStarshipRecoveryPeriodChoices,
	isSw5eStarshipFeatureItem
} from "../starship-feature-recovery-labels.mjs";

let itemSheetRecoveryLabelsWrapped = false;

export function getStarshipRecoveryColumnTemplatePath() {
	return getModulePath("templates/inventory/columns/starship-recovery.hbs");
}

/**
 * Features-tab column descriptors: stock Uses + Starship Recovery template + controls.
 * @returns {Array<string|{id: string, order?: number, template?: string}>}
 */
export function getStarshipFeaturesFeatColumns() {
	return [
		{ id: "uses", order: 200 },
		{ id: "recovery", template: getStarshipRecoveryColumnTemplatePath() },
		"controls"
	];
}

/**
 * Apply Starship-only compact Recovery label onto Features row context.
 * Does not mutate `item.labels.recovery`.
 * @param {Item} item
 * @param {object} ctx
 */
export function applyStarshipFeatureRecoveryRowContext(item, ctx) {
	if ( !ctx || typeof ctx !== "object" ) return;
	if ( !isSw5eStarshipFeatureItem(item) ) return;
	ctx.starshipRecoveryLabel = buildStarshipRecoveryCompactLabel(item);
}

/**
 * Remap Item Details Recovery Period dropdown labels for Starship Features only.
 */
export function registerStarshipFeatureRecoveryLabelWrappers() {
	if ( itemSheetRecoveryLabelsWrapped ) return;
	itemSheetRecoveryLabelsWrapped = true;

	const moduleId = getModuleId();
	try {
		libWrapper.register(moduleId, "dnd5e.applications.item.ItemSheet5e.prototype._prepareDetailsContext", async function(wrapped, context, options) {
			context = await wrapped.call(this, context, options);
			const item = this.item ?? this.document;
			if ( !isSw5eStarshipFeatureItem(item) ) return context;
			context.recoveryPeriods = cloneStarshipRecoveryPeriodChoices(context.recoveryPeriods);
			return context;
		}, "WRAPPER");
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not wrap ItemSheet5e._prepareDetailsContext for Starship recovery labels.", err);
	}
}

export function patchStarshipFeatureRecoveryLabels() {
	registerStarshipFeatureRecoveryLabelWrappers();
}
