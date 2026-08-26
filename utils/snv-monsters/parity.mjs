/**
 * N2-E parity: sandbox actors vs committed N1 pack (IDs + critical combat fields).
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { COMMITTED_PACK_SOURCE } from "./paths.mjs";

function loadNpcById(root) {
	const map = new Map();
	function walk(dir) {
		for ( const ent of fs.readdirSync(dir, { withFileTypes: true }) ) {
			const p = path.join(dir, ent.name);
			if ( ent.isDirectory() ) walk(p);
			else if ( ent.name.endsWith(".yml") && ent.name !== "_folder.yml" ) {
				const doc = yaml.load(fs.readFileSync(p, "utf8"));
				if ( doc.type === "npc" ) map.set(doc._id, doc);
			}
		}
	}
	walk(root);
	return map;
}

function weaponByName(actor, name) {
	return (actor.items || []).filter(i => i.name === name && i.type === "weapon");
}

/**
 * @param {string} sandboxActorsDir directory containing emitted actor yml files
 */
export function parityAgainstCommitted(sandboxActorsDir, committedRoot = COMMITTED_PACK_SOURCE) {
	const failures = [];
	const committed = loadNpcById(committedRoot);
	const sandboxFiles = fs.readdirSync(sandboxActorsDir).filter(f => f.endsWith(".yml"));
	if ( sandboxFiles.length !== 8 ) failures.push(`sandbox actor count ${sandboxFiles.length}`);

	const checks = [
		["fb6aef3ed3570b48", "Blaster Rifle", "12"],
		["f6c9d44c2e70b8f7", "Blaster Rifle", "12"],
		["86b300ca462ff90a", "Blaster Carbine", "16"],
		["3557e8a7bc4bb620", "Blaster Rifle", "12"]
	];

	for ( const f of sandboxFiles ) {
		const sDoc = yaml.load(fs.readFileSync(path.join(sandboxActorsDir, f), "utf8"));
		const cDoc = committed.get(sDoc._id);
		if ( !cDoc ) {
			failures.push(`sandbox id not in committed: ${sDoc._id}`);
			continue;
		}
		if ( sDoc.name !== cDoc.name ) failures.push(`name drift ${sDoc._id}`);
		if ( sDoc.system?.details?.source?.custom !== "SnV" ) failures.push(`source ${sDoc.name}`);
		const sItems = new Set((sDoc.items || []).map(i => i._id));
		const cItems = new Set((cDoc.items || []).map(i => i._id));
		for ( const id of cItems ) {
			if ( !sItems.has(id) ) failures.push(`missing item id ${sDoc.name}/${id}`);
		}
	}

	for ( const [actorId, wname, max] of checks ) {
		const sFile = sandboxFiles.map(f => yaml.load(fs.readFileSync(path.join(sandboxActorsDir, f), "utf8")))
			.find(d => d._id === actorId);
		if ( !sFile ) {
			failures.push(`missing actor ${actorId}`);
			continue;
		}
		const ws = weaponByName(sFile, wname);
		if ( ws.length !== 1 ) failures.push(`${sFile.name} ${wname} count ${ws.length}`);
		else if ( String(ws[0].system?.uses?.max) !== max ) {
			failures.push(`${sFile.name} uses ${ws[0].system?.uses?.max}`);
		}
	}

	// B1 specifics
	const b1 = [...committed.values()].find(a => a._id === "3557e8a7bc4bb620");
	const b1s = sandboxFiles.map(f => yaml.load(fs.readFileSync(path.join(sandboxActorsDir, f), "utf8")))
		.find(d => d._id === "3557e8a7bc4bb620");
	if ( b1 && b1s ) {
		const w = weaponByName(b1s, "Blaster Rifle")[0];
		if ( w?.system?.type?.value !== "natural" ) failures.push("b1 natural");
		if ( w?.flags?.sw5e?.snvMonsters?.classification !== "integrated" ) failures.push("b1 integrated");
		if ( w?.system?.range?.value !== 100 || w?.system?.range?.long !== 400 ) failures.push("b1 range");
	}

	return { ok: failures.length === 0, failures };
}
