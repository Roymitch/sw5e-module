/**
 * Offline tests for artwork path preservation / approved remaps.
 */
import assert from "node:assert/strict";
import {
	applyImagePathMigration,
	ArtworkMigrationInvariantError,
	collectArtworkInvariantViolations,
	getArtworkPresenceState,
	getAuthorizedMonsterTokenPathFromAvatar,
	isAuthorizedArtworkRemap,
	preserveImagePath,
	remapKnownLegacyImagePath
} from "../scripts/image-path-migration.mjs";

let passed = 0;
function check(name, fn) {
	fn();
	passed += 1;
	console.log(`ok - ${name}`);
}

const getModulePath = (path="") => (path ? `modules/sw5e-module/${path}` : "modules/sw5e-module");

function migrate(actor) {
	return applyImagePathMigration(structuredClone(actor), {}, { getModulePath });
}

check("preserveImagePath returns input", () => {
	assert.equal(preserveImagePath("worlds/x/a.png"), "worlds/x/a.png");
});

check("absent img emits no update key", () => {
	const update = migrate({ type: "character", name: "A", prototypeToken: { texture: { src: "worlds/x/t.png" } } });
	assert.equal("img" in update, false);
	assert.equal(getArtworkPresenceState({ type: "character" }, "img"), "absent");
});

check("null img emits no update key", () => {
	const update = migrate({ type: "character", img: null, prototypeToken: { texture: { src: "worlds/x/t.png" } } });
	assert.equal("img" in update, false);
});

check("empty img emits no update key", () => {
	const update = migrate({ type: "character", img: "", prototypeToken: { texture: { src: "" } } });
	assert.deepEqual(update, {});
});

const preserveCases = [
	["custom world portrait", { type: "character", img: "worlds/demo/portrait.png", prototypeToken: { texture: { src: "worlds/demo/token.png" } } }],
	["custom module portrait", { type: "character", img: "modules/sw5e-module/icons/ui/SW5e-logo2.svg", prototypeToken: { texture: { src: "modules/sw5e-module/icons/ui/SW5e-logo2.svg" } } }],
	["dnd5e system portrait", { type: "npc", img: "systems/dnd5e/icons/svg/actors/npc.svg", prototypeToken: { texture: { src: "systems/dnd5e/icons/svg/actors/npc.svg" } } }],
	["mystery-man", { type: "character", img: "icons/svg/mystery-man.svg", prototypeToken: { texture: { src: "icons/svg/mystery-man.svg" } } }],
	["item-bag", { type: "character", img: "icons/svg/item-bag.svg", prototypeToken: { texture: { src: "icons/svg/item-bag.svg" } } }],
	["tokenizer", { type: "character", img: "tokenizer/abc", prototypeToken: { texture: { src: "tokenizer/abc" } } }],
	["wikia", { type: "npc", img: "https://static.wikia.nocookie.net/foo/bar.png", prototypeToken: { texture: { src: "https://static.wikia.nocookie.net/foo/t.png" } } }],
	["artstation", { type: "npc", img: "https://cdna.artstation.com/foo.jpg", prototypeToken: { texture: { src: "https://cdnb.artstation.com/t.jpg" } } }],
	["other https", { type: "character", img: "https://example.com/a%20b.png", prototypeToken: { texture: { src: "https://example.com/token.png" } } }],
	["spaces in path", { type: "character", img: "worlds/demo/my art.png", prototypeToken: { texture: { src: "worlds/demo/my token.png" } } }],
	["wildcard token", { type: "npc", img: "worlds/demo/portraits/*", prototypeToken: { texture: { src: "worlds/demo/tokens/*" } } }],
	["data uri", { type: "character", img: "data:image/png;base64,aaa", prototypeToken: { texture: { src: "data:image/png;base64,bbb" } } }]
];

for ( const [label, actor] of preserveCases ) {
	check(`preserves nonempty: ${label}`, () => {
		const beforeImg = actor.img;
		const beforeTok = actor.prototypeToken.texture.src;
		const update = migrate(actor);
		assert.equal("img" in update, false, `img should be omitted for ${label}`);
		assert.equal("prototypeToken.texture.src" in update, false, `token src should be omitted for ${label}`);
		assert.equal(beforeImg, actor.img);
		assert.equal(beforeTok, actor.prototypeToken.texture.src);
	});
}

check("legacy modules/sw5e/ remaps to sw5e-module", () => {
	const update = migrate({
		type: "character",
		img: "modules/sw5e/icons/foo.webp",
		prototypeToken: { texture: { src: "modules/sw5e/icons/foo.webp" } }
	});
	assert.equal(update.img, "modules/sw5e-module/icons/foo.webp");
	assert.equal(update["prototypeToken.texture.src"], "modules/sw5e-module/icons/foo.webp");
});

check("companion folder remaps", () => {
	const update = migrate({
		type: "npc",
		img: "icons/companions/beast.webp",
		prototypeToken: { texture: { src: "icons/companions/beast.webp" } }
	});
	assert.equal(update.img, "icons/packs/Companions/beast.webp");
	assert.equal(update["prototypeToken.texture.src"], "icons/packs/Companions/beast.webp");
});

check("species pack filename remap", () => {
	const path = "modules/sw5e-module/icons/packs/species/Kel Dor.webp";
	assert.equal(
		remapKnownLegacyImagePath(path, { getModulePath }),
		"modules/sw5e-module/icons/packs/species/KelDor.webp"
	);
});

check("authorized monster Avatar→Token when token equals Avatar", () => {
	const avatar = "modules/sw5e-module/icons/packs/monsters/Wampa/Avatar.webp";
	assert.equal(getAuthorizedMonsterTokenPathFromAvatar(avatar), "modules/sw5e-module/icons/packs/monsters/Wampa/Token.webp");
	const update = migrate({
		type: "npc",
		img: avatar,
		prototypeToken: { texture: { src: avatar } }
	});
	assert.equal(update["prototypeToken.texture.src"], "modules/sw5e-module/icons/packs/monsters/Wampa/Token.webp");
	assert.equal("img" in update, false);
});

check("no Avatar→Token for custom folders", () => {
	const avatar = "worlds/demo/Avatar.webp";
	assert.equal(getAuthorizedMonsterTokenPathFromAvatar(avatar), "");
	const update = migrate({
		type: "npc",
		img: avatar,
		prototypeToken: { texture: { src: avatar } }
	});
	assert.equal("prototypeToken.texture.src" in update, false);
});

check("no Avatar→Token when token intentionally differs", () => {
	const update = migrate({
		type: "npc",
		img: "modules/sw5e-module/icons/packs/monsters/Wampa/Avatar.webp",
		prototypeToken: { texture: { src: "worlds/demo/custom-token.png" } }
	});
	assert.equal("prototypeToken.texture.src" in update, false);
});

check("authorized pack-monster Avatar→Token still applies on character type", () => {
	const update = migrate({
		type: "character",
		img: "modules/sw5e-module/icons/packs/monsters/Wampa/Avatar.webp",
		prototypeToken: { texture: { src: "modules/sw5e-module/icons/packs/monsters/Wampa/Avatar.webp" } }
	});
	assert.equal(update["prototypeToken.texture.src"], "modules/sw5e-module/icons/packs/monsters/Wampa/Token.webp");
});

check("isAuthorizedArtworkRemap recognizes companion remap", () => {
	assert.equal(
		isAuthorizedArtworkRemap(
			"icons/companions/a.webp",
			"icons/packs/Companions/a.webp",
			{ prop: "img", objectData: {}, getModulePath }
		),
		true
	);
	assert.equal(
		isAuthorizedArtworkRemap("worlds/x.png", "", { prop: "img", objectData: {} }),
		false
	);
});

check("invariant catches nonempty cleared to empty", () => {
	const before = { type: "npc", img: "worlds/x.png", prototypeToken: { texture: { src: "worlds/t.png" } } };
	const after = { type: "npc", img: "", prototypeToken: { texture: { src: "worlds/t.png" } } };
	const violations = collectArtworkInvariantViolations({
		documentType: "Actor",
		documentId: "abc",
		beforeSource: before,
		preparedSource: after,
		caller: "test",
		migrationVersion: "1.3.6"
	});
	assert.equal(violations.length, 1);
	assert.equal(violations[0].protectedField, "img");
	const err = new ArtworkMigrationInvariantError(violations);
	assert.equal(err.name, "ArtworkMigrationInvariantError");
});

check("invariant allows authorized remap", () => {
	const before = {
		type: "npc",
		img: "modules/sw5e/icons/foo.webp",
		prototypeToken: { texture: { src: "modules/sw5e/icons/foo.webp" } }
	};
	const after = {
		type: "npc",
		img: "modules/sw5e-module/icons/foo.webp",
		prototypeToken: { texture: { src: "modules/sw5e-module/icons/foo.webp" } }
	};
	const violations = collectArtworkInvariantViolations({
		documentType: "Actor",
		documentId: "abc",
		beforeSource: before,
		preparedSource: after,
		caller: "test",
		remapContext: { getModulePath },
		migrationVersion: "1.3.6"
	});
	assert.equal(violations.length, 0);
});

console.log(`\n${passed} passed`);
