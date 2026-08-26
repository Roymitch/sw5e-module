#!/usr/bin/env node
/**
 * Offline tests for Bug 29 starship attack firing-crew PB helpers.
 */
import assert from "node:assert/strict";
import {
	applyStarshipAttackCrewPbInjection,
	buildStarshipResponsibleCrewCandidates,
	classifyStarshipAttackCrewPbInjection,
	clearStarshipAttackFiringCrewState,
	createStarshipAttackInvocationId,
	determineResponsibleCrewSelectionMode,
	isStarshipFastForward,
	publicChatExcludesResponsibleCrewIdentity,
	storeStarshipAttackFiringCrewState,
	STARSHIP_ATTACK_CREW_PB_DATA_KEY,
	STARSHIP_ATTACK_CREW_PB_PART,
	STARSHIP_ATTACK_FIRING_CREW_PB_KEY,
	STARSHIP_ATTACK_FIRING_CREW_UUID_KEY,
	STARSHIP_ATTACK_INVOCATION_ID_KEY,
	toDialogSafeResponsibleCrewCandidates
} from "../scripts/starship-data.mjs";
import { resolveStarshipAttackRollDialogPosition } from "../scripts/starship-weapon-rolls.mjs";

let passed = 0;
function test(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

function makeParentDeployment(rank) {
	return {
		id: `dep${rank}`,
		type: "feat",
		name: "Gunner",
		flags: {
			sw5e: {
				legacyDeployment: true,
				deployment: { rank }
			}
		},
		system: {
			type: { value: "deployment", subtype: "" },
			advancement: [{ type: "ItemGrant" }]
		}
	};
}

function makeCrewActor({ uuid, name, prof, rank=1, ownedBy=null }={}) {
	const owners = new Set(ownedBy ? [ownedBy] : []);
	return {
		documentName: "Actor",
		type: "character",
		uuid,
		id: String(uuid).split(".").pop(),
		name,
		img: `icons/${name}.svg`,
		items: [makeParentDeployment(rank)],
		system: { attributes: { prof } },
		testUserPermission(user, level) {
			if ( user?.isGM ) return true;
			if ( level === "OWNER" ) return owners.has(user?.id);
			return false;
		}
	};
}

function makeStarship({ pilotUuid=null, crewUuids=[] }={}) {
	return {
		documentName: "Actor",
		type: "vehicle",
		uuid: "Actor.ship1",
		name: "Test Ship",
		flags: {
			sw5e: {
				legacyStarshipActor: {
					type: "starship",
					system: {
						attributes: {
							deployment: {
								pilot: { value: pilotUuid },
								crew: { items: crewUuids },
								passenger: { items: [] }
							}
						}
					}
				}
			}
		},
		system: { attributes: { prof: 0 } }
	};
}

function installActorResolver(actorsByUuid) {
	const previous = globalThis.fromUuidSync;
	globalThis.fromUuidSync = uuid => actorsByUuid.get(uuid) ?? null;
	return () => {
		if ( previous === undefined ) delete globalThis.fromUuidSync;
		else globalThis.fromUuidSync = previous;
	};
}

globalThis.foundry ??= {};
globalThis.foundry.utils ??= {};
globalThis.foundry.utils.mergeObject = (original={}, other={}, { inplace=true }={}) => {
	const target = inplace ? original : { ...original };
	for ( const [key, value] of Object.entries(other ?? {}) ) {
		if ( value && typeof value === "object" && !Array.isArray(value) ) {
			target[key] = globalThis.foundry.utils.mergeObject(target[key] ?? {}, value, { inplace: false });
		} else {
			target[key] = value;
		}
	}
	return target;
};

test("selection mode 0/1/2+", () => {
	assert.equal(determineResponsibleCrewSelectionMode(0), "none");
	assert.equal(determineResponsibleCrewSelectionMode(1), "automatic");
	assert.equal(determineResponsibleCrewSelectionMode(2), "picker");
});

test("fast-forward detection matches skill contract", () => {
	assert.equal(isStarshipFastForward({ shiftKey: true }), true);
	assert.equal(isStarshipFastForward({ altKey: true }), true);
	assert.equal(isStarshipFastForward({}), false);
});

test("GM with two qualified crew → picker mode", () => {
	const a = makeCrewActor({ uuid: "Actor.a", name: "A", prof: 3, ownedBy: "p1" });
	const b = makeCrewActor({ uuid: "Actor.b", name: "B", prof: 4, ownedBy: "p2" });
	const ship = makeStarship({ pilotUuid: a.uuid, crewUuids: [b.uuid] });
	const restore = installActorResolver(new Map([[a.uuid, a], [b.uuid, b]]));
	try {
		const pack = buildStarshipResponsibleCrewCandidates({
			starshipActor: ship,
			user: { id: "gm", isGM: true }
		});
		assert.equal(pack.selectionMode, "picker");
		assert.equal(pack.candidates.length, 2);
		const safe = toDialogSafeResponsibleCrewCandidates(pack.candidates);
		assert.ok(safe.every(c => !("actor" in c) || c.actor === undefined));
		assert.ok(safe.every(c => c.actorUuid && Number.isFinite(c.proficiencyBonus)));
	} finally {
		restore();
	}
});

test("classify: inject when stock @prof is 0 and crew resolved", () => {
	const result = classifyStarshipAttackCrewPbInjection({
		parts: ["@mod", "@prof"],
		data: { mod: 2, prof: 0 },
		crewProficiency: 5,
		hasResolvedFiringCrew: true,
		actorProf: 0
	});
	assert.equal(result.decision, "inject");
	assert.equal(result.stockProfIsZero, true);
});

test("classify: skip when dedicated crew part already present", () => {
	const result = classifyStarshipAttackCrewPbInjection({
		parts: ["@mod", "@prof", STARSHIP_ATTACK_CREW_PB_PART],
		data: { prof: 0, [STARSHIP_ATTACK_CREW_PB_DATA_KEY]: 5 },
		crewProficiency: 5,
		hasResolvedFiringCrew: true
	});
	assert.equal(result.decision, "skip-already-present");
});

test("classify: skip unexpected nonzero stock @prof (no silent strip)", () => {
	const result = classifyStarshipAttackCrewPbInjection({
		parts: ["@mod", "@prof"],
		data: { prof: 3 },
		crewProficiency: 5,
		hasResolvedFiringCrew: true,
		actorProf: 3
	});
	assert.equal(result.decision, "skip-nonzero-stock-prof");
	assert.equal(result.stockProfIsZero, false);
});

test("classify: skip when no firing crew", () => {
	const result = classifyStarshipAttackCrewPbInjection({
		parts: ["@mod", "@prof"],
		data: { prof: 0 },
		crewProficiency: 5,
		hasResolvedFiringCrew: false
	});
	assert.equal(result.decision, "skip-no-crew");
});

test("apply injects dedicated part once and leaves @prof", () => {
	const processConfig = {
		hookNames: ["attack", "d20Test"],
		[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY]: "Actor.a",
		[STARSHIP_ATTACK_FIRING_CREW_PB_KEY]: 4,
		subject: { actor: { system: { attributes: { prof: 0 } } } }
	};
	const rollConfig = {
		parts: ["@mod", "@prof"],
		data: { mod: 2, prof: 0 }
	};
	const first = applyStarshipAttackCrewPbInjection(processConfig, rollConfig);
	assert.equal(first.injected, true);
	assert.ok(rollConfig.parts.includes(STARSHIP_ATTACK_CREW_PB_PART));
	assert.ok(rollConfig.parts.includes("@prof"));
	assert.equal(rollConfig.data[STARSHIP_ATTACK_CREW_PB_DATA_KEY], 4);

	const second = applyStarshipAttackCrewPbInjection(processConfig, rollConfig);
	assert.equal(second.injected, false);
	assert.equal(second.decision, "skip-already-present");
	assert.equal(rollConfig.parts.filter(p => p === STARSHIP_ATTACK_CREW_PB_PART).length, 1);
});

test("apply reads firing-crew state from invocation map when config keys missing", () => {
	const invocationId = createStarshipAttackInvocationId();
	storeStarshipAttackFiringCrewState(invocationId, {
		actorUuid: "Actor.map",
		proficiencyBonus: 3,
		source: "automatic",
		selectionMode: "automatic"
	});
	try {
		const processConfig = {
			hookNames: ["attack"],
			[STARSHIP_ATTACK_INVOCATION_ID_KEY]: invocationId,
			subject: { actor: { system: { attributes: { prof: 0 } } } }
		};
		const rollConfig = { parts: ["@mod", "@prof"], data: { mod: 2, prof: 0 } };
		const result = applyStarshipAttackCrewPbInjection(processConfig, rollConfig);
		assert.equal(result.injected, true);
		assert.equal(rollConfig.data[STARSHIP_ATTACK_CREW_PB_DATA_KEY], 3);
		assert.equal(processConfig[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY], "Actor.map");
	} finally {
		clearStarshipAttackFiringCrewState(invocationId);
	}
});

test("attack roll dialog position stays in usable vertical band", () => {
	const nearTop = resolveStarshipAttackRollDialogPosition({ clientY: 20 });
	assert.ok(nearTop.top >= 48);
	const mid = resolveStarshipAttackRollDialogPosition({ clientY: 400 });
	assert.ok(mid.top >= 48);
	assert.ok(mid.left >= 48);
});

test("apply does not strip nonzero @prof and does not inject", () => {
	const warnings = [];
	const prevWarn = console.warn;
	console.warn = (...args) => warnings.push(args);
	globalThis.ui = { notifications: { warn: () => {} } };
	try {
		const processConfig = {
			hookNames: ["attack"],
			[STARSHIP_ATTACK_FIRING_CREW_UUID_KEY]: "Actor.a",
			[STARSHIP_ATTACK_FIRING_CREW_PB_KEY]: 4,
			subject: { actor: { system: { attributes: { prof: 3 } } } }
		};
		const rollConfig = {
			parts: ["@mod", "@prof"],
			data: { mod: 2, prof: 3 }
		};
		const result = applyStarshipAttackCrewPbInjection(processConfig, rollConfig);
		assert.equal(result.injected, false);
		assert.equal(result.decision, "skip-nonzero-stock-prof");
		assert.ok(rollConfig.parts.includes("@prof"));
		assert.ok(!rollConfig.parts.includes(STARSHIP_ATTACK_CREW_PB_PART));
		assert.equal(rollConfig.data.prof, 3);
		assert.ok(warnings.length >= 1);
	} finally {
		console.warn = prevWarn;
		delete globalThis.ui;
	}
});

test("public chat audit excludes firing crew identity", () => {
	const ok = publicChatExcludesResponsibleCrewIdentity({
		flavor: "Quad Laser Cannon - Attack Roll",
		speaker: { alias: "Test Ship", actor: "Actor.ship1" },
		flags: { dnd5e: { roll: { type: "attack" } } }
	}, { name: "Mechanic Five", uuid: "Actor.mech5" });
	assert.equal(ok, true);

	const leak = publicChatExcludesResponsibleCrewIdentity({
		flavor: "Attack by Mechanic Five",
		speaker: { alias: "Test Ship" },
		flags: {}
	}, { name: "Mechanic Five", uuid: "Actor.mech5" });
	assert.equal(leak, false);
});

console.log(`\n${passed} tests passed`);
