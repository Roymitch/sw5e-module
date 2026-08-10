import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	COLLECTION_ID,
	COMMITTED_PACK_SOURCE,
	PACK_NAME,
	SANDBOX_AUDIT,
	SANDBOX_PROTOTYPE,
	SOURCE_FILE,
	SOURCE_IDENTITY,
	SOURCE_VISIBLE
} from "./paths.mjs";
import {
	CREATURE_TYPE_FOLDERS,
	getCreatureTypeFolder
} from "./creature-type-folders.mjs";
import { loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import {
	applyActorPublicationSource,
	assertValidActorPublicationSource,
	VGH_PROVENANCE_FLAG
} from "./source-provenance.mjs";
import { validateWriteGuard } from "./validate.mjs";
import { assertAllowedOutputRoot } from "./write-guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

let total = 0;
let passed = 0;
function test(name, fn) {
	total += 1;
	try {
		fn();
		passed += 1;
		console.log(`ok - ${name}`);
	} catch ( error ) {
		console.error(`not ok - ${name}`);
		console.error(error);
		process.exitCode = 1;
	}
}

test("module.json registers the VGH pack under Monsters", () => {
	const moduleJson = JSON.parse(fs.readFileSync(path.join(ROOT, "module.json"), "utf8"));
	const pack = moduleJson.packs.find(entry => entry.name === PACK_NAME);
	assert.ok(pack, `missing ${PACK_NAME} pack definition`);
	assert.equal(pack.label, SOURCE_VISIBLE);
	assert.equal(pack.path, "packs/veshs-galactic-holodex");
	assert.equal(pack.type, "Actor");
	const systemContent = moduleJson.packFolders.find(folder => folder.name === "SW5E System Content");
	assert.ok(systemContent, "missing SW5E System Content pack folder");
	const monstersFolder = systemContent.folders.find(folder => folder.name === "Monsters");
	assert.ok(monstersFolder, "missing Monsters pack folder");
	assert.ok(monstersFolder.packs.includes(PACK_NAME), "Monsters folder missing VGH pack");
	assert.ok(monstersFolder.packs.includes("snv-monsters"), "existing SnV pack must remain registered");
	assert.ok(monstersFolder.packs.includes("monsters"), "legacy monsters pack must remain registered");
});

test("paths are VGH-specific and do not point at SnV", () => {
	assert.equal(PACK_NAME, "veshs-galactic-holodex");
	assert.equal(COLLECTION_ID, "sw5e-module.veshs-galactic-holodex");
	assert.equal(SOURCE_IDENTITY, "veshs-galactic-holodex");
	assert.equal(SOURCE_FILE, "ai/Veshs_Galactic_Holodex.md");
	assert.equal(SOURCE_VISIBLE, "Vesh's Galactic Holodex");
	assert.match(COMMITTED_PACK_SOURCE, /packs[\\/]_source[\\/]veshs-galactic-holodex$/);
	assert.match(SANDBOX_AUDIT, /ai[\\/]audits[\\/]veshs-galactic-holodex$/);
	assert.match(SANDBOX_PROTOTYPE, /ai[\\/]prototypes[\\/]veshs-galactic-holodex$/);
});

test("creature-type folders use a VGH namespace distinct from SnV", () => {
	const beast = getCreatureTypeFolder("Beast");
	assert.ok(beast, "missing Beast folder");
	assert.equal(beast.semanticKey, "vgh-folder:Beast");
	assert.notEqual(beast.id, "ebd87deffbaf7f14");
	assert.equal(CREATURE_TYPE_FOLDERS["Force Entity"].semanticKey, "vgh-folder:Force Entity");
});

test("identity map metadata targets the VGH collection and remains self-consistent", () => {
	const map = loadIdentityMap();
	const summary = summarizeIdentityMap(map);
	assert.equal(map.pack, PACK_NAME);
	assert.equal(map.collectionId, COLLECTION_ID);
	assert.equal(map.sourceIdentity, SOURCE_IDENTITY);
	assert.equal(map.sourceFile, SOURCE_FILE);
	assert.equal(map.visibleActorSource, SOURCE_VISIBLE);
	assert.ok(summary.actors >= 0);
	assert.ok(summary.folders >= 0);
	for ( const semanticKey of Object.keys(map.actors || {}) ) {
		assert.match(semanticKey, /^vgh:/);
	}
	for ( const semanticKey of Object.keys(map.folders || {}) ) {
		assert.match(semanticKey, /^vgh-folder:/);
	}
});

test("write guard is fail-closed and sandbox-scoped", () => {
	assert.equal(validateWriteGuard().ok, true);
	assert.throws(() => assertAllowedOutputRoot("packs/_source/snv-monsters"));
	assert.throws(() => assertAllowedOutputRoot("packs/_source/monsters"));
	assert.throws(() => assertAllowedOutputRoot("packs/_source/veshs-galactic-holodex"));
	assert.doesNotThrow(() => assertAllowedOutputRoot(SANDBOX_AUDIT));
	assert.doesNotThrow(() => assertAllowedOutputRoot(SANDBOX_PROTOTYPE));
});

test("actor publication source helper stamps visible source and internal provenance", () => {
	const actor = applyActorPublicationSource({
		name: "Test Actor",
		system: { source: { custom: "" }, details: { source: { custom: "" } } },
		flags: { sw5e: {} }
	}, {
		sourceEntry: "Test Actor",
		sourceSection: "Beastiary",
		sourceHash: "HASH",
		semanticKey: "vgh:Beast:test-actor",
		generatorVersion: "phase1-test"
	});
	assert.equal(actor.system.source.custom, SOURCE_VISIBLE);
	assert.equal(actor.system.details.source.custom, SOURCE_VISIBLE);
	assert.equal(actor.flags.sw5e[VGH_PROVENANCE_FLAG].sourceIdentity, SOURCE_IDENTITY);
	assert.equal(actor.flags.sw5e[VGH_PROVENANCE_FLAG].sourceFile, SOURCE_FILE);
	assert.equal(actor.flags.sw5e[VGH_PROVENANCE_FLAG].semanticKey, "vgh:Beast:test-actor");
	assert.doesNotThrow(() => assertValidActorPublicationSource(actor));
});

test("actor publication source validator rejects SnV, VGH-only, and empty visible source values", () => {
	for ( const value of ["SnV", "Scum and Villainy", "SnV_Final.md", "VGH", ""] ) {
		assert.throws(() => assertValidActorPublicationSource({
			system: { source: { custom: value }, details: { source: { custom: value } } },
			flags: { sw5e: { [VGH_PROVENANCE_FLAG]: {
				sourceIdentity: SOURCE_IDENTITY,
				sourceFile: SOURCE_FILE,
				sourceSection: "Beastiary",
				sourceHash: "HASH",
				semanticKey: "vgh:Beast:test",
				generatorVersion: "phase1-test"
			} } }
		}), `expected visible source rejection for ${JSON.stringify(value)}`);
	}
});

console.log(`1..${total}`);
if ( process.exitCode ) process.exit(process.exitCode);
