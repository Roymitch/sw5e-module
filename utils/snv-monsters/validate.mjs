/**
 * N2/N3 validators: accounting, pinned identities, guarded writes, and the
 * bounded N3a production-batch validation surface.
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { assertFourDimensionalAccounting } from "./classify.mjs";
import {
	buildN3aIdentityPlan,
	loadIdentityMap,
	loadProductionIdentityMap,
	N3A_BEASTS_FOLDER_KEY,
	resolvePinnedItemIdentity,
	summarizeIdentityAddition,
	summarizeIdentityMap
} from "./identity.mjs";
import { COMMITTED_PACK_SOURCE, EXPECTED_COMPLETE_ENTRIES, ROOT } from "./paths.mjs";
import {
	assertAllowedOutputRoot,
	assertApprovedN3aYamlPath,
	isCommittedPackPath,
	N3A_ALLOWED_TRACKED_RELATIVE_PATHS,
	toRepoRelative
} from "./write-guard.mjs";

const APPROVED_N3A_NAMES = [
	"Blurrg",
	"Fyrnock",
	"Jakrab",
	"Kath Hound",
	"Massiff",
	"Stintaril",
	"Zalaaca"
];

function parseStatusPath(line) {
	const trimmed = String(line || "").trimEnd();
	if ( !trimmed ) return null;
	if ( trimmed.startsWith("?? ") ) return trimmed.slice(3).trim();
	const match = trimmed.match(/^(?:[A-Z? ])(?:[A-Z? ])?\s(.+)$/);
	if ( !match ) return trimmed.trim();
	const payload = match[1].trim();
	if ( payload.includes(" -> ") ) return payload.split(" -> ").at(-1)?.trim();
	return payload;
}

function readYaml(filePath) {
	return yaml.load(fs.readFileSync(filePath, "utf8"));
}

function expectedYamlRelativePath(semanticKey) {
	return `packs/_source/snv-monsters/beasts/${semanticKey.split(":").at(-1)}.yml`;
}

function listExpectedNames(ledger) {
	return (ledger.finalCandidates || []).map(candidate => candidate.name);
}

function compareLists(actual, expected) {
	return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function buildExpectedItemIdentities(actorIdentity, candidate) {
	return [
		...(candidate.passives || []).map(name => resolvePinnedItemIdentity(actorIdentity, name, "feat")),
		...(candidate.nonAttackActions || []).map(name => resolvePinnedItemIdentity(actorIdentity, name, "feat")),
		...(candidate.weaponAttacks || []).map(name => resolvePinnedItemIdentity(actorIdentity, name, "weapon"))
	];
}

function validateGeneratedActorDoc(doc, candidate, actorIdentity, failures, options = {}) {
	if ( doc._id !== actorIdentity.id ) failures.push(`${candidate.name}: actor id drift`);
	if ( doc.name !== candidate.name ) failures.push(`${candidate.name}: actor name drift`);
	if ( doc.folder !== actorIdentity.folderId ) failures.push(`${candidate.name}: folder drift`);
	if ( doc.system?.details?.source?.custom !== "SnV" ) failures.push(`${candidate.name}: source drift`);
	if ( doc.img !== candidate.artwork?.avatarPath ) failures.push(`${candidate.name}: avatar art drift`);
	if ( doc.prototypeToken?.texture?.src !== candidate.artwork?.tokenPath ) failures.push(`${candidate.name}: token art drift`);
	const expectedItems = buildExpectedItemIdentities(actorIdentity, candidate);
	const compiled = options.compiled === true;
	const compiledItemIds = compiled ? (doc.items || []) : [];
	if ( (doc.items || []).length !== expectedItems.length ) failures.push(`${candidate.name}: item count drift`);
	for ( const expectedItem of expectedItems ) {
		const actualItem = compiled
			? options.itemLookupById?.get(expectedItem.id)
			: (doc.items || []).find(item => item._id === expectedItem.id);
		if ( !actualItem ) {
			failures.push(`${candidate.name}: missing item ${expectedItem.name}`);
			continue;
		}
		if ( compiled && !compiledItemIds.includes(expectedItem.id) ) {
			failures.push(`${candidate.name}: actor item link drift ${expectedItem.name}`);
		}
		if ( actualItem.name !== expectedItem.name ) failures.push(`${candidate.name}: item name drift ${expectedItem.id}`);
		if ( actualItem.type !== expectedItem.type ) failures.push(`${candidate.name}: item type drift ${expectedItem.name}`);
		const actualItemKey = compiled ? options.itemKeyById?.get(expectedItem.id) : actualItem._key;
		if ( actualItemKey !== expectedItem.key ) failures.push(`${candidate.name}: item key drift ${expectedItem.name}`);
		const expectedActivityIds = Object.values(expectedItem.activities || {}).map(activity => activity.id);
		const actualActivityIds = Object.keys(actualItem.system?.activities || {});
		if ( !compareLists(actualActivityIds.sort(), [...expectedActivityIds].sort()) ) {
			failures.push(`${candidate.name}: activity drift ${expectedItem.name}`);
		}
	}
}

export function validateIdentityPins(map = loadIdentityMap()) {
	const summary = summarizeIdentityMap(map);
	const failures = [];
	const baselineActors = Object.entries(map.actors || {})
		.filter(([, actor]) => actor.origin === "n1-committed");
	if ( summary.folders !== 5 ) failures.push(`folders ${summary.folders} !== 5`);
	if ( summary.actors !== 8 ) failures.push(`actors ${summary.actors} !== 8`);
	if ( summary.items < 1 ) failures.push("no pinned items");
	if ( summary.activities < 1 ) failures.push("no pinned activities");
	for ( const [semanticKey, actor] of baselineActors ) {
		if ( !actor.pinned || actor.origin !== "n1-committed" ) failures.push(`actor ${semanticKey} not pinned n1`);
		if ( !/^[a-f0-9]{16}$/i.test(actor.id) ) failures.push(`actor ${semanticKey} bad id`);
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
	} catch ( error ) {
		failures.push(error.message);
		return { ok: false, failures };
	}
	const actorsDir = path.join(outputRoot, "actors");
	if ( !fs.existsSync(actorsDir) ) {
		failures.push("missing actors dir");
		return { ok: false, failures };
	}
	const files = fs.readdirSync(actorsDir).filter(file => file.endsWith(".yml"));
	if ( files.length !== 8 ) failures.push(`n1 sandbox actors ${files.length} !== 8`);
	const seen = new Set();
	for ( const file of files ) {
		const doc = readYaml(path.join(actorsDir, file));
		const semanticKey = doc.flags?.sw5e?.snvMonsters?.semanticKey;
		const pinned = identityMap.actors?.[semanticKey];
		if ( !pinned ) failures.push(`unpinned semanticKey in n1 sandbox: ${semanticKey}`);
		else if ( doc._id !== pinned.id ) failures.push(`id drift ${semanticKey}`);
		if ( seen.has(doc._id) ) failures.push(`duplicate id ${doc._id}`);
		seen.add(doc._id);
		for ( const item of doc.items || [] ) {
			const expectedKey = `!actors.items!${doc._id}.${item._id}`;
			if ( item._key !== expectedKey ) failures.push(`bad key ${doc.name}/${item.name}`);
		}
	}
	const edgeDir = path.join(outputRoot, "edge-cases");
	let edgeFiles = 0;
	if ( fs.existsSync(edgeDir) ) {
		edgeFiles = fs.readdirSync(edgeDir).filter(file => file.endsWith(".yml")).length;
		for ( const file of fs.readdirSync(edgeDir).filter(candidate => candidate.endsWith(".yml")) ) {
			const doc = readYaml(path.join(edgeDir, file));
			if ( !doc.flags?.sw5e?.snvMonsters?.nonproduction && !doc.flags?.sw5e?.snvMonsters?.sandboxTemp ) {
				failures.push(`edge case missing nonproduction mark: ${file}`);
			}
			if ( identityMap.actors?.[doc.flags?.sw5e?.snvMonsters?.semanticKey] ) {
				failures.push(`edge case used pinned production semantic unexpectedly in temp emit: ${file}`);
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
	for ( const relativePath of mustRefuse ) {
		try {
			assertAllowedOutputRoot(relativePath);
			failures.push(`expected refusal for ${relativePath}`);
		} catch {
			// Expected refusal.
		}
	}
	try {
		assertAllowedOutputRoot("ai/prototypes/snv-monsters/n2");
	} catch ( error ) {
		failures.push(`sandbox prototype should be allowed: ${error.message}`);
	}
	try {
		assertAllowedOutputRoot("ai/audits/snv-monsters-compendium/n2");
	} catch ( error ) {
		failures.push(`sandbox audit should be allowed: ${error.message}`);
	}
	try {
		assertAllowedOutputRoot(COMMITTED_PACK_SOURCE, { allowProductionWrite: true, batch: "n3a" });
	} catch ( error ) {
		failures.push(`n3a production root should be allowed when explicitly authorized: ${error.message}`);
	}
	try {
		assertApprovedN3aYamlPath(path.join(COMMITTED_PACK_SOURCE, "beasts/blurrg.yml"));
	} catch ( error ) {
		failures.push(`approved N3a YAML should be allowed: ${error.message}`);
	}
	if ( !isCommittedPackPath("packs/_source/snv-monsters") ) {
		failures.push("isCommittedPackPath false for pack source root");
	}
	return { ok: failures.length === 0, failures };
}

export function validateTrackedChangesInScope(statusLines, allowedRelativePaths = N3A_ALLOWED_TRACKED_RELATIVE_PATHS) {
	const failures = [];
	for ( const line of statusLines || [] ) {
		const relativePath = parseStatusPath(line);
		if ( !relativePath ) continue;
		if ( !allowedRelativePaths.includes(relativePath) ) {
			failures.push(`tracked change outside scope: ${relativePath}`);
		}
	}
	return { ok: failures.length === 0, failures, statusLines };
}

export function validateN3aCandidateLedger(ledger) {
	const failures = [];
	const names = listExpectedNames(ledger);
	if ( ledger?.counts?.exactFullyEligible !== 7 ) failures.push("candidate ledger exactFullyEligible must remain 7");
	if ( !compareLists(names, APPROVED_N3A_NAMES) ) {
		failures.push(`candidate list drift: ${names.join(", ")}`);
	}
	for ( const candidate of ledger.finalCandidates || [] ) {
		const expectedPath = expectedYamlRelativePath(candidate.semanticKey);
		if ( !N3A_ALLOWED_TRACKED_RELATIVE_PATHS.includes(expectedPath) ) {
			failures.push(`candidate path not allowlisted: ${expectedPath}`);
		}
	}
	return { ok: failures.length === 0, failures, names };
}

export function validateN3aIdentityExtension(map = loadProductionIdentityMap(), ledger) {
	const failures = [];
	const candidateValidation = validateN3aCandidateLedger(ledger);
	failures.push(...candidateValidation.failures);
	const plan = buildN3aIdentityPlan(ledger, map);
	const counts = summarizeIdentityAddition(plan);
	if ( counts.actors !== 7 ) failures.push(`identity actor additions ${counts.actors} !== 7`);
	if ( counts.items !== 24 ) failures.push(`identity item additions ${counts.items} !== 24`);
	if ( counts.activities !== 7 ) failures.push(`identity activity additions ${counts.activities} !== 7`);
	const beastsFolderId = map.folders?.[N3A_BEASTS_FOLDER_KEY]?.id;
	for ( const [semanticKey, actor] of Object.entries(plan.actors || {}) ) {
		const actual = map.actors?.[semanticKey];
		if ( !actual ) {
			failures.push(`identity map missing actor ${semanticKey}`);
			continue;
		}
		if ( actual.id !== actor.id ) failures.push(`identity actor id drift ${semanticKey}`);
		if ( actual.folderId !== beastsFolderId ) failures.push(`identity folder drift ${semanticKey}`);
		for ( const expectedItem of Object.values(actor.items || {}) ) {
			const actualItem = resolvePinnedItemIdentity(actual, expectedItem.name, expectedItem.type);
			if ( actualItem.id !== expectedItem.id ) failures.push(`identity item id drift ${semanticKey}/${expectedItem.name}`);
			const expectedActivityIds = Object.values(expectedItem.activities || {}).map(activity => activity.id);
			const actualActivityIds = Object.values(actualItem.activities || {}).map(activity => activity.id);
			if ( !compareLists(actualActivityIds.sort(), [...expectedActivityIds].sort()) ) {
				failures.push(`identity activity drift ${semanticKey}/${expectedItem.name}`);
			}
		}
	}
	return { ok: failures.length === 0, failures, counts };
}

export function validateN3aGeneratedManifest(manifest, ledger, map = loadProductionIdentityMap()) {
	const failures = [];
	const candidateValidation = validateN3aCandidateLedger(ledger);
	failures.push(...candidateValidation.failures);
	if ( manifest.batch !== "n3a" ) failures.push(`manifest batch ${manifest.batch} !== n3a`);
	if ( manifest.emitted.length !== 7 ) failures.push(`manifest emit count ${manifest.emitted.length} !== 7`);
	if ( manifest.exceptions?.length ) failures.push(`manifest exceptions present: ${manifest.exceptions.length}`);
	for ( const candidate of ledger.finalCandidates || [] ) {
		const actorIdentity = map.actors?.[candidate.semanticKey];
		const emitted = manifest.emitted.find(entry => entry.semanticKey === candidate.semanticKey);
		if ( !actorIdentity || !emitted ) {
			failures.push(`missing manifest identity or emit for ${candidate.semanticKey}`);
			continue;
		}
		if ( emitted.actorId !== actorIdentity.id ) failures.push(`${candidate.name}: emitted actor id drift`);
		if ( emitted.path !== expectedYamlRelativePath(candidate.semanticKey) ) failures.push(`${candidate.name}: emitted path drift`);
		const expectedCount = (candidate.passives || []).length + (candidate.nonAttackActions || []).length + (candidate.weaponAttacks || []).length;
		if ( emitted.itemCount !== expectedCount ) failures.push(`${candidate.name}: emitted item count drift`);
	}
	return { ok: failures.length === 0, failures };
}

export function validateN3aPostwrite(outputRoot, ledger, map = loadProductionIdentityMap()) {
	const failures = [];
	for ( const candidate of ledger.finalCandidates || []) {
		const actorIdentity = map.actors?.[candidate.semanticKey];
		if ( !actorIdentity ) {
			failures.push(`missing actor identity ${candidate.semanticKey}`);
			continue;
		}
		const filePath = path.resolve(ROOT, outputRoot, "beasts", `${candidate.semanticKey.split(":").at(-1)}.yml`);
		if ( !fs.existsSync(filePath) ) {
			failures.push(`missing YAML ${toRepoRelative(filePath)}`);
			continue;
		}
		const doc = readYaml(filePath);
		validateGeneratedActorDoc(doc, candidate, actorIdentity, failures);
	}
	return { ok: failures.length === 0, failures };
}

export function validateN3aDeterministicRerun(firstManifest, rerunManifest) {
	const failures = [];
	if ( firstManifest.emitted.length !== rerunManifest.emitted.length ) {
		failures.push(`rerun emit count drift ${firstManifest.emitted.length} !== ${rerunManifest.emitted.length}`);
	}
	for ( const firstEntry of firstManifest.emitted ) {
		const rerunEntry = rerunManifest.emitted.find(entry => entry.semanticKey === firstEntry.semanticKey);
		if ( !rerunEntry ) {
			failures.push(`missing rerun entry ${firstEntry.semanticKey}`);
			continue;
		}
		if ( rerunEntry.hash !== firstEntry.hash ) failures.push(`rerun hash drift ${firstEntry.semanticKey}`);
		if ( rerunEntry.path !== firstEntry.path ) failures.push(`rerun path drift ${firstEntry.semanticKey}`);
	}
	return { ok: failures.length === 0, failures };
}

export function validateCompiledPackData(records, ledger, map = loadProductionIdentityMap()) {
	const failures = [];
	const actorRecords = records.filter(record => record.key.startsWith("!actors!"));
	const itemRecords = records.filter(record => record.key.startsWith("!actors.items!"));
	const folderRecords = records.filter(record => record.key.startsWith("!folders!"));
	const itemLookupById = new Map(itemRecords.map(record => [record.value._id, record.value]));
	const itemKeyById = new Map(itemRecords.map(record => [record.value._id, record.key]));
	if ( actorRecords.length !== Object.keys(map.actors || {}).length ) {
		failures.push(`compiled actor count ${actorRecords.length} !== ${Object.keys(map.actors || {}).length}`);
	}
	if ( folderRecords.length !== Object.keys(map.folders || {}).length ) {
		failures.push(`compiled folder count ${folderRecords.length} !== ${Object.keys(map.folders || {}).length}`);
	}
	for ( const candidate of ledger.finalCandidates || [] ) {
		const actorIdentity = map.actors?.[candidate.semanticKey];
		const actorDoc = actorRecords.find(record => record.value?._id === actorIdentity?.id)?.value;
		if ( !actorDoc ) {
			failures.push(`compiled pack missing actor ${candidate.semanticKey}`);
			continue;
		}
		validateGeneratedActorDoc(actorDoc, candidate, actorIdentity, failures, {
			compiled: true,
			itemLookupById,
			itemKeyById
		});
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
	results.ok = Object.values(results).every(result => result.ok || result.skipped);
	return results;
}
