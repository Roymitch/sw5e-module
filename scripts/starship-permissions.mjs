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
 * Warn once for a denied user gesture (UI layer only — mutation helpers stay silent).
 */
export function warnStarshipActorUpdateDenied() {
	ui.notifications?.warn?.(localizeOrFallback(
		"PERMISSION.WarningNoActor",
		"You do not have permission to edit this actor."
	));
}
