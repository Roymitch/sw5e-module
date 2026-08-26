/**
 * Phase 3B / Bug 12 — Slice 3B-4 VehicleData Food schema extension.
 *
 * Adds schema-backed `system.attributes.food` on Starship vehicles only via
 * VehicleData mutation (same timing class as movement FormulaFields).
 * Character / NPC schemas are untouched. Ordinary vehicles gain the fields on
 * the shared VehicleData schema but SW5E Food UI / flags gate on Starship.
 */

const FOOD_ATTRIBUTE_LABEL = "SW5E.Food";

/**
 * Extend dnd5e VehicleData attributes with Food resource fields.
 * Idempotent. Safe no-op if VehicleData schema is unavailable.
 */
export function addStarshipFoodSchemaField() {
	try {
		const attributes = globalThis.dnd5e?.dataModels?.actor?.VehicleData?.schema?.fields?.attributes;
		if ( !attributes?.fields ) return;
		if ( attributes.fields.food ) return;

		const { NumberField, SchemaField } = foundry.data.fields;
		attributes.fields.food = new SchemaField({
			value: new NumberField({
				required: false,
				nullable: false,
				integer: true,
				min: 0,
				initial: 0,
				label: `${FOOD_ATTRIBUTE_LABEL}.Value`
			}),
			foodCap: new NumberField({
				required: false,
				nullable: false,
				integer: true,
				min: 0,
				initial: 0,
				label: `${FOOD_ATTRIBUTE_LABEL}.Cap`
			}),
			foodCapMod: new NumberField({
				required: false,
				nullable: false,
				integer: true,
				initial: 0,
				label: `${FOOD_ATTRIBUTE_LABEL}.CapMod`
			}),
			cost: new NumberField({
				required: false,
				nullable: false,
				integer: true,
				min: 0,
				initial: 0,
				label: `${FOOD_ATTRIBUTE_LABEL}.Cost`
			})
		}, { label: FOOD_ATTRIBUTE_LABEL });
	} catch ( err ) {
		console.warn("SW5E MODULE | Could not add starship food fields to VehicleData schema.", err);
	}
}

/**
 * Register Food schema at init (alongside movement schema registration).
 */
export function registerStarshipFoodSchemaHooks() {
	addStarshipFoodSchemaField();
}
