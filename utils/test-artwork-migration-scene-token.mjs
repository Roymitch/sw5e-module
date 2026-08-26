/**
 * Scene token / ActorDelta artwork field independence tests (Node).
 */
import assert from "node:assert/strict";
import {
	applyImagePathMigration,
	collectArtworkInvariantViolations
} from "../scripts/image-path-migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const getModulePath = (path="") => (path ? `modules/sw5e-module/${path}` : "modules/sw5e-module");

function migrateTokenLike(doc) {
	const update = {};
	applyImagePathMigration(doc, update, { getModulePath });
	return update;
}

check("linked token override texture preserved independently of actor", () => {
	const actor = {
		type: "character",
		img: "worlds/w/actor.png",
		prototypeToken: { texture: { src: "worlds/w/proto.png" } }
	};
	const token = {
		actorLink: true,
		actorId: "A1",
		texture: { src: "worlds/w/placed-override.png" }
	};
	assert.deepEqual(migrateTokenLike(actor), {});
	assert.deepEqual(migrateTokenLike(token), {});
});

check("unlinked token custom texture preserved", () => {
	const token = {
		actorLink: false,
		actorId: "A2",
		texture: { src: "https://example.com/token.png" }
	};
	assert.deepEqual(migrateTokenLike(token), {});
});

check("unlinked ActorDelta portrait preserved", () => {
	const deltaActor = {
		type: "npc",
		img: "worlds/w/delta-portrait.png",
		prototypeToken: { texture: { src: "worlds/w/delta-proto.png" } }
	};
	assert.deepEqual(migrateTokenLike(deltaActor), {});
});

check("token wildcard and dnd5e system path preserved", () => {
	assert.deepEqual(migrateTokenLike({ texture: { src: "worlds/w/tokens/*" } }), {});
	assert.deepEqual(migrateTokenLike({ texture: { src: "systems/dnd5e/icons/svg/mystery-man.svg" } }), {});
});

check("scene token invariant treats texture.src separately from actor img", () => {
	const beforeToken = { _id: "T1", texture: { src: "worlds/w/placed.png" } };
	const afterToken = { _id: "T1", texture: { src: "worlds/w/placed.png" }, actorId: "A1" };
	const violations = collectArtworkInvariantViolations({
		documentType: "Token",
		documentId: "T1",
		beforeSource: beforeToken,
		preparedSource: afterToken,
		caller: "migrateWorld:Scene.tokens",
		migrationVersion: "1.3.6"
	});
	assert.equal(violations.length, 0);
});

check("scene token wipe detected independently", () => {
	const beforeToken = { _id: "T1", texture: { src: "worlds/w/placed.png" } };
	const afterToken = { _id: "T1", texture: { src: "" } };
	const violations = collectArtworkInvariantViolations({
		documentType: "Token",
		documentId: "T1",
		beforeSource: beforeToken,
		preparedSource: afterToken,
		caller: "migrateWorld:Scene.tokens",
		migrationVersion: "1.3.6"
	});
	assert.equal(violations.length, 1);
	assert.equal(violations[0].protectedField, "texture.src");
});

console.log(`\n${passed} passed`);
