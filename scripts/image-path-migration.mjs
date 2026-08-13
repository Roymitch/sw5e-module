/**
 * Pure artwork path migration: preserve by default; remap only exact known legacy paths.
 * Never clears a nonempty path to "".
 * No Foundry globals required for the pure helpers.
 */

import { getModulePath } from "./module-support.mjs";

export const SPECIES_PACK_IMG_REMAPS = Object.freeze({
	"Droid%20Class%20I.webp": "Droid-ClassI.webp",
	"Droid%20Class%20II.webp": "Droid-ClassIi.webp",
	"Droid%20Class%20III.webp": "Droid-ClassIii.webp",
	"Droid%20Class%20IV.webp": "Droid-ClassIv.webp",
	"Droid%20Class%20V.webp": "Droid-ClassV.webp",
	"Droid Class I.webp": "Droid-ClassI.webp",
	"Droid Class II.webp": "Droid-ClassIi.webp",
	"Droid Class III.webp": "Droid-ClassIii.webp",
	"Droid Class IV.webp": "Droid-ClassIv.webp",
	"Droid Class V.webp": "Droid-ClassV.webp",
	"Flesh%20Raider.webp": "FleshRaider.webp",
	"Flesh Raider.webp": "FleshRaider.webp",
	"Kel%20Dor.webp": "KelDor.webp",
	"Kel Dor.webp": "KelDor.webp",
	"Mon%20Calamari.webp": "MonCalamari.webp",
	"Mon Calamari.webp": "MonCalamari.webp"
});

/** Exact pack-monster Avatar.webp paths under the canonical module id. Pack-generation helper only. */
const AUTHORIZED_MONSTER_AVATAR_RE = /^modules\/sw5e-module\/icons\/packs\/monsters\/[^/]+\/Avatar\.webp$/i;

const SPECIES_PACK_PATH_RE = /(?:systems\/sw5e\/packs\/Icons\/[Ss]pecies\/|modules\/(?:sw5e|sw5e-module|sw5e-module-test)\/icons\/packs\/[Ss]pecies\/)/i;
const MODULE_COMPANION_PATH_RE = /^(modules\/(?:sw5e|sw5e-module|sw5e-module-test)\/)icons\/companions\//;

export const PROTECTED_ARTWORK_FIELDS = Object.freeze([
	"img",
	"texture.src",
	"prototypeToken.texture.src"
]);

/**
 * @param {object} obj
 * @param {string} path
 * @returns {boolean}
 */
export function hasDottedProperty(obj, path) {
	if ( !obj || typeof path !== "string" || !path ) return false;
	const parts = path.split(".");
	let cur = obj;
	for ( const part of parts ) {
		if ( cur === null || cur === undefined || typeof cur !== "object" || !(part in cur) ) return false;
		cur = cur[part];
	}
	return true;
}

/**
 * @param {object} obj
 * @param {string} path
 * @returns {*}
 */
export function getDottedProperty(obj, path) {
	if ( !hasDottedProperty(obj, path) ) return undefined;
	return path.split(".").reduce((cur, part) => cur[part], obj);
}

/**
 * Presence taxonomy for artwork fields.
 * @param {object} objectData
 * @param {string} prop
 * @returns {"absent"|"null"|"empty"|"nonempty"|"other"}
 */
export function getArtworkPresenceState(objectData, prop) {
	if ( !hasDottedProperty(objectData, prop) ) return "absent";
	const value = getDottedProperty(objectData, prop);
	if ( value === null ) return "null";
	if ( value === "" ) return "empty";
	if ( typeof value === "string" ) return "nonempty";
	return "other";
}

/**
 * Default preserve contract: return the input unchanged.
 * @param {*} path
 * @param {object} [_context]
 * @returns {*}
 */
export function preserveImagePath(path, _context={}) {
	return path;
}

/**
 * Remap known Species pack filenames (recognized pack prefixes only).
 * World files that merely end with the same filename are left unchanged.
 * @param {string} path
 * @returns {string}
 */
export function remapSpeciesPackImage(path) {
	if ( typeof path !== "string" ) return path;
	if ( !SPECIES_PACK_PATH_RE.test(path) ) return path;
	for ( const [badSuffix, goodSuffix] of Object.entries(SPECIES_PACK_IMG_REMAPS) ) {
		if ( path.endsWith(badSuffix) ) return `${path.slice(0, -badSuffix.length)}${goodSuffix}`;
	}
	return path;
}

/**
 * Remap legacy companion icon folder to canonical packs path.
 * Only `icons/companions/` prefix or module-qualified `.../icons/companions/`.
 * @param {string} path
 * @returns {string}
 */
export function remapLegacyCompanionIconPath(path) {
	if ( typeof path !== "string" ) return path;
	if ( path.startsWith("icons/companions/") ) {
		return `icons/packs/Companions/${path.slice("icons/companions/".length)}`;
	}
	return path.replace(MODULE_COMPANION_PATH_RE, (_, prefix) => `${prefix}icons/packs/Companions/`);
}

/**
 * Normalize legacy module / system icon roots to the current module path.
 * @param {string} path
 * @param {{ getModulePath?: Function }} [options]
 * @returns {string}
 */
export function normalizeModuleImagePath(path, options={}) {
	if ( typeof path !== "string" ) return path;
	const resolvePath = options.getModulePath ?? getModulePath;
	return path
		.replace(/^modules\/sw5e\//, `${resolvePath()}/`)
		.replace(/^modules\/sw5e-module-test\//, `${resolvePath()}/`)
		.replaceAll("systems/sw5e/packs/Icons", resolvePath("icons/packs"))
		.replaceAll("modules/sw5e/icons/", `${resolvePath("icons")}/`)
		.replaceAll("modules/sw5e-module-test/icons/", `${resolvePath("icons")}/`);
}

/**
 * Exact authorized monster pack Avatar.webp → sibling Token.webp.
 * Does not derive Token from arbitrary paths containing "Avatar".
 * @param {string} avatarPath module-normalized actor img
 * @returns {string} token path or "" when not authorized
 */
export function getAuthorizedMonsterTokenPathFromAvatar(avatarPath) {
	if ( typeof avatarPath !== "string" ) return "";
	if ( !AUTHORIZED_MONSTER_AVATAR_RE.test(avatarPath) ) return "";
	return avatarPath.replace(/\/Avatar\.webp$/i, "/Token.webp");
}

/**
 * Apply only approved legacy remaps. Non-string values are returned unchanged.
 * @param {*} path
 * @param {{
 *   prop?: string,
 *   objectData?: object,
 *   getModulePath?: Function
 * }} [context]
 * @returns {*}
 */
export function remapKnownLegacyImagePath(path, context={}) {
	if ( typeof path !== "string" ) return path;

	let newPath = remapLegacyCompanionIconPath(
		remapSpeciesPackImage(normalizeModuleImagePath(path, context))
	);
	return newPath;
}

/**
 * Whether after is an authorized exact remap of before for this field context.
 * @param {*} before
 * @param {*} after
 * @param {object} context
 * @returns {boolean}
 */
export function isAuthorizedArtworkRemap(before, after, context={}) {
	if ( Object.is(before, after) ) return true;
	if ( typeof before !== "string" || before.length === 0 ) return Object.is(before, after);
	return remapKnownLegacyImagePath(before, context) === after;
}

/**
 * Apply image path migration onto updateData (dotted keys).
 * Absent fields emit no key. Null/empty do not manufacture paths.
 * Nonempty paths are preserved unless an exact approved remap applies.
 * @param {object} objectData
 * @param {object} updateData
 * @param {{ getModulePath?: Function }} [options]
 * @returns {object} updateData
 */
export function applyImagePathMigration(objectData, updateData={}, options={}) {
	const props = ["img", "texture.src", "prototypeToken.texture.src"];
	const isEffect = objectData?.documentName === "ActiveEffect"
		|| (objectData?.changes && Array.isArray(objectData.changes));
	if ( !isEffect ) props.push("icon");
	else if ( typeof objectData?.icon === "string" ) props.push("icon");

	for ( const prop of props ) {
		const presence = getArtworkPresenceState(objectData, prop);
		if ( presence === "absent" ) continue;

		const path = getDottedProperty(objectData, prop);
		if ( presence === "null" || presence === "empty" ) {
			// Preserve; do not invent a path or emit a redundant write.
			continue;
		}
		if ( presence !== "nonempty" ) {
			// Non-string present values: leave unchanged (no write).
			continue;
		}

		const context = { prop, objectData, getModulePath: options.getModulePath };
		const preserved = preserveImagePath(path, context);
		const remapped = remapKnownLegacyImagePath(preserved, context);
		if ( remapped !== path ) updateData[prop] = remapped;
	}

	return updateData;
}

/**
 * Resolve the effective after-value for a protected field given a prepared full document
 * (or dotted update applied onto a clone).
 * @param {object} beforeSource
 * @param {object} preparedSource
 * @param {string} field
 * @returns {{ presenceBefore: string, before: *, after: *, presenceAfter: string }}
 */
export function compareProtectedArtworkField(beforeSource, preparedSource, field) {
	return {
		presenceBefore: getArtworkPresenceState(beforeSource, field),
		before: hasDottedProperty(beforeSource, field) ? getDottedProperty(beforeSource, field) : undefined,
		after: hasDottedProperty(preparedSource, field) ? getDottedProperty(preparedSource, field) : undefined,
		presenceAfter: getArtworkPresenceState(preparedSource, field)
	};
}

/**
 * Collect protected-artwork invariant violations for one candidate update.
 * @param {object} args
 * @returns {object[]}
 */
export function collectArtworkInvariantViolations({
	documentType,
	documentId,
	beforeSource,
	preparedSource,
	caller,
	remapContext={},
	updateMode={},
	migrationVersion=""
}={}) {
	const violations = [];
	for ( const field of PROTECTED_ARTWORK_FIELDS ) {
		const { presenceBefore, before, after, presenceAfter } = compareProtectedArtworkField(
			beforeSource,
			preparedSource,
			field
		);
		if ( presenceBefore !== "nonempty" ) continue;
		const context = { ...remapContext, prop: field, objectData: beforeSource };
		const authorized = isAuthorizedArtworkRemap(before, after, context);
		if ( authorized && presenceAfter === "nonempty" ) continue;
		if ( authorized && Object.is(before, after) ) continue;

		if ( !Object.is(before, after) && !authorized ) {
			violations.push({
				documentType,
				documentId,
				protectedField: field,
				propertyPresenceState: presenceBefore,
				beforeValue: before,
				proposedAfterValue: after,
				migrationCaller: caller,
				remapAuthorizationResult: authorized ? "authorized" : "rejected",
				updateMode,
				migrationVersion
			});
		}
	}
	return violations;
}

/**
 * Error thrown when migration must abort without advancing moduleMigrationVersion.
 */
export class ArtworkMigrationInvariantError extends Error {
	/**
	 * @param {object[]} violations
	 */
	constructor(violations=[]) {
		const first = violations[0];
		const summary = first
			? `${first.documentType} ${first.documentId} field ${first.protectedField}`
			: "unknown";
		super(`SW5E artwork migration invariant failed (${violations.length}): ${summary}`);
		this.name = "ArtworkMigrationInvariantError";
		this.violations = violations;
	}
}

/**
 * Format a bounded diagnostic for one violation (no unrelated campaign content).
 * @param {object} v
 * @returns {string}
 */
export function formatArtworkInvariantDiagnostic(v) {
	return [
		"SW5E artwork invariant violation",
		`type=${v.documentType}`,
		`id=${v.documentId}`,
		`field=${v.protectedField}`,
		`presence=${v.propertyPresenceState}`,
		`before=${JSON.stringify(v.beforeValue)}`,
		`after=${JSON.stringify(v.proposedAfterValue)}`,
		`caller=${v.migrationCaller}`,
		`remap=${v.remapAuthorizationResult}`,
		`mode=${JSON.stringify(v.updateMode)}`,
		`migrationVersion=${v.migrationVersion}`
	].join(" ");
}
