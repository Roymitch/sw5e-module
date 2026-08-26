#!/usr/bin/env node
/**
 * Offline tests for Bug 6 GM-only membership concealment + GM roster row state
 * + Flight Manifest crew panel header markup/localization (UI-only).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	buildVehicleStarshipCrewContext,
	getStarshipCrewMembershipHidden
} from "../scripts/starship-character.mjs";
import { isStarshipCrewMembershipVisibleToUser } from "../scripts/starship-permissions.mjs";
import {
	signaturePayloadCoreCrew,
	stableSignature
} from "../scripts/patch/starship-sheet-partial.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EN_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, "languages/en.json"), "utf8"));
const CREW_LAYER_HBS = fs.readFileSync(path.join(ROOT, "templates/starship-sheet-layer.hbs"), "utf8");
const CREW_LESS = fs.readFileSync(path.join(ROOT, "styles/less/update/starships/crew.less"), "utf8");

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeCrewActor(uuid, name) {
	return {
		documentName: "Actor",
		type: "character",
		uuid,
		id: String(uuid).split(".").pop(),
		name,
		img: "icons/svg/mystery-man.svg",
		system: { attributes: { prof: 2 }, skills: { pil: { value: 0 } } }
	};
}

function makeStarship({ crewUuids=[], hiddenUuids=[], canUpdateIds=new Set() }={}) {
	const profiles = {};
	for ( const uuid of hiddenUuids ) {
		const key = String(uuid).replaceAll(".", "\uFF0E");
		profiles[key] = { hidden: true, customRole: "Covert" };
	}
	return {
		documentName: "Actor",
		type: "vehicle",
		uuid: "Actor.ship1",
		id: "ship1",
		name: "Test Ship",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: {
							deployment: {
								pilot: { value: null },
								crew: { items: crewUuids },
								passenger: { items: [] },
								active: { value: null }
							}
						}
					}
				},
				starship: { crewProfiles: profiles }
			}
		},
		canUserModify(user, action) {
			return action === "update" && canUpdateIds.has(user?.id);
		}
	};
}

function withGameUser(user, fn) {
	const previousGame = globalThis.game;
	globalThis.game = { ...(previousGame ?? {}), user };
	try {
		return fn();
	} finally {
		if ( previousGame === undefined ) delete globalThis.game;
		else globalThis.game = previousGame;
	}
}

function withActorResolver(actorsByUuid, fn) {
	const previous = globalThis.fromUuidSync;
	globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;
	try {
		return fn();
	} finally {
		if ( previous === undefined ) delete globalThis.fromUuidSync;
		else globalThis.fromUuidSync = previous;
	}
}

const visible = makeCrewActor("Actor.visible", "Visible");
const hidden = makeCrewActor("Actor.hidden", "Hidden");
const actors = new Map([[visible.uuid, visible], [hidden.uuid, hidden]]);

test("getStarshipCrewMembershipHidden reads encoded profile", () => {
	const ship = makeStarship({ crewUuids: [hidden.uuid], hiddenUuids: [hidden.uuid] });
	assert.equal(getStarshipCrewMembershipHidden(ship, hidden.uuid), true);
	assert.equal(getStarshipCrewMembershipHidden(ship, visible.uuid), false);
});

test("GM roster retains hidden row with membershipHidden true", () => {
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		hiddenUuids: [hidden.uuid],
		canUpdateIds: new Set(["gm"])
	});
	withActorResolver(actors, () => {
		withGameUser({ id: "gm", isGM: true }, () => {
			const { roster } = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(roster.length, 2);
			const hiddenRow = roster.find(r => r.uuid === hidden.uuid);
			const visibleRow = roster.find(r => r.uuid === visible.uuid);
			assert.ok(hiddenRow);
			assert.equal(hiddenRow.membershipHidden, true);
			assert.equal(visibleRow.membershipHidden, false);
		});
	});
});

test("non-GM Starship Owner omits hidden row from roster context", () => {
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		hiddenUuids: [hidden.uuid],
		canUpdateIds: new Set(["owner"])
	});
	withActorResolver(actors, () => {
		withGameUser({ id: "owner", isGM: false }, () => {
			assert.equal(
				isStarshipCrewMembershipVisibleToUser(ship, hidden.uuid, globalThis.game.user),
				false
			);
			const { roster } = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(roster.length, 1);
			assert.equal(roster[0].uuid, visible.uuid);
			assert.equal(roster.some(r => r.uuid === hidden.uuid), false);
			assert.equal(roster[0].membershipHidden, false);
		});
	});
});

test("encoded hidden profile preserves customRole sibling for reader", () => {
	const ship = makeStarship({ crewUuids: [hidden.uuid], hiddenUuids: [hidden.uuid] });
	const key = hidden.uuid.replaceAll(".", "\uFF0E");
	assert.equal(ship.flags.sw5e.starship.crewProfiles[key].customRole, "Covert");
	assert.equal(ship.flags.sw5e.starship.crewProfiles[key].hidden, true);
});

test("Core crew signature dirty when membershipHidden flips (Hide/Reveal refresh)", () => {
	const baseRow = {
		uuid: hidden.uuid,
		name: "Hidden",
		img: "icons/svg/mystery-man.svg",
		searchText: "hidden",
		assignmentSubtitle: "",
		customRole: "Covert",
		membershipHidden: true,
		active: false,
		isPilot: false,
		isCrew: true,
		isPassenger: false,
		canUndeployPilot: false,
		canSetPilot: true,
		canToggleActive: false,
		canRemove: true
	};
	const hiddenMeta = { crew: { roster: [baseRow] }, crewRoleGroups: [] };
	const revealedMeta = {
		crew: { roster: [{ ...baseRow, membershipHidden: false }] },
		crewRoleGroups: []
	};
	const hiddenPayload = signaturePayloadCoreCrew(hiddenMeta);
	const revealedPayload = signaturePayloadCoreCrew(revealedMeta);
	assert.equal(hiddenPayload.crew.roster[0].membershipHidden, true);
	assert.equal(revealedPayload.crew.roster[0].membershipHidden, false);
	assert.notEqual(
		stableSignature(hiddenPayload),
		stableSignature(revealedPayload)
	);
});

test("Hide then Reveal roster context membershipHidden flips with flags", () => {
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		hiddenUuids: [hidden.uuid],
		canUpdateIds: new Set(["gm"])
	});
	withActorResolver(actors, () => {
		withGameUser({ id: "gm", isGM: true }, () => {
			const hiddenCtx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			const hiddenRow = hiddenCtx.roster.find(r => r.uuid === hidden.uuid);
			assert.equal(hiddenRow?.membershipHidden, true);

			// Simulate Reveal persistence: remove profile entry (Reveal empty-profile path).
			const key = hidden.uuid.replaceAll(".", "\uFF0E");
			delete ship.flags.sw5e.starship.crewProfiles[key];
			assert.equal(getStarshipCrewMembershipHidden(ship, hidden.uuid), false);

			const revealedCtx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			const revealedRow = revealedCtx.roster.find(r => r.uuid === hidden.uuid);
			assert.equal(revealedRow?.membershipHidden, false);
			assert.notEqual(
				stableSignature(signaturePayloadCoreCrew({
					crew: { roster: hiddenCtx.roster },
					crewRoleGroups: []
				})),
				stableSignature(signaturePayloadCoreCrew({
					crew: { roster: revealedCtx.roster },
					crewRoleGroups: []
				}))
			);
		});
	});
});

test("Flight Manifest localization and expand/collapse labels", () => {
	assert.equal(EN_JSON["SW5E.StarshipCrewPanelTitle"], "Flight Manifest");
	assert.equal(EN_JSON["SW5E.StarshipSheet.CoreCrewExpand"], "Expand Flight Manifest");
	assert.equal(EN_JSON["SW5E.StarshipSheet.CoreCrewCollapse"], "Collapse Flight Manifest");
});

test("Crew panel header consolidates title+count; Assigned Crew bar removed", () => {
	assert.match(
		CREW_LAYER_HBS,
		/sw5e-starship-crew-panel-title[^>]*>\{\{\s*localize "SW5E\.StarshipCrewPanelTitle"\s*\}\}/
	);
	assert.match(
		CREW_LAYER_HBS,
		/sw5e-starship-crew-panel-count[^>]*>\(\{\{crew\.visibleQuantitySum\}\}\)/
	);
	assert.match(CREW_LAYER_HBS, /data-sw5e-crew-command="open-add-crew"/);
	assert.match(CREW_LAYER_HBS, /data-core-panel="crew"/);
	assert.match(CREW_LAYER_HBS, /sw5e-starship-core-crew-collapse/);
	assert.match(CREW_LAYER_HBS, /sw5e-starship-crew-assigned-search/);
	assert.doesNotMatch(CREW_LAYER_HBS, /sw5e-starship-crew-status/);
	assert.doesNotMatch(CREW_LAYER_HBS, /SW5E\.StarshipCrewAssignedLabel/);
	assert.match(CREW_LAYER_HBS, /sw5e-crew-row--membership-hidden/);
	assert.match(CREW_LESS, /sw5e-crew-row--membership-hidden/);
	assert.match(CREW_LESS, /opacity:\s*0\.45/);
});

test("GM header count source includes hidden rows; non-GM excludes", () => {
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		hiddenUuids: [hidden.uuid],
		canUpdateIds: new Set(["gm", "owner"])
	});
	withActorResolver(actors, () => {
		withGameUser({ id: "gm", isGM: true }, () => {
			const { roster } = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(roster.length, 2, "GM Flight Manifest count uses filtered roster length including hidden");
		});
		withGameUser({ id: "owner", isGM: false }, () => {
			const { roster } = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(roster.length, 1, "non-GM Flight Manifest count excludes hidden memberships");
		});
	});
});

test("Hide/Reveal changes viewer roster length used by header count + signature", () => {
	const ship = makeStarship({
		crewUuids: [visible.uuid, hidden.uuid],
		hiddenUuids: [hidden.uuid],
		canUpdateIds: new Set(["gm", "owner"])
	});
	withActorResolver(actors, () => {
		let ownerHiddenCtx;
		withGameUser({ id: "gm", isGM: true }, () => {
			const ctx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(ctx.roster.length, 2);
		});
		withGameUser({ id: "owner", isGM: false }, () => {
			ownerHiddenCtx = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(ownerHiddenCtx.roster.length, 1);
		});

		const key = hidden.uuid.replaceAll(".", "\uFF0E");
		delete ship.flags.sw5e.starship.crewProfiles[key];

		withGameUser({ id: "gm", isGM: true }, () => {
			const gmRevealed = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(gmRevealed.roster.length, 2);
			assert.equal(gmRevealed.roster.find(r => r.uuid === hidden.uuid)?.membershipHidden, false);
		});
		withGameUser({ id: "owner", isGM: false }, () => {
			const ownerRevealed = buildVehicleStarshipCrewContext(ship, { sheetEditable: true });
			assert.equal(ownerRevealed.roster.length, 2);
			assert.notEqual(
				stableSignature(signaturePayloadCoreCrew({
					crew: { roster: ownerHiddenCtx.roster },
					crewRoleGroups: []
				})),
				stableSignature(signaturePayloadCoreCrew({
					crew: { roster: ownerRevealed.roster },
					crewRoleGroups: []
				})),
				"Core crew signature dirties when visible roster length used by header changes"
			);
		});
	});
});

test("Core crew signature dirties when roster length changes (header count)", () => {
	const one = {
		uuid: visible.uuid,
		name: "Visible",
		membershipHidden: false
	};
	const two = [
		one,
		{ uuid: hidden.uuid, name: "Hidden", membershipHidden: true }
	];
	assert.notEqual(
		stableSignature(signaturePayloadCoreCrew({ crew: { roster: [one] }, crewRoleGroups: [] })),
		stableSignature(signaturePayloadCoreCrew({ crew: { roster: two }, crewRoleGroups: [] }))
	);
});

console.log(`\n${passed} tests passed`);
