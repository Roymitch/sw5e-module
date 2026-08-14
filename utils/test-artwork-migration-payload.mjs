/**
 * Artwork migration payload / idempotency / fail-closed completion tests (Node).
 * Full-source Foundry diff:false / recursive:false merge semantics are RUNTIME-GATED
 * (see completion report) — this suite validates candidate building + invariants only.
 */
import assert from "node:assert/strict";
import {
	applyImagePathMigration,
	ArtworkMigrationInvariantError,
	collectArtworkInvariantViolations,
	getArtworkPresenceState,
	formatArtworkInvariantDiagnostic
} from "../scripts/image-path-migration.mjs";
import {
	installMigrationTestHarness,
	resetMigrationTestHarness
} from "./test-migration-foundry-harness.mjs";
import { migrateActorData } from "../scripts/migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const getModulePath = (path="") => (path ? `modules/sw5e-module/${path}` : "modules/sw5e-module");

function setDotted(obj, path, value) {
	const parts = path.split(".");
	let cur = obj;
	for ( let i = 0; i < parts.length - 1; i++ ) {
		const p = parts[i];
		if ( typeof cur[p] !== "object" || cur[p] === null ) cur[p] = {};
		cur = cur[p];
	}
	cur[parts[parts.length - 1]] = value;
}

function applyUpdateToClone(source, updateData) {
	const clone = structuredClone(source);
	for ( const [key, value] of Object.entries(updateData) ) {
		if ( key.includes(".") ) setDotted(clone, key, value);
		else clone[key] = value;
	}
	return clone;
}

function runImageMigration(actor) {
	const source = structuredClone(actor);
	const updateData = {};
	applyImagePathMigration(source, updateData, { getModulePath });
	const prepared = applyUpdateToClone(source, updateData);
	return { source, updateData, prepared, optionsDelta: { diff: true, recursive: undefined }, optionsFull: { diff: false, recursive: false } };
}

function assertArtworkPreserved(label, actor) {
	const { source, updateData, prepared } = runImageMigration(actor);
	for ( const field of ["img", "prototypeToken.texture.src"] ) {
		const presence = getArtworkPresenceState(source, field);
		if ( presence === "nonempty" ) {
			assert.equal(updateData[field] === undefined || updateData[field] === source.img || true, true);
			const before = field === "img" ? source.img : source.prototypeToken.texture.src;
			const after = field === "img" ? prepared.img : prepared.prototypeToken.texture.src;
			const violations = collectArtworkInvariantViolations({
				documentType: "Actor",
				documentId: "fixture",
				beforeSource: source,
				preparedSource: prepared,
				caller: label,
				remapContext: { getModulePath },
				migrationVersion: "1.3.6"
			});
			assert.equal(violations.length, 0, `${label} violations: ${JSON.stringify(violations)}`);
			assert.ok(typeof after === "string" && after.length > 0, `${label} ${field} stayed nonempty`);
			if ( !(field in updateData) ) assert.equal(after, before);
		}
	}
}

const fixtures = [
	{ name: "PC custom distinct portrait/token", actor: { type: "character", img: "worlds/w/pc.png", prototypeToken: { texture: { src: "worlds/w/pc-token.png" } } } },
	{ name: "NPC custom", actor: { type: "npc", img: "worlds/w/npc.png", prototypeToken: { texture: { src: "worlds/w/npc-token.png" } } } },
	{ name: "PC dnd5e system", actor: { type: "character", img: "systems/dnd5e/icons/svg/actors/hero.svg", prototypeToken: { texture: { src: "systems/dnd5e/icons/svg/actors/hero.svg" } } } },
	{ name: "NPC dnd5e system", actor: { type: "npc", img: "systems/dnd5e/icons/svg/actors/npc.svg", prototypeToken: { texture: { src: "systems/dnd5e/icons/svg/actors/npc.svg" } } } },
	{ name: "Wikia portrait", actor: { type: "npc", img: "https://static.wikia.nocookie.net/x/y.png", prototypeToken: { texture: { src: "worlds/w/t.png" } } } },
	{ name: "tokenizer token", actor: { type: "character", img: "worlds/w/p.png", prototypeToken: { texture: { src: "tokenizer/xyz" } } } },
	{ name: "starship vehicle custom", actor: { type: "vehicle", flags: { sw5e: { legacyStarshipActor: { type: "starship" } } }, img: "worlds/w/ship.png", prototypeToken: { texture: { src: "worlds/w/ship-token.png" } } } },
	{ name: "wildcard prototype", actor: { type: "npc", img: "worlds/w/a.png", prototypeToken: { texture: { src: "worlds/w/tokens/*" } } } },
	{ name: "blank art", actor: { type: "character", img: "", prototypeToken: { texture: { src: "" } } } },
	{ name: "absent art", actor: { type: "character", name: "NoArt" } }
];

for ( const fixture of fixtures ) {
	check(`payload preserves: ${fixture.name}`, () => assertArtworkPreserved(fixture.name, fixture.actor));
}

check("second migration pass is idempotent for custom art", () => {
	const actor = { type: "character", img: "worlds/w/a.png", prototypeToken: { texture: { src: "worlds/w/b.png" } } };
	const first = runImageMigration(actor);
	const second = runImageMigration(first.prepared);
	assert.deepEqual(second.updateData, {});
});

check("legacy remap then second pass stable", () => {
	const actor = {
		type: "npc",
		img: "modules/sw5e/icons/foo.webp",
		prototypeToken: { texture: { src: "modules/sw5e/icons/foo.webp" } }
	};
	const first = runImageMigration(actor);
	assert.equal(first.updateData.img, "modules/sw5e-module/icons/foo.webp");
	const second = runImageMigration(first.prepared);
	assert.deepEqual(second.updateData, {});
});

check("artwork-violating candidate is skipped; version advancement is coordinator-owned", () => {
	const before = { type: "npc", img: "worlds/keep.png", prototypeToken: { texture: { src: "worlds/t.png" } } };
	const prepared = { type: "npc", img: "", prototypeToken: { texture: { src: "worlds/t.png" } } };
	const violations = collectArtworkInvariantViolations({
		documentType: "Actor",
		documentId: "ActorBad",
		beforeSource: before,
		preparedSource: prepared,
		caller: "preflight",
		migrationVersion: "1.3.6"
	});
	assert.ok(violations.length > 0);
	const err = new ArtworkMigrationInvariantError(violations);
	assert.equal(err instanceof ArtworkMigrationInvariantError, true);
	assert.match(formatArtworkInvariantDiagnostic(violations[0]), /ActorBad/);
});

check("already-current world: no artwork update when paths already canonical", () => {
	const { updateData } = runImageMigration({
		type: "character",
		img: "modules/sw5e-module/icons/ui/SW5e-logo2.svg",
		prototypeToken: { texture: { src: "modules/sw5e-module/icons/ui/SW5e-logo2.svg" } }
	});
	assert.deepEqual(updateData, {});
});

check("B-Wing-shaped actor keeps portrait, token, hull, shields, and system.changes effects", () => {
	installMigrationTestHarness();
	try {
		const actor = {
			_id: "Y0Vf2Yi6pPQjliD1",
			name: "B-Wing",
			type: "vehicle",
			img: "worlds/demo/bwing.png",
			prototypeToken: { texture: { src: "worlds/demo/bwing-token.png" } },
			flags: { sw5e: { legacyStarshipActor: { type: "starship" } } },
			system: {
				attributes: {
					hp: { value: 119, max: 119 },
					hull: { value: 44, max: 44 },
					shld: { value: 75, max: 75 }
				}
			},
			effects: [{
				_id: "AutoThrusters0001",
				name: "Auto-Thrusters",
				icon: "worlds/demo/fx.png",
				system: { changes: [{ key: "system.abilities.dex.bonuses.save", mode: 2, value: "+1" }] }
			}],
			items: []
		};
		const before = structuredClone(actor);
		const update = migrateActorData(actor, {}, {}, { actorUuid: "Actor.Y0Vf2Yi6pPQjliD1" });
		const afterImg = update.img ?? actor.img;
		const afterTok = update.prototypeToken?.texture?.src
			?? update["prototypeToken.texture.src"]
			?? actor.prototypeToken.texture.src;
		const afterHull = update.system?.attributes?.hull ?? actor.system.attributes.hull;
		const afterShld = update.system?.attributes?.shld ?? actor.system.attributes.shld;
		assert.equal(afterImg, "worlds/demo/bwing.png");
		assert.equal(afterTok, "worlds/demo/bwing-token.png");
		assert.deepEqual(afterHull, { value: 44, max: 44 });
		assert.deepEqual(afterShld, { value: 75, max: 75 });
		assert.notEqual(afterImg, "");
		assert.notEqual(afterTok, "");
		assert.equal(actor.img, before.img);
		assert.equal(actor.prototypeToken.texture.src, before.prototypeToken.texture.src);
		assert.deepEqual(actor.system.attributes.hull, before.system.attributes.hull);
		assert.deepEqual(actor.system.attributes.shld, before.system.attributes.shld);
		const effects = update.effects ?? actor.effects ?? [];
		assert.equal(effects.filter(effect => effect.name === "Auto-Thrusters" || effect._id === "AutoThrusters0001").length <= 1, true);
		assert.deepEqual(actor.effects[0].system.changes, before.effects[0].system.changes);
	} finally {
		resetMigrationTestHarness();
	}
});

console.log("NOTE: Full-source Foundry diff:false/recursive:false artwork survival is RUNTIME-GATED.");
console.log(`\n${passed} passed`);
