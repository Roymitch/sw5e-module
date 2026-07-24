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

/**
 * Bug 6 membership-visibility integration point for starship crew (responsible-crew picker + attribution).
 * Until Bug 6 hidden-membership APIs exist, all memberships are treated as visible.
 *
 * @param {Actor|null|undefined} _starship
 * @param {Actor|null|undefined} _crewActor
 * @param {User|null|undefined} _user
 * @returns {boolean}
 */
export function isStarshipCrewMembershipVisibleToUser(_starship, _crewActor, _user) {
	// Bug 6: return false when membership is hidden from this user.
	return true;
}

/**
 * Whether the user may see a named crew attribution for Starship skill PB (Bug 29E).
 * Entitled: GM or starship update permission. Also requires membership visible (Bug 6 stub).
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
