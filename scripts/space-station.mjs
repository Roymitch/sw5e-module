import { getModuleSettingValue, SETTINGS_NAMESPACE } from "./module-support.mjs";

/** World setting: when false, station variant flag is ignored for derive overrides. */
export const SPACE_STATION_VARIANT_SETTING = "spaceStationVariant";

export const STARSHIP_VARIANT_STARSHIP = "starship";
export const STARSHIP_VARIANT_SPACE_STATION = "spaceStation";

/** dnd5e size keys that meet RAW Large+ for space stations. */
const SPACE_STATION_MIN_SIZE_KEYS = new Set(["lg", "huge", "grg"]);

/** Compendium item IDs in the `starships` pack. */
export const SPACE_STATION_STOCK_MOD_IDS = Object.freeze({
	centralComputerMakeshift: "B1RhywM9GWC58c5t",
	centralComputerMkI: "PBOCSZUP1KGF3fQx",
	/** SotG "Premium" Comms Package — pack only has Mk I–III; map Premium → Mk II. */
	commsPackagePremium: "faOFea4VnxW7AY1u",
	/** SotG "Prototype" Comms Package — map Prototype → Mk III. */
	commsPackagePrototype: "s4CBIRL3lsfMfOXx"
});

export const SPACE_STATION_AC_EFFECT_FLAG = "spaceStationAcPenalty";

/**
 * @param {object|null|undefined} actor
 * @returns {"starship"|"spaceStation"}
 */
export function getStarshipVariant(actor) {
	const raw = actor?.flags?.sw5e?.legacyStarshipActor?.variant
		?? actor?._source?.flags?.sw5e?.legacyStarshipActor?.variant;
	if ( raw === STARSHIP_VARIANT_SPACE_STATION ) return STARSHIP_VARIANT_SPACE_STATION;
	return STARSHIP_VARIANT_STARSHIP;
}

/**
 * Starship vehicle flagged as a space station (ignores world setting).
 * @param {object|null|undefined} actor
 */
export function isSw5eSpaceStationActor(actor) {
	if ( actor?.type !== "vehicle" ) return false;
	if ( actor?.flags?.sw5e?.legacyStarshipActor?.type !== "starship"
		&& actor?._source?.flags?.sw5e?.legacyStarshipActor?.type !== "starship" ) {
		return false;
	}
	return getStarshipVariant(actor) === STARSHIP_VARIANT_SPACE_STATION;
}

/** Whether station derive overrides are enabled for this world. */
export function isSpaceStationVariantEnabled() {
	return Boolean(getModuleSettingValue(SPACE_STATION_VARIANT_SETTING, false));
}

/**
 * Station actor with world setting on — apply movement/suite/hull/AC/install deltas.
 * @param {object|null|undefined} actor
 */
export function isActiveSpaceStationActor(actor) {
	return isSw5eSpaceStationActor(actor) && isSpaceStationVariantEnabled();
}

/**
 * @param {object|null|undefined} actor
 * @returns {string} dnd5e size key (e.g. lg, med)
 */
export function getStarshipActorSizeKey(actor) {
	return actor?.system?.traits?.size
		?? actor?._source?.system?.traits?.size
		?? actor?.flags?.sw5e?.legacyStarshipActor?.system?.traits?.size
		?? "med";
}

/**
 * Soft RAW check: stations should be Large+.
 * @param {object|null|undefined} actor
 */
export function isSpaceStationSizeBelowLarge(actor) {
	if ( !isSw5eSpaceStationActor(actor) ) return false;
	return !SPACE_STATION_MIN_SIZE_KEYS.has(getStarshipActorSizeKey(actor));
}

/**
 * Fixed station combat speeds (SotG variant). Ignores bonuses, routing, overrides, Slowed.
 * @returns {{ space: number, turn: number }}
 */
export function getSpaceStationFixedMovement() {
	return { space: 50, turn: 100 };
}

/** Hull points added per hull die for active space stations. */
export function getSpaceStationHullDieBonus() {
	return 2;
}

/**
 * Future install/workforce hook: stations get −10 to modification install DC.
 * @param {object|null|undefined} actor
 * @returns {number}
 */
export function getStarshipModificationInstallDcAdjustment(actor) {
	return isActiveSpaceStationActor(actor) ? -10 : 0;
}

/**
 * Hyperspace travel time multiplier (display/manual until duration math exists).
 * @param {object|null|undefined} actor
 * @returns {number}
 */
export function getSpaceStationHyperspaceTravelTimeMultiplier(actor) {
	return isActiveSpaceStationActor(actor) ? 2 : 1;
}

/**
 * Build Active Effect data for the station AC −2 soft adjustment.
 * @param {string} [origin]
 */
export function buildSpaceStationAcPenaltyEffectData(origin = "") {
	return {
		name: "Space Station Armor Class",
		img: "icons/svg/shield.svg",
		origin: origin || undefined,
		transfer: false,
		disabled: false,
		changes: [
			{
				key: "system.attributes.ac.bonus",
				mode: 2, // CONST.ACTIVE_EFFECT_MODES.ADD
				value: "-2",
				priority: 20
			}
		],
		flags: {
			[SETTINGS_NAMESPACE]: {
				[SPACE_STATION_AC_EFFECT_FLAG]: true
			}
		}
	};
}

const STARSHIPS_PACK_ITEM_PREFIX = "Compendium.sw5e-module.starships.Item.";

/**
 * @param {string} id
 * @returns {string}
 */
function toStarshipsPackItemUuid(id) {
	return `${STARSHIPS_PACK_ITEM_PREFIX}${id}`;
}

/**
 * Compendium UUIDs for stock mods granted by station Role Specialization (by size).
 * @param {"lg"|"huge"|"grg"|string} sizeKey
 * @returns {string[]}
 */
export function getSpaceStationRoleSpecializationModUuids(sizeKey) {
	const ids = [SPACE_STATION_STOCK_MOD_IDS.centralComputerMakeshift];
	if ( sizeKey === "huge" || sizeKey === "grg" ) {
		ids.push(SPACE_STATION_STOCK_MOD_IDS.centralComputerMkI);
	}
	if ( sizeKey === "huge" ) {
		ids.push(SPACE_STATION_STOCK_MOD_IDS.commsPackagePremium);
	} else if ( sizeKey === "grg" ) {
		ids.push(SPACE_STATION_STOCK_MOD_IDS.commsPackagePrototype);
	}
	return ids.map(toStarshipsPackItemUuid);
}

/**
 * Resolve stock mod UUIDs from a Role Specialization feat (flags preferred, size fallback).
 * @param {Item|object|null|undefined} item
 * @returns {string[]}
 */
export function resolveSpaceStationRoleSpecializationModUuids(item) {
	const meta = item?.flags?.sw5e?.spaceStation ?? {};
	const stockModIds = Array.isArray(meta.stockModIds) ? meta.stockModIds.filter(Boolean) : [];
	if ( stockModIds.length ) {
		return stockModIds.map(id => {
			const raw = String(id);
			return raw.startsWith("Compendium.") ? raw : toStarshipsPackItemUuid(raw);
		});
	}
	const sizeKey = meta.roleSpecializationSize;
	if ( sizeKey ) return getSpaceStationRoleSpecializationModUuids(sizeKey);
	return [];
}

/**
 * Whether an item is a Space Station Role Specialization feat.
 * @param {Item|object|null|undefined} item
 */
export function isSpaceStationRoleSpecializationFeat(item) {
	if ( !item || item.type !== "feat" ) return false;
	const typeValue = item.system?.type?.value ?? item._source?.system?.type?.value;
	const subtype = item.system?.type?.subtype ?? item._source?.system?.type?.subtype;
	if ( typeValue !== "starship" || subtype !== "roleSpecialization" ) return false;
	const meta = item.flags?.sw5e?.spaceStation ?? item._source?.flags?.sw5e?.spaceStation;
	return Boolean(meta && (Array.isArray(meta.stockModIds) || meta.roleSpecializationSize));
}

/**
 * Stock mods for a newly created / converted space station (base stock only).
 * @returns {string[]}
 */
export function getSpaceStationBaseStockModUuids() {
	return [toStarshipsPackItemUuid(SPACE_STATION_STOCK_MOD_IDS.centralComputerMakeshift)];
}
