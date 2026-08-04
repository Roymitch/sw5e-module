/**
 * N2 generator orchestration: N1 parity copy + generalized edge-case emit.
 * Hard-refuses packs/_source/snv-monsters.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { EDGE_CASE_SELECTION } from "./edge-cases.mjs";
import { generateGeneralizedActor } from "./generate-generalized.mjs";
import { loadIdentityMap, resolveActorId } from "./identity.mjs";
import { normalizeName } from "./parse-helpers.mjs";
import {
	COMMITTED_PACK_SOURCE,
	GENERATOR_VERSION,
	SANDBOX_PROTOTYPE,
	SCHEMA_VERSION,
	SNV_FINAL_PATH
} from "./paths.mjs";
import { splitCreatureBlocks } from "./parse.mjs";
import { assertAllowedOutputRoot } from "./write-guard.mjs";

const DUMP = { lineWidth: -1, noRefs: true, quotingType: "'", forceQuotes: false };

function walkYamlFiles(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const p = path.join(dir, ent.name);
		if ( ent.isDirectory() ) walkYamlFiles(p, out);
		else if ( ent.name.endsWith(".yml") ) out.push(p);
	}
	return out;
}

function relPosix(from, to) {
	return path.relative(from, to).split(path.sep).join("/");
}

function loadBodiesByName(markdown) {
	const map = new Map();
	for ( const b of splitCreatureBlocks(markdown) ) {
		map.set(normalizeName(b.name), b.lines.join("\n"));
	}
	return map;
}

/**
 * Architecture note: N1 parity path copies committed YAML (temporary prototype scaffold).
 * Edge cases use generateGeneralizedActor (data-driven).
 */
export function generateSandbox({
	outputRoot = SANDBOX_PROTOTYPE,
	identityMap = loadIdentityMap(),
	irEntries = [],
	snvMarkdown = null
} = {}) {
	const root = assertAllowedOutputRoot(outputRoot);
	const actorsDir = path.join(root, "actors");
	const edgeDir = path.join(root, "edge-cases");
	const foldersDir = path.join(root, "folders");
	const ledgersDir = path.join(root, "ledgers");
	for ( const d of [actorsDir, edgeDir, foldersDir, ledgersDir] ) fs.mkdirSync(d, { recursive: true });

	const markdown = snvMarkdown
		|| (fs.existsSync(SNV_FINAL_PATH) ? fs.readFileSync(SNV_FINAL_PATH, "utf8") : "");
	const bodies = markdown ? loadBodiesByName(markdown) : new Map();

	const emitted = [];
	const exceptions = [];
	const architectureNotes = [];

	// --- N1 folders + actors (parity copy scaffold) ---
	architectureNotes.push({
		path: "generate.mjs:N1-parity-copy",
		dependsOn: "committed pack Actor IDs via identity map",
		classification: "temporary-prototype-scaffold",
		reason: "Preserves exact N1 YAML for parity; not a general generation mechanic"
	});

	for ( const [sk, folder] of Object.entries(identityMap.folders || {}) ) {
		let matched = null;
		for ( const f of walkYamlFiles(COMMITTED_PACK_SOURCE).filter(x => path.basename(x) === "_folder.yml") ) {
			const doc = yaml.load(fs.readFileSync(f, "utf8"));
			if ( doc._id === folder.id ) {
				matched = doc;
				break;
			}
		}
		if ( !matched ) {
			exceptions.push({ category: "other", type: "missing-folder-source", semanticKey: sk });
			continue;
		}
		const dest = path.join(foldersDir, `${sk.replace(/^snv-folder:/, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.yml`);
		fs.writeFileSync(dest, `${yaml.dump(matched, DUMP)}\n`, "utf8");
		emitted.push({ kind: "folder", semanticKey: sk, id: folder.id, path: relPosix(root, dest) });
	}

	const n1Entries = irEntries.filter(e => e.outputSelection === "selected-n1-parity");
	for ( const entry of n1Entries ) {
		const pinned = identityMap.actors?.[entry.semanticKey];
		if ( !pinned ) {
			exceptions.push({ category: "other", type: "n1-selection-missing-pin", semanticKey: entry.semanticKey });
			continue;
		}
		const id = resolveActorId(entry.semanticKey, {}, identityMap);
		let doc = null;
		for ( const f of walkYamlFiles(COMMITTED_PACK_SOURCE) ) {
			if ( path.basename(f) === "_folder.yml" ) continue;
			const candidate = yaml.load(fs.readFileSync(f, "utf8"));
			if ( candidate.type === "npc" && candidate._id === id ) {
				doc = candidate;
				break;
			}
		}
		if ( !doc ) {
			exceptions.push({ category: "other", type: "missing-actor-source", id });
			continue;
		}
		doc.flags = doc.flags || {};
		doc.flags.sw5e = doc.flags.sw5e || {};
		doc.flags.sw5e.snvMonsters = {
			...doc.flags.sw5e.snvMonsters,
			generatorVersion: GENERATOR_VERSION,
			schemaVersion: SCHEMA_VERSION,
			outputSelection: "selected-n1-parity",
			capabilityStatus: entry.capabilityStatus,
			parseStatus: entry.parseStatus,
			productionReadiness: entry.productionReadiness,
			n2SandboxEmit: true,
			pinnedIdentity: true
		};
		const dest = path.join(actorsDir, `${pinned.name.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.yml`);
		fs.writeFileSync(dest, `${yaml.dump(doc, DUMP)}\n`, "utf8");
		emitted.push({ kind: "n1-actor", semanticKey: entry.semanticKey, id, path: relPosix(root, dest) });
	}

	// --- Edge cases via generalized generator ---
	architectureNotes.push({
		path: "generate-generalized.mjs",
		dependsOn: "IR features + attack regex + canonical name index",
		classification: "acceptable-data-driven",
		reason: "No Actor-name branches; capability/exceptions from IR"
	});

	const edgeResults = [];
	const edgeEntries = irEntries.filter(e => e.outputSelection === "selected-edge-case");
	for ( const entry of edgeEntries ) {
		const body = bodies.get(entry.normalizedName) || "";
		const { actor, exceptions: ex, attacksParsed } = generateGeneralizedActor({
			irEntry: entry,
			body,
			nonproduction: true
		});
		const dest = path.join(edgeDir, `${entry.normalizedName.replace(/\s+/g, "-")}.yml`);
		fs.writeFileSync(dest, `${yaml.dump(actor, DUMP)}\n`, "utf8");
		const result = {
			semanticKey: entry.semanticKey,
			parseStatus: entry.parseStatus,
			capabilityStatus: entry.capabilityStatus,
			outputSelection: entry.outputSelection,
			productionReadiness: entry.productionReadiness,
			irValidation: entry.warnings?.length ? "warnings" : "ok",
			generatedSandboxPath: relPosix(root, dest),
			unsupportedFields: entry.unsupportedMechanics,
			exceptions: ex,
			attacksParsed,
			itemCount: actor.items.length,
			artworkStatus: "avatar-fallback-or-mystery-man",
			tempActorId: actor._id,
			nonproduction: true
		};
		edgeResults.push(result);
		for ( const e of ex ) {
			exceptions.push({
				category: mapExceptionCategory(e),
				semanticKey: entry.semanticKey,
				...e
			});
		}
		emitted.push({ kind: "edge-actor", semanticKey: entry.semanticKey, id: actor._id, path: relPosix(root, dest) });
	}

	// Selection coverage note
	const selectedNames = new Set(EDGE_CASE_SELECTION.map(e => normalizeName(e.name)));
	for ( const name of selectedNames ) {
		if ( !edgeEntries.some(e => e.normalizedName === name) ) {
			exceptions.push({
				category: "malformed-source",
				type: "edge-case-not-found-in-ir",
				name
			});
		}
	}

	const exceptionInventory = summarizeExceptions(exceptions);
	fs.writeFileSync(path.join(ledgersDir, "exception-inventory.json"), `${JSON.stringify(exceptionInventory, null, 2)}\n`);
	fs.writeFileSync(path.join(ledgersDir, "emit-manifest.json"), `${JSON.stringify({ generatorVersion: GENERATOR_VERSION, emitted }, null, 2)}\n`);
	fs.writeFileSync(path.join(ledgersDir, "edge-case-results.json"), `${JSON.stringify(edgeResults, null, 2)}\n`);
	fs.writeFileSync(path.join(ledgersDir, "architecture-notes.json"), `${JSON.stringify(architectureNotes, null, 2)}\n`);

	return { outputRoot: root, emitted, exceptions, exceptionInventory, edgeResults, architectureNotes };
}

function mapExceptionCategory(e) {
	const t = `${e.type || ""} ${e.mechanic || ""} ${e.reason || ""}`;
	if ( /canonical-item-match-absent/.test(t) ) return "canonical-item-match-absent";
	if ( /legendary/.test(t) ) return "legendary-complexity";
	if ( /force|tech|power/.test(t) ) return "force-tech-incomplete";
	if ( /qualified-defense/.test(t) ) return "qualified-defense";
	if ( /recharge|limited-uses|reaction|bonus|save-only|unsupported-activity|unsupported-mechanic/.test(t) ) {
		if ( /legendary/.test(t) ) return "legendary-complexity";
		if ( /force|tech|power/.test(t) ) return "force-tech-incomplete";
		if ( /swarm|squad|ammo/.test(t) ) return "ammunition-or-squad-policy";
		return "unsupported-activity";
	}
	if ( /swarm|squad|ammo/.test(t) ) return "ammunition-or-squad-policy";
	if ( /artwork|icon/.test(t) ) return "artwork-unresolved";
	if ( /malformed|missing-basic/.test(t) ) return "malformed-source";
	if ( /product|manual/.test(t) ) return "manual-product-decision";
	if ( /runtime/.test(t) ) return "runtime-validation-required";
	if ( /canonical-clone/.test(t) ) return "other";
	return "other";
}

function summarizeExceptions(exceptions) {
	const byCategory = {};
	for ( const e of exceptions ) {
		const c = e.category || "other";
		byCategory[c] = (byCategory[c] || 0) + 1;
	}
	return {
		total: exceptions.length,
		byCategory,
		note: "Unselected parse-valid actors do not receive generator-unsupported exceptions",
		entries: exceptions
	};
}

export function attemptProductionWrite(outputRoot = COMMITTED_PACK_SOURCE) {
	assertAllowedOutputRoot(outputRoot);
}

/** @deprecated use generateSandbox */
export function generateSupportedSandbox(opts) {
	return generateSandbox(opts);
}
