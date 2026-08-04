/**
 * N2 automated validators: 4D accounting, identity pins, sandbox, write-guard.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { assertFourDimensionalAccounting } from "./classify.mjs";
import { loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import { EXPECTED_COMPLETE_ENTRIES } from "./paths.mjs";
import { assertAllowedOutputRoot, isCommittedPackPath } from "./write-guard.mjs";

export function validateIdentityPins(map = loadIdentityMap()) {
	const summary = summarizeIdentityMap(map);
	const failures = [];
	if ( summary.folders !== 5 ) failures.push(`folders ${summary.folders} !== 5`);
	if ( summary.actors !== 8 ) failures.push(`actors ${summary.actors} !== 8`);
	if ( summary.items < 1 ) failures.push("no pinned items");
	if ( summary.activities < 1 ) failures.push("no pinned activities");
	for ( const [sk, a] of Object.entries(map.actors || {}) ) {
		if ( !a.pinned || a.origin !== "n1-committed" ) failures.push(`actor ${sk} not pinned n1`);
		if ( !/^[a-f0-9]{16}$/i.test(a.id) ) failures.push(`actor ${sk} bad id`);
	}
	return { ok: failures.length === 0, failures, summary };
}

export function validateClassificationLedger(ir, expectedComplete = EXPECTED_COMPLETE_ENTRIES) {
	return assertFourDimensionalAccounting(ir.entries || [], expectedComplete);
}

export function validateSandboxEmit(outputRoot, identityMap = loadIdentityMap()) {
	const failures = [];
	try {
		assertAllowedOutputRoot(outputRoot);
	} catch ( err ) {
		failures.push(err.message);
		return { ok: false, failures };
	}
	const actorsDir = path.join(outputRoot, "actors");
	if ( !fs.existsSync(actorsDir) ) {
		failures.push("missing actors dir");
		return { ok: false, failures };
	}
	const files = fs.readdirSync(actorsDir).filter(f => f.endsWith(".yml"));
	if ( files.length !== 8 ) failures.push(`n1 sandbox actors ${files.length} !== 8`);
	const seen = new Set();
	for ( const f of files ) {
		const doc = yaml.load(fs.readFileSync(path.join(actorsDir, f), "utf8"));
		const sk = doc.flags?.sw5e?.snvMonsters?.semanticKey;
		const pinned = identityMap.actors?.[sk];
		if ( !pinned ) failures.push(`unpinned semanticKey in n1 sandbox: ${sk}`);
		else if ( doc._id !== pinned.id ) failures.push(`id drift ${sk}`);
		if ( seen.has(doc._id) ) failures.push(`duplicate id ${doc._id}`);
		seen.add(doc._id);
		for ( const it of doc.items || [] ) {
			const expect = `!actors.items!${doc._id}.${it._id}`;
			if ( it._key !== expect ) failures.push(`bad key ${doc.name}/${it.name}`);
		}
	}
	const edgeDir = path.join(outputRoot, "edge-cases");
	let edgeFiles = 0;
	if ( fs.existsSync(edgeDir) ) {
		edgeFiles = fs.readdirSync(edgeDir).filter(f => f.endsWith(".yml")).length;
		for ( const f of fs.readdirSync(edgeDir).filter(x => x.endsWith(".yml")) ) {
			const doc = yaml.load(fs.readFileSync(path.join(edgeDir, f), "utf8"));
			if ( !doc.flags?.sw5e?.snvMonsters?.nonproduction && !doc.flags?.sw5e?.snvMonsters?.sandboxTemp ) {
				failures.push(`edge case missing nonproduction mark: ${f}`);
			}
			if ( identityMap.actors?.[doc.flags?.sw5e?.snvMonsters?.semanticKey] ) {
				failures.push(`edge case used pinned production semantic unexpectedly in temp emit: ${f}`);
			}
		}
	}
	return { ok: failures.length === 0, failures, actorFiles: files.length, edgeFiles };
}

export function validateWriteGuard() {
	const failures = [];
	const mustRefuse = [
		"packs/_source/snv-monsters",
		"packs/_source/snv-monsters/humanoids",
		"packs/snv-monsters",
		"packs/_source/monsters"
	];
	for ( const p of mustRefuse ) {
		try {
			assertAllowedOutputRoot(p);
			failures.push(`expected refusal for ${p}`);
		} catch { /* expected */ }
	}
	try {
		assertAllowedOutputRoot("ai/prototypes/snv-monsters/n2");
	} catch ( err ) {
		failures.push(`sandbox prototype should be allowed: ${err.message}`);
	}
	try {
		assertAllowedOutputRoot("ai/audits/snv-monsters-compendium/n2");
	} catch ( err ) {
		failures.push(`sandbox audit should be allowed: ${err.message}`);
	}
	if ( !isCommittedPackPath("packs/_source/snv-monsters") ) {
		failures.push("isCommittedPackPath false for pack source root");
	}
	return { ok: failures.length === 0, failures };
}

export function runOfflineValidationSuite({ ir, sandboxRoot, identityMap = loadIdentityMap() }) {
	const results = {
		identity: validateIdentityPins(identityMap),
		writeGuard: validateWriteGuard(),
		accounting: ir ? validateClassificationLedger(ir) : { ok: false, failures: ["ir missing"] },
		sandbox: sandboxRoot ? validateSandboxEmit(sandboxRoot, identityMap) : { ok: true, skipped: true }
	};
	results.ok = Object.values(results).every(r => r.ok || r.skipped);
	return results;
}
