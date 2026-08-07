/**
 * SnV monsters artwork resolution (production policy).
 *
 * Priority order (artwork must not block mechanical production):
 * 1. Exact normalized NPC-named local folder
 * 2. Maintainer-approved likely local folder
 * 3. Legally redistributable external artwork with recorded provenance
 * 4. Approved generic NPC fallback (production-complete; artwork-replacement status)
 */
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { COMMITTED_PACK_SOURCE, ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

export const NPC_SVG = "systems/dnd5e/icons/svg/actors/npc.svg";
const MONSTERS_ICON_ROOT = path.join(ROOT, "icons/packs/monsters");
const ELIGIBILITY_LEDGER = path.join(
	ROOT,
	"ai/audits/snv-monsters-compendium/n3/production-eligibility-ledger.json"
);

const APPROVED_LIKELY_STATUSES = new Set([
	"approved-likely",
	"approved-likely-match",
	"maintainer-approved-likely",
	"approved likely match"
]);

function modulePathFor(folderName, fileName) {
	return `modules/sw5e-module/icons/packs/monsters/${folderName}/${fileName}`;
}

export function modulePathForMonsterArtwork(folderName, fileName) {
	return modulePathFor(folderName, fileName);
}

function tokenSet(value) {
	return new Set(normalizeName(value).split(" ").filter(Boolean));
}

function setsEqual(a, b) {
	if ( a.size !== b.size ) return false;
	for ( const t of a ) if ( !b.has(t) ) return false;
	return true;
}

function folderDisplayName(dirName) {
	return String(dirName)
		.replace(/^\d+_-+_/, "")
		.replace(/_27s_/g, "'s ")
		.replace(/_27_/g, "'")
		.replace(/_2C_/g, ", ")
		.replace(/_/g, " ");
}

function isDefaultPath(candidate, expected) {
	return path.resolve(candidate) === path.resolve(expected);
}

function parseRoots(roots = {}) {
	return {
		monsterIconRoot: roots.monsterIconRoot || MONSTERS_ICON_ROOT,
		eligibilityLedgerPath: roots.eligibilityLedgerPath || ELIGIBILITY_LEDGER,
		packSourceRoot: roots.packSourceRoot || COMMITTED_PACK_SOURCE
	};
}

export function encodeMonsterArtworkLabel(sourceName) {
	const encoded = String(sourceName || "")
		.trim()
		.replace(/\s+/g, " ")
		.split("")
		.map(character => {
			if ( /[A-Za-z0-9]/.test(character) ) return character;
			if ( character === " " ) return "_";
			if ( character === "-" ) return "-";
			if ( character === "," ) return "_2C_";
			if ( character === "'" ) return "_27";
			return "_";
		})
		.join("")
		.replace(/^_+|_+$/g, "");
	return encoded
		.replace(/_27s$/, "_27s_")
		.replace(/_27$/, "_27_");
}

export function formatMonsterArtworkFolderName(index, sourceName) {
	return `${String(index).padStart(3, "0")}_-_${encodeMonsterArtworkLabel(sourceName)}`;
}

function isApprovedLikelyStatus(status) {
	const raw = String(status || "").trim().toLowerCase();
	if ( APPROVED_LIKELY_STATUSES.has(raw) ) return true;
	// Explicit maintainer approval language only — "review required" is not approved.
	if ( /review required|awaiting|pending/i.test(raw) ) return false;
	return /approved/.test(raw) && /likely/.test(raw);
}

let cachedEligibilityByName = null;
function loadEligibilityByName({ eligibilityLedgerPath = ELIGIBILITY_LEDGER } = {}) {
	if ( cachedEligibilityByName && isDefaultPath(eligibilityLedgerPath, ELIGIBILITY_LEDGER) ) return cachedEligibilityByName;
	const byName = new Map();
	if ( !fs.existsSync(eligibilityLedgerPath) ) {
		if ( isDefaultPath(eligibilityLedgerPath, ELIGIBILITY_LEDGER) ) cachedEligibilityByName = byName;
		return byName;
	}
	let ledger = { entries: [] };
	try {
		ledger = JSON.parse(fs.readFileSync(eligibilityLedgerPath, "utf8"));
	} catch {
		if ( isDefaultPath(eligibilityLedgerPath, ELIGIBILITY_LEDGER) ) cachedEligibilityByName = byName;
		return byName;
	}
	for ( const entry of ledger.entries || [] ) {
		byName.set(normalizeName(entry.sourceName), entry.artwork || null);
	}
	if ( isDefaultPath(eligibilityLedgerPath, ELIGIBILITY_LEDGER) ) cachedEligibilityByName = byName;
	return byName;
}

let cachedFolders = null;
function listMonsterFolders({ monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	if ( cachedFolders && isDefaultPath(monsterIconRoot, MONSTERS_ICON_ROOT) ) return cachedFolders;
	if ( !fs.existsSync(monsterIconRoot) ) {
		if ( isDefaultPath(monsterIconRoot, MONSTERS_ICON_ROOT) ) cachedFolders = [];
		return [];
	}
	const folders = fs.readdirSync(monsterIconRoot, { withFileTypes: true })
		.filter(e => e.isDirectory())
		.map(e => e.name);
	if ( isDefaultPath(monsterIconRoot, MONSTERS_ICON_ROOT) ) cachedFolders = folders;
	return folders;
}

function pathsExist(folderName, { monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	const avatar = path.join(monsterIconRoot, folderName, "Avatar.webp");
	const token = path.join(monsterIconRoot, folderName, "Token.webp");
	return fs.existsSync(avatar) && fs.existsSync(token);
}

function baseResult(partial) {
	return {
		artworkException: null,
		artworkReplacementStatus: null,
		externalProvenance: null,
		source: null,
		reviewAuthority: null,
		provenance: null,
		tier: null,
		...partial
	};
}

/** Tier 1 / ledger-approved exact. */
function fromApprovedExactLedger(art, folderId, { monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	if ( !art || art.approvalStatus !== "approved" || !art.directory ) return null;
	if ( !pathsExist(art.directory, { monsterIconRoot }) ) return null;
	return baseResult({
		avatarPath: art.avatarPath || modulePathFor(art.directory, "Avatar.webp"),
		tokenPath: art.tokenPath || modulePathFor(art.directory, "Token.webp"),
		approvalStatus: "approved",
		folderId,
		directory: art.directory,
		identityMatch: art.identityMatch || "exact",
		loreAccuracy: art.loreAccuracy || "supported-by-exact-local-folder-name",
		source: art.source || "module-existing",
		tier: 1
	});
}

/** Tier 1: exact normalized NPC-named local folder scan. */
function fromExactFolderScan(sourceName, folderId, { monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	const wanted = tokenSet(sourceName);
	const matches = [];
	for ( const dir of listMonsterFolders({ monsterIconRoot }) ) {
		const display = folderDisplayName(dir);
		if ( !setsEqual(wanted, tokenSet(display)) ) continue;
		if ( !pathsExist(dir, { monsterIconRoot }) ) continue;
		matches.push(dir);
	}
	if ( matches.length !== 1 ) return null;
	const directory = matches[0];
	return baseResult({
		avatarPath: modulePathFor(directory, "Avatar.webp"),
		tokenPath: modulePathFor(directory, "Token.webp"),
		approvalStatus: "approved",
		folderId,
		directory,
		identityMatch: "exact",
		loreAccuracy: "supported-by-exact-local-folder-name",
		source: "module-existing",
		tier: 1
	});
}

/** Tier 2: maintainer-approved likely local folder. */
function fromApprovedLikelyLedger(art, folderId, { monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	if ( !art || !art.directory ) return null;
	if ( !isApprovedLikelyStatus(art.approvalStatus) ) return null;
	if ( !pathsExist(art.directory, { monsterIconRoot }) ) return null;
	return baseResult({
		avatarPath: art.avatarPath || modulePathFor(art.directory, "Avatar.webp"),
		tokenPath: art.tokenPath || modulePathFor(art.directory, "Token.webp"),
		approvalStatus: "approved-likely",
		folderId,
		directory: art.directory,
		identityMatch: art.identityMatch || "partial",
		loreAccuracy: art.loreAccuracy || "maintainer-approved-likely-match",
		source: "maintainer-approved-likely",
		tier: 2
	});
}

/**
 * Tier 3: legally redistributable external artwork with recorded provenance.
 * Expects eligibility artwork.external = { avatarPath, tokenPath?, provenance, license? }.
 */
function fromExternalProvenance(art, folderId) {
	const external = art?.external;
	if ( !external?.avatarPath || !external?.provenance ) return null;
	return baseResult({
		avatarPath: external.avatarPath,
		tokenPath: external.tokenPath || external.avatarPath,
		approvalStatus: "approved-external",
		folderId,
		directory: null,
		identityMatch: external.identityMatch || "external",
		loreAccuracy: external.loreAccuracy || "external-redistributable",
		externalProvenance: {
			provenance: external.provenance,
			license: external.license || null,
			sourceUrl: external.sourceUrl || null
		},
		source: "external-redistributable",
		tier: 3
	});
}

/** Tier 4: approved generic NPC fallback — mechanically production-complete. */
function genericNpcFallback(folderId) {
	return baseResult({
		avatarPath: NPC_SVG,
		tokenPath: NPC_SVG,
		approvalStatus: "approved-generic-fallback",
		folderId,
		directory: null,
		identityMatch: "none",
		loreAccuracy: "generic-fallback",
		artworkException: "npc-svg-fallback",
		artworkReplacementStatus: "needs-replacement",
		source: "approved-generic-fallback",
		tier: 4
	});
}

let cachedActorArtworkByName = null;
function walkYamlFiles(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) out.push(fullPath);
	}
	return out;
}

function loadActorArtworkByName({ packSourceRoot = COMMITTED_PACK_SOURCE } = {}) {
	if ( cachedActorArtworkByName && isDefaultPath(packSourceRoot, COMMITTED_PACK_SOURCE) ) return cachedActorArtworkByName;
	const byName = new Map();
	for ( const filePath of walkYamlFiles(packSourceRoot) ) {
		try {
			const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
			const key = normalizeName(doc?.name);
			if ( !key ) continue;
			byName.set(key, {
				filePath,
				img: doc?.img || null,
				tokenPath: doc?.prototypeToken?.texture?.src || null,
				artwork: doc?.flags?.sw5e?.snvMonsters?.artwork || null
			});
		} catch {
			// Ignore malformed docs; resolver must stay fail-closed to fallback.
		}
	}
	if ( isDefaultPath(packSourceRoot, COMMITTED_PACK_SOURCE) ) cachedActorArtworkByName = byName;
	return byName;
}

function hydrateFromCurrentActorState(sourceName, artworkResult, { packSourceRoot = COMMITTED_PACK_SOURCE } = {}) {
	const current = loadActorArtworkByName({ packSourceRoot }).get(normalizeName(sourceName));
	const art = current?.artwork;
	if ( !art ) return artworkResult;
	const samePath = (!art.path || art.path === artworkResult.avatarPath)
		&& (!art.tokenPath || art.tokenPath === artworkResult.tokenPath);
	if ( !samePath ) return artworkResult;
	return baseResult({
		...artworkResult,
		approvalStatus: art.approval || artworkResult.approvalStatus,
		loreAccuracy: art.loreConfidence || artworkResult.loreAccuracy,
		directory: art.directory || artworkResult.directory,
		identityMatch: art.identityMatch || artworkResult.identityMatch,
		artworkException: art.exception ?? artworkResult.artworkException,
		artworkReplacementStatus: art.replacementStatus ?? artworkResult.artworkReplacementStatus,
		externalProvenance: art.externalProvenance ?? artworkResult.externalProvenance,
		source: art.source || artworkResult.source,
		reviewAuthority: art.reviewAuthority || null,
		provenance: art.provenance || null
	});
}

export function findExactMonsterArtworkFolder(sourceName, { monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	return fromExactFolderScan(sourceName, null, { monsterIconRoot })?.directory || null;
}

export function nextMonsterArtworkIndex({ monsterIconRoot = MONSTERS_ICON_ROOT } = {}) {
	const numbers = listMonsterFolders({ monsterIconRoot })
		.map(name => Number.parseInt(name.match(/^(\d+)_-/)?.[1] || "", 10))
		.filter(Number.isFinite);
	return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/**
 * Resolve production artwork for an SnV monster name.
 * @param {string} sourceName
 * @param {{ folderId?: string, roots?: { monsterIconRoot?: string, eligibilityLedgerPath?: string, packSourceRoot?: string } }} opts
 */
export function resolveExactMonsterArtwork(sourceName, { folderId, roots } = {}) {
	const resolvedRoots = parseRoots(roots);
	const ledgerArt = loadEligibilityByName({
		eligibilityLedgerPath: resolvedRoots.eligibilityLedgerPath
	}).get(normalizeName(sourceName));

	// Tier 1a: ledger exact/approved
	const approvedExact = fromApprovedExactLedger(ledgerArt, folderId, resolvedRoots);
	if ( approvedExact ) return approvedExact;

	// Tier 1b: exact normalized folder on disk
	const exactScan = fromExactFolderScan(sourceName, folderId, resolvedRoots);
	if ( exactScan ) return hydrateFromCurrentActorState(sourceName, exactScan, resolvedRoots);

	// Tier 2: maintainer-approved likely local folder
	const approvedLikely = fromApprovedLikelyLedger(ledgerArt, folderId, resolvedRoots);
	if ( approvedLikely ) return approvedLikely;

	// Tier 3: external with provenance
	const external = fromExternalProvenance(ledgerArt, folderId);
	if ( external ) return external;

	// Tier 4: generic fallback (does not block production)
	return genericNpcFallback(folderId);
}

export function resetArtworkCachesForTests() {
	cachedEligibilityByName = null;
	cachedFolders = null;
	cachedActorArtworkByName = null;
}
