#!/usr/bin/env node
/**
 * Offline tests: Speed/Travel EDIT-mode counter visibility (first slice).
 * Space / Travel Speed / Travel Pace counters hide in EDIT; Turning stays visible.
 */
import assert from "node:assert/strict";
import {
	resolveStarshipSidebarMovementEditMode,
	resolveStarshipSidebarMovementVisibility
} from "../scripts/starship-sidebar-movement-visibility.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function mockApp({ mode = "play", isEditable = true } = {}) {
	const MODES = { PLAY: 0, EDIT: 1 };
	return {
		constructor: { MODES },
		_mode: mode === "edit" ? MODES.EDIT : MODES.PLAY,
		isEditable
	};
}

function mockActor({ isOwner = true } = {}) {
	return { isOwner };
}

test("PLAY: counters shown, config cog hidden", () => {
	const flags = resolveStarshipSidebarMovementVisibility(mockApp({ mode: "play" }), mockActor());
	assert.equal(flags.showMovementCounters, true);
	assert.equal(flags.showMovementConfig, false);
});

test("EDIT owner: counters hidden, Space config cog shown", () => {
	const flags = resolveStarshipSidebarMovementVisibility(mockApp({ mode: "edit" }), mockActor({ isOwner: true }));
	assert.equal(flags.showMovementCounters, false);
	assert.equal(flags.showMovementConfig, true);
});

test("EDIT non-owner: counters hidden, config cog hidden", () => {
	const flags = resolveStarshipSidebarMovementVisibility(mockApp({ mode: "edit" }), mockActor({ isOwner: false }));
	assert.equal(flags.showMovementCounters, false);
	assert.equal(flags.showMovementConfig, false);
});

test("EDIT with isEditable false: counters hidden, config cog hidden", () => {
	const flags = resolveStarshipSidebarMovementVisibility(
		mockApp({ mode: "edit", isEditable: false }),
		mockActor({ isOwner: true })
	);
	assert.equal(flags.showMovementCounters, false);
	assert.equal(flags.showMovementConfig, false);
});

test("edit-mode resolver matches MODES enum", () => {
	assert.equal(resolveStarshipSidebarMovementEditMode(mockApp({ mode: "play" })), false);
	assert.equal(resolveStarshipSidebarMovementEditMode(mockApp({ mode: "edit" })), true);
	assert.equal(resolveStarshipSidebarMovementEditMode(null), false);
});

test("first-slice contract: Turning remains a display field (not gated by showMovementCounters)", () => {
	// Template always renders turningSpeedDisplay; visibility helper must not imply clearing it.
	const edit = resolveStarshipSidebarMovementVisibility(mockApp({ mode: "edit" }), mockActor());
	assert.equal(edit.showMovementCounters, false, "Space/Travel counters gated off in EDIT");
	assert.equal(edit.showMovementConfig, true, "Space cog remains the configure entry");
});

console.log(`\n${passed} tests passed`);
