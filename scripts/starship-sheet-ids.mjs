/**
 * Starship sheet identity / tab / pack constants (Phase 6 Slice B).
 * Move-only from scripts/patch/starship-sheet.mjs — bodies preserved.
 */

export const STARSHIP_PACKS = new Set([
	"starshiped",
	"starshiparmor",
	"starshipequipment",
	"starshipfeatures",
	"starshipmodifications",
	"starships",
	"starshipweapons",
	"deployments",
	"deploymentfeatures",
	"ventures"
]);

export const STARSHIP_TAB_ID = "sw5e-starship";
/** Primary Features tab for starship Actions / Systems. */
export const STARSHIP_FEATURES_TAB_ID = "sw5e-starship-features";
export const STOCK_CARGO_TAB_ID = "inventory";
export const STOCK_FEATURES_TAB_ID = "features";
export const STOCK_STARSHIP_TAB_ORDER = [STARSHIP_TAB_ID, STOCK_CARGO_TAB_ID, STARSHIP_FEATURES_TAB_ID, "effects", "description"];
export const CUSTOM_STARSHIP_TAB_IDS = new Set();

export const SOTG_SUB_TAB_IDS = new Set(["overview"]);

export const STARSHIP_ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];
export const STARSHIP_TIER_OPTIONS = [0, 1, 2, 3, 4, 5];

export function isSw5eStarshipActor(actor) {
	return actor?.type === "vehicle" && actor?.flags?.sw5e?.legacyStarshipActor?.type === "starship";
}


export function getCompendiumPack(item) {
	// Foundry v14: prefer _stats.compendiumSource; retain flags.core.sourceId for legacy content.
	const sourceId = item?._stats?.compendiumSource ?? item?.flags?.core?.sourceId;
	const match = /^Compendium\.[^.]+\.([^.]+)\./.exec(sourceId ?? "");
	return match?.[1] ?? null;
}

