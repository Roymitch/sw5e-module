/**
 * Starship Max Fires per Round (Bug 8 / Phase 2D) — display-only derivation.
 *
 * Uses the verified SotG hardpoint size-modifier matrix (RAW constants), not
 * Size-item `flags.sw5e.legacyStarshipSize.hardpointMult`, which is currently
 * non-authoritative for Medium/Large on v.next.
 */

import { isSw5eStarshipActor } from "./starship-sheet-ids.mjs";

/** Verified SotG Ship Hardpoint Size Modifiers (sotg_07 Weapon Hardpoints). */
export const STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS = Object.freeze({
	tiny: 1,
	small: 1,
	medium: 1.5,
	large: 2.5,
	huge: 2,
	gargantuan: 3
});

const DND5E_SIZE_TO_MAX_FIRES_KEY = Object.freeze({
	tiny: "tiny",
	sm: "small",
	med: "medium",
	lg: "large",
	huge: "huge",
	grg: "gargantuan"
});

/**
 * Normalize a size label / dnd5e traits.size key to a Max Fires RAW map key.
 * @param {unknown} value
 * @returns {"tiny"|"small"|"medium"|"large"|"huge"|"gargantuan"|null}
 */
export function normalizeStarshipMaxFiresSizeKey(value) {
	const raw = String(value ?? "").trim().toLowerCase();
	if ( !raw ) return null;
	if ( raw in STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS ) return raw;
	if ( raw in DND5E_SIZE_TO_MAX_FIRES_KEY ) return DND5E_SIZE_TO_MAX_FIRES_KEY[raw];

	for ( const key of Object.keys(STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS) ) {
		if ( raw === key || raw.startsWith(`${key} `) || raw.startsWith(`${key}-`) || raw.startsWith(`${key}_`) ) {
			return key;
		}
	}
	return null;
}

/**
 * Resolve the starship Size key used for Max Fires (traits.size, then Size item hints).
 * Does not read legacy `hardpointMult`.
 * @param {object|null|undefined} actor
 * @returns {"tiny"|"small"|"medium"|"large"|"huge"|"gargantuan"|null}
 */
export function resolveStarshipMaxFiresSizeKey(actor) {
	if ( !isSw5eStarshipActor(actor) ) return null;

	const fromTraits = normalizeStarshipMaxFiresSizeKey(actor?.system?.traits?.size);
	if ( fromTraits ) return fromTraits;

	const items = actor?.items?.contents ?? actor?.items ?? [];
	const list = Array.isArray(items) ? items : (typeof items?.[Symbol.iterator] === "function" ? [...items] : []);
	const sizeItem = list.find(item => item?.flags?.sw5e?.legacyStarshipSize)
		?? list.find(item => item?.type === "starshipsize")
		?? list.find(item => /starship/i.test(String(item?.name ?? "")) && normalizeStarshipMaxFiresSizeKey(item?.name));

	if ( !sizeItem ) return null;

	const legacy = sizeItem.flags?.sw5e?.legacyStarshipSize ?? {};
	return normalizeStarshipMaxFiresSizeKey(legacy.size)
		?? normalizeStarshipMaxFiresSizeKey(sizeItem.system?.identifier)
		?? normalizeStarshipMaxFiresSizeKey(sizeItem.name);
}

/**
 * RAW Max Fires per Round.
 * Formula: ceil(max(1, StrengthModifier) × HardpointSizeModifier)
 *
 * @param {number} strengthModifier Prepared Strength modifier (may be negative or zero).
 * @param {unknown} sizeKeyOrLabel Size key / dnd5e size / Size item name.
 * @returns {number|null} Integer fires, or null when size is unrecognized / modifier non-finite.
 */
export function computeStarshipMaxFiresPerRound(strengthModifier, sizeKeyOrLabel) {
	const sizeKey = normalizeStarshipMaxFiresSizeKey(sizeKeyOrLabel);
	if ( !sizeKey ) return null;
	const multiplier = STARSHIP_MAX_FIRES_SIZE_MULTIPLIERS[sizeKey];
	const mod = Number(strengthModifier);
	if ( !Number.isFinite(mod) ) return null;
	return Math.ceil(Math.max(1, mod) * multiplier);
}

/**
 * Derive live Max Fires for a starship Actor from prepared Strength mod + RAW size map.
 * Pure: no document writes.
 * @param {object|null|undefined} actor
 * @returns {number|null}
 */
export function deriveStarshipMaxFiresPerRound(actor) {
	if ( !isSw5eStarshipActor(actor) ) return null;
	const sizeKey = resolveStarshipMaxFiresSizeKey(actor);
	const strengthModifier = actor?.system?.abilities?.str?.mod;
	return computeStarshipMaxFiresPerRound(strengthModifier, sizeKey);
}

/**
 * Sheet/sidebar display contract for Max Fires (display-only; never persists).
 * Label and value stay separate for the stock pills-group / `.counter` row pattern.
 * @param {object|null|undefined} actor
 * @param {{ label?: string }} [options]
 * @returns {{ show: boolean, label: string, value: number|null, ariaLabel: string }}
 */
export function buildStarshipMaxFiresDisplayContext(actor, { label = "Max Fires/Round" } = {}) {
	const value = deriveStarshipMaxFiresPerRound(actor);
	const show = Number.isFinite(value);
	return {
		show,
		label,
		value: show ? value : null,
		ariaLabel: show ? `${label} ${value}` : label
	};
}
