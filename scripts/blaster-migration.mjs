const BLASTER_AMMO_TYPES = new Set(["powerCell", "cartridge"]);

/**
 * @param {object} itemData
 * @returns {string[]}
 */
export function getBlasterAmmoTypes(itemData) {
	const types = itemData?.system?.ammo?.types;
	if ( Array.isArray(types) && types.length ) return types;
	const legacyTypes = itemData?.flags?.sw5e?.reload?.types;
	return Array.isArray(legacyTypes) ? legacyTypes : [];
}

/**
 * @param {object} itemData
 * @returns {number}
 */
export function getBlasterReloadMax(itemData) {
	const usesMax = Number(itemData?.system?.uses?.max);
	if ( Number.isFinite(usesMax) && usesMax > 0 ) return usesMax;

	const ammoMax = Number(itemData?.system?.ammo?.max);
	if ( Number.isFinite(ammoMax) && ammoMax > 0 ) return ammoMax;

	const systemRel = Number(itemData?.system?.properties?.rel ?? itemData?.system?.properties?.ovr);
	if ( Number.isFinite(systemRel) && systemRel > 0 ) return systemRel;

	const flagRel = Number(
		itemData?.flags?.sw5e?.properties?.rel
		?? itemData?.flags?.sw5e?.properties?.reload
		?? itemData?.flags?.sw5e?.properties?.ovr
	);
	return Number.isFinite(flagRel) && flagRel > 0 ? flagRel : 0;
}

/**
 * @param {object} itemData
 * @returns {boolean}
 */
export function isManagedBlasterItemData(itemData) {
	if ( itemData?.type !== "weapon" ) return false;
	if ( getBlasterReloadMax(itemData) <= 0 ) return false;
	return getBlasterAmmoTypes(itemData).some(type => BLASTER_AMMO_TYPES.has(type));
}

/**
 * @param {object} itemData
 * @param {string} key
 * @returns {number}
 */
function getPropertyNumber(itemData, key) {
	const value = Number(itemData?.flags?.sw5e?.properties?.[key]);
	return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * @param {object} activity
 * @returns {boolean}
 */
function hasConsumptionTargets(activity) {
	return Array.isArray(activity?.consumption?.targets) && activity.consumption.targets.length > 0;
}

/**
 * @param {object} activity
 * @param {number|string} value
 * @returns {boolean}
 */
function applyItemUsesConsumptionToActivity(activity, value) {
	if ( !activity || hasConsumptionTargets(activity) ) return false;
	const cost = Number(value);
	if ( !Number.isFinite(cost) || cost <= 0 ) return false;

	activity.consumption = {
		targets: [
			{
				type: "itemUses",
				target: "",
				value: String(cost)
			}
		]
	};
	return true;
}

/**
 * Add itemUses consumption to Attack / Rapid / Burst activities when missing.
 * @param {object} itemData
 * @returns {boolean} Whether itemData was changed.
 */
export function applyBlasterItemUsesConsumption(itemData) {
	if ( !isManagedBlasterItemData(itemData) ) return false;

	let changed = false;
	const reloadMax = getBlasterReloadMax(itemData);

	if ( !itemData.system ) itemData.system = {};
	if ( !itemData.system.uses ) itemData.system.uses = {};

	const currentMax = itemData.system.uses.max;
	if ( currentMax == null || currentMax === "" ) {
		itemData.system.uses.max = String(reloadMax);
		changed = true;
	}

	const rapid = getPropertyNumber(itemData, "rapid");
	const burst = getPropertyNumber(itemData, "burst");
	const activities = itemData.system.activities;
	if ( !activities || typeof activities !== "object" ) return changed;

	for ( const activity of Object.values(activities) ) {
		if ( !activity || typeof activity !== "object" ) continue;

		if ( activity.type === "attack" ) {
			if ( applyItemUsesConsumptionToActivity(activity, 1) ) changed = true;
			continue;
		}

		if ( activity.name === "Rapid Attack" ) {
			if ( rapid > 0 && applyItemUsesConsumptionToActivity(activity, rapid) ) changed = true;
			continue;
		}

		if ( activity.name === "Burst Attack" ) {
			if ( burst > 0 && applyItemUsesConsumptionToActivity(activity, burst) ) changed = true;
		}
	}

	return changed;
}

/**
 * Map legacy magazine remaining to dnd5e uses.spent when spent is unset.
 * @param {object} itemData
 * @param {object} updateData
 * @returns {object}
 */
export function migrateBlasterLegacyUsesSpent(itemData, updateData) {
	if ( !isManagedBlasterItemData(itemData) ) return updateData;

	const spent = itemData?.system?.uses?.spent;
	if ( spent != null && spent !== "" ) return updateData;

	const max = Number(updateData["system.uses.max"] ?? itemData?.system?.uses?.max ?? getBlasterReloadMax(itemData));
	if ( !Number.isFinite(max) || max <= 0 ) return updateData;

	const legacyRemaining = Number(
		itemData?.flags?.sw5e?.reload?.value
		?? itemData?.system?.ammo?.value
	);
	if ( !Number.isFinite(legacyRemaining) ) return updateData;

	const clampedRemaining = Math.max(0, Math.min(max, legacyRemaining));
	const computedSpent = Math.max(0, Math.min(max, max - clampedRemaining));
	updateData["system.uses.spent"] = computedSpent;

	return updateData;
}

/**
 * World migration entry point for managed blaster weapons.
 * @param {object} itemData
 * @param {object} updateData
 * @returns {object}
 */
export function migrateBlasterWeaponData(itemData, updateData) {
	if ( !isManagedBlasterItemData(itemData) ) return updateData;

	const consumptionChanged = applyBlasterItemUsesConsumption(itemData);
	if ( consumptionChanged && itemData.system?.activities ) {
		updateData["system.activities"] = foundry.utils.deepClone(itemData.system.activities);
	}

	const usesMax = itemData?.system?.uses?.max;
	if ( usesMax != null && usesMax !== "" && updateData["system.uses.max"] == null ) {
		updateData["system.uses.max"] = String(usesMax);
	}

	migrateBlasterLegacyUsesSpent(itemData, updateData);

	return updateData;
}
