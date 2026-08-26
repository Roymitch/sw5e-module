import { getModulePath, isModuleType } from "../module-support.mjs";

/**
 * Default sheet for SW5e module Item types (currently Maneuver).
 * AppV2 PARTS drive rendering; legacy `get template()` is unused by ItemSheet5e PARTS.
 */
export class ItemSheetSW5E extends globalThis.dnd5e.applications.item.ItemSheet5e {
	/** @inheritdoc */
	get template() {
		const itemType = this.item.type?.split(".").at(-1) ?? this.item.type;
		return getModulePath(`templates/items/${itemType}.hbs`);
	}

	/* -------------------------------------------- */

	/**
	 * Maneuver-only Description PART: module template with casting summary + stock description cards.
	 * Force/Tech and other Item sheets keep stock `description.hbs`.
	 * @inheritDoc
	 */
	_configureRenderParts(options) {
		const parts = super._configureRenderParts(options);
		if ( isModuleType(this.document.type, "maneuver") && parts.description ) {
			parts.description = {
				...parts.description,
				template: getModulePath("templates/items/description-maneuver.hbs")
			};
		}
		return parts;
	}
}
