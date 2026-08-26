import { getModulePath } from "./module-support.mjs";

/**
 * Define a set of template paths to pre-load. Pre-loaded templates are compiled and cached for fast access when
 * rendering. These paths will also be available as Handlebars partials by using the file name
 * (e.g. "sw5e.actor-traits").
 * @returns {Promise}
 */
async function preloadHandlebarsTemplates() {
	const partials = [
		// Item Sheet Partials
		getModulePath("templates/items/details/details-equipment.hbs"),
		getModulePath("templates/items/details/details-maneuver.hbs"),
		getModulePath("templates/items/description-maneuver.hbs"),
		getModulePath("templates/items/parts/maneuver-block.hbs"),
		getModulePath("templates/items/chassis-panel.hbs"),
		getModulePath("templates/items/chassis-install-browser.hbs"),
		getModulePath("templates/apps/augmentations-manager.hbs"),
		getModulePath("templates/apps/droid-customizations-manager.hbs"),
		// Actor sheet meters (preload so equip-driven rerenders avoid template compile)
		getModulePath("templates/powercasting-sheet-tracker.hbs"),
		getModulePath("templates/superiority-sheet-tracker.hbs"),
		// Starship sheet / sidebar (every starship open/remount; optional vital/repair apps stay on-demand)
		getModulePath("templates/starship-sheet-layer.hbs"),
		getModulePath("templates/starship-sidebar-vitals.hbs"),
		getModulePath("templates/starship-sidebar-system-damage.hbs"),
		getModulePath("templates/starship-sidebar-destruction-saves.hbs"),
		getModulePath("templates/starship-sidebar-movement.hbs"),
		getModulePath("templates/starship-sidebar-damage-reduction.hbs"),
		getModulePath("templates/starship-sidebar-max-fires.hbs"),
		getModulePath("templates/starship-warnings-dialog.hbs"),
		getModulePath("templates/starship-attack-crew-picker.hbs"),
		getModulePath("templates/inventory/columns/starship-recovery.hbs")
	];

	const paths = {};
	for (const path of partials) {
		paths[path.replace(".hbs", ".html")] = path;
		const baseName = path.split("/").pop().replace(".hbs", "");
		paths[`sw5e.${baseName}`] = path;
		if ( baseName.startsWith("details-") ) paths[`dnd5e.${baseName}`] = path;
	}

	return foundry.applications.handlebars.loadTemplates(paths);
}


export function handleTemplates() {
	preloadHandlebarsTemplates();
}