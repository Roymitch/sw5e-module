/**
export { getCompendiumPack } from "./starship-sheet-ids.mjs";
 * Starship item categorization / managed-id helpers (Phase 6 Slice C).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 * Live crew role grouping does not import this module.
 */

import { localizeOrFallback } from "./starship-sheet-html.mjs";
import {
	getCompendiumPack,
	STARSHIP_FEATURES_TAB_ID,
	STARSHIP_TAB_ID,
	STOCK_CARGO_TAB_ID
} from "./starship-sheet-ids.mjs";


export function resolveStarshipItemGroup(item) {
	const pack = getCompendiumPack(item);
	const featType = item.system?.type?.value;
	const role = item.flags?.sw5e?.starshipCharacter?.role;
	const isStarshipWeapon = pack === "starshipweapons" || item.type === "weapon";
	const isStarshipEquipment = pack === "starshiparmor" || pack === "starshipequipment";

	if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) return "systems";
	if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) return "modifications";
	if ( featType === "starshipAction" || pack === "starshipactions" ) return "actions";
	if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) return null;
	if ( featType === "starship" || pack === "starshipfeatures" ) return "systems";
	if ( isStarshipWeapon ) return "weapons";
	if ( isStarshipEquipment || item.type === "equipment" ) return "equipment";
	return null;
}

export function categorizeStarshipItems(actor) {
	const groups = {
		size: { label: localizeOrFallback("TYPES.Item.starshipsizePl", "Starship Size"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: false },
		actions: { label: localizeOrFallback("SW5E.Feature.StarshipAction.LabelPl", "Starship Actions"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: true },
		roles: { label: localizeOrFallback("SW5E.Feature.Deployment.Label", "Crew Roles"), items: [], defaultTab: STARSHIP_TAB_ID, manageLabel: "Core", scrollTo: STARSHIP_TAB_ID, sotgPanel: "overview", showEconomy: false },
		features: { label: localizeOrFallback("SW5E.Feature.Starship.Label", "Starship Features"), items: [], defaultTab: STARSHIP_FEATURES_TAB_ID, manageLabel: "Features", scrollTo: STARSHIP_FEATURES_TAB_ID, sotgPanel: null, showEconomy: false },
		equipment: { label: localizeOrFallback("SW5E.Equipment", "Equipment"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true },
		modifications: { label: localizeOrFallback("TYPES.Item.starshipmodPl", "Modifications"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true },
		weapons: { label: localizeOrFallback("SW5E.Weapon", "Weapons"), items: [], defaultTab: STOCK_CARGO_TAB_ID, manageLabel: "Inventory", scrollTo: STOCK_CARGO_TAB_ID, sotgPanel: null, showEconomy: true }
	};

	for ( const item of actor.items ) {
		const pack = getCompendiumPack(item);
		const featType = item.system?.type?.value;
		const role = item.flags?.sw5e?.starshipCharacter?.role;
		const isStarshipWeapon = pack === "starshipweapons" || item.type === "weapon";
		const isStarshipEquipment = pack === "starshiparmor" || pack === "starshipequipment";

		if ( item.flags?.sw5e?.legacyStarshipSize || role === "classification" ) groups.size.items.push(item);
		else if ( item.flags?.sw5e?.legacyStarshipMod || role === "modification" || pack === "starshipmodifications" ) groups.modifications.items.push(item);
		else if ( featType === "starshipAction" || pack === "starshipactions" ) groups.actions.items.push(item);
		else if ( featType === "deployment" || role === "deployment" || role === "venture" || pack === "deployments" || pack === "deploymentfeatures" || pack === "ventures" ) groups.roles.items.push(item);
		else if ( featType === "starship" || pack === "starshipfeatures" ) groups.features.items.push(item);
		else if ( isStarshipWeapon ) groups.weapons.items.push(item);
		else if ( isStarshipEquipment || item.type === "equipment" ) groups.equipment.items.push(item);
	}

	return groups;
}

export function getStarshipInventoryManagedItemIds(actor, categorized = null) {
	const groups = categorized ?? categorizeStarshipItems(actor);
	return new Set(["weapons", "equipment", "modifications"].flatMap(key => groups[key]?.items?.map(item => item.id) ?? []));
}

export function getStarshipFeaturesManagedItemIds(actor, categorized = null) {
	const groups = categorized ?? categorizeStarshipItems(actor);
	return new Set(["actions", "size", "features"].flatMap(key => groups[key]?.items?.map(item => item.id) ?? []));
}

export function getStarshipInventoryExcludedItemIds(actor, categorized = null) {
	return getStarshipFeaturesManagedItemIds(actor, categorized);
}

export function getStarshipFeaturesExcludedFromFeaturesTab(actor, categorized = null) {
	const groups = categorized ?? categorizeStarshipItems(actor);
	return new Set(groups.roles?.items?.map(item => item.id) ?? []);
}

