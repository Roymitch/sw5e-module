import { localizeOrFallback } from "./module-support.mjs";

/**
 * Fail-closed Actor update capability for starship mutation surfaces (Phase 4).
 * Uses Foundry's public Document permission API; never soft-true on missing Actor/User.
 *
 * @param {Actor|null|undefined} actor
 * @returns {boolean}
 */
export function canCurrentUserUpdateStarshipActor(actor) {
	const user = globalThis.game?.user;
	if ( !actor || !user ) return false;
	return actor?.canUserModify?.(user, "update") === true;
}

/** Fullwidth full stop — mirrors `starship-character.mjs` crewProfiles key encoding. */
const CREW_PROFILE_KEY_DOT = "\uFF0E";

/**
 * @param {string} uuid
 * @returns {string}
 */
function toCrewProfileStorageKey(uuid) {
	return String(uuid ?? "").replaceAll(".", CREW_PROFILE_KEY_DOT);
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isCrewProfileObject(value) {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Read ship-owned `crewProfiles.*.hidden` for one Actor UUID (encoded / raw / nested shapes).
 * Defaults visible when missing or malformed.
 * @param {Actor|null|undefined} starship
 * @param {string} actorUuid
 * @returns {boolean}
 */
function readStarshipCrewMembershipHiddenFlag(starship, actorUuid) {
	const uuid = String(actorUuid ?? "");
	if ( !uuid || !starship ) return false;
	const raw = starship?.flags?.sw5e?.starship?.crewProfiles;
	if ( !isCrewProfileObject(raw) ) return false;

	const storageKey = toCrewProfileStorageKey(uuid);
	if ( Object.prototype.hasOwnProperty.call(raw, storageKey) ) {
		return isCrewProfileObject(raw[storageKey]) && raw[storageKey].hidden === true;
	}
	if ( uuid.includes(".") && Object.prototype.hasOwnProperty.call(raw, uuid) ) {
		return isCrewProfileObject(raw[uuid]) && raw[uuid].hidden === true;
	}
	const actorId = uuid.startsWith("Actor.") ? uuid.slice("Actor.".length) : null;
	if ( actorId && isCrewProfileObject(raw.Actor)
		&& !Object.prototype.hasOwnProperty.call(raw.Actor, "customRole")
		&& !Object.prototype.hasOwnProperty.call(raw.Actor, "hidden")
		&& Object.prototype.hasOwnProperty.call(raw.Actor, actorId) ) {
		const nested = raw.Actor[actorId];
		return isCrewProfileObject(nested) && nested.hidden === true;
	}
	return false;
}

/**
 * Resolve a crew Actor UUID from an Actor document or UUID string.
 * @param {Actor|string|null|undefined} crewActorOrUuid
 * @returns {string}
 */
function resolveCrewMembershipUuid(crewActorOrUuid) {
	if ( typeof crewActorOrUuid === "string" ) return crewActorOrUuid.trim();
	if ( crewActorOrUuid?.documentName === "Actor" || crewActorOrUuid?.uuid ) {
		return String(crewActorOrUuid.uuid ?? "").trim();
	}
	return "";
}

/**
 * Whether a user may see a deployment membership on this starship (Bug 6).
 * When `hidden === true`: GM only. Starship update permission and crew Actor ownership
 * do not bypass concealment. When not hidden: visible under normal sheet access.
 *
 * @param {Actor|null|undefined} starship
 * @param {Actor|string|null|undefined} crewActorOrUuid
 * @param {User|null|undefined} [user]
 * @returns {boolean}
 */
export function isStarshipCrewMembershipVisibleToUser(starship, crewActorOrUuid, user = globalThis.game?.user) {
	if ( !starship || !user ) return true;
	const uuid = resolveCrewMembershipUuid(crewActorOrUuid);
	if ( !uuid ) return true;

	if ( !readStarshipCrewMembershipHiddenFlag(starship, uuid) ) return true;
	return user.isGM === true;
}

/**
 * Whether the user may see a named crew attribution for Starship skill PB (Bug 29E).
 * Entitled: GM or starship update permission. Also requires membership visible (Bug 6).
 *
 * @param {Actor|null|undefined} starship
 * @param {Actor|null|undefined} crewActor Actor that would be named (required for a name)
 * @param {User|null|undefined} [user]
 * @returns {boolean}
 */
export function canAttributeStarshipCrewActor(starship, crewActor, user = globalThis.game?.user) {
	if ( !starship || !user || !crewActor ) return false;
	const entitled = user.isGM === true || starship?.canUserModify?.(user, "update") === true;
	if ( !entitled ) return false;
	if ( !isStarshipCrewMembershipVisibleToUser(starship, crewActor, user) ) return false;
	return true;
}

/**
 * Warn once for a denied user gesture (UI layer only — mutation helpers stay silent).
 */
export function warnStarshipActorUpdateDenied() {
	ui.notifications?.warn?.(localizeOrFallback(
		"PERMISSION.WarningNoActor",
		"You do not have permission to edit this actor."
	));
}
