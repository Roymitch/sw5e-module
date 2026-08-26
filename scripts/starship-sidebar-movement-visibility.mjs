/**
 * Starship sidebar movement PLAY/EDIT visibility (Speed/Travel EDIT parity first slice).
 * Pure helpers — no document writes, no Foundry globals.
 */

/**
 * @param {object|null|undefined} app
 * @returns {boolean}
 */
export function resolveStarshipSidebarMovementEditMode(app) {
	if ( !app ) return false;
	const MODES = app.constructor?.MODES;
	const hasModeEnum = MODES?.EDIT != null && MODES?.PLAY != null;
	if ( hasModeEnum ) return app._mode === MODES.EDIT;
	return app.isEditable === true;
}

/**
 * @param {object|null|undefined} app
 * @param {object|null|undefined} actor
 * @returns {{ showMovementCounters: boolean, showMovementConfig: boolean }}
 */
export function resolveStarshipSidebarMovementVisibility(app, actor) {
	const editMode = resolveStarshipSidebarMovementEditMode(app);
	return {
		showMovementCounters: !editMode,
		showMovementConfig: editMode && app?.isEditable !== false && actor?.isOwner === true
	};
}
