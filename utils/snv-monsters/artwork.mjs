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
import { ROOT } from "./paths.mjs";
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
		.replace(/_2C_/g, ", ")
		.replace(/_/g, " ");
}

function isApprovedLikelyStatus(status) {
	const raw = String(status || "").trim().toLowerCase();
	if ( APPROVED_LIKELY_STATUSES.has(raw) ) return true;
	// Explicit maintainer approval language only — "review required" is not approved.
	if ( /review required|awaiting|pending/i.test(raw) ) return false;
	return /approved/.test(raw) && /likely/.test(raw);
}

let cachedEligibilityByName = null;
function loadEligibilityByName() {
	if ( cachedEligibilityByName ) return cachedEligibilityByName;
	cachedEligibilityByName = new Map();
	if ( !fs.existsSync(ELIGIBILITY_LEDGER) ) return cachedEligibilityByName;
	const ledger = JSON.parse(fs.readFileSync(ELIGIBILITY_LEDGER, "utf8"));
	for ( const entry of ledger.entries || [] ) {
		cachedEligibilityByName.set(normalizeName(entry.sourceName), entry.artwork || null);
	}
	return cachedEligibilityByName;
}

let cachedFolders = null;
function listMonsterFolders() {
	if ( cachedFolders ) return cachedFolders;
	if ( !fs.existsSync(MONSTERS_ICON_ROOT) ) {
		cachedFolders = [];
		return cachedFolders;
	}
	cachedFolders = fs.readdirSync(MONSTERS_ICON_ROOT, { withFileTypes: true })
		.filter(e => e.isDirectory())
		.map(e => e.name);
	return cachedFolders;
}

function pathsExist(folderName) {
	const avatar = path.join(MONSTERS_ICON_ROOT, folderName, "Avatar.webp");
	const token = path.join(MONSTERS_ICON_ROOT, folderName, "Token.webp");
	return fs.existsSync(avatar) && fs.existsSync(token);
}

function baseResult(partial) {
	return {
		artworkException: null,
		artworkReplacementStatus: null,
		externalProvenance: null,
		tier: null,
		...partial
	};
}

/** Tier 1 / ledger-approved exact. */
function fromApprovedExactLedger(art, folderId) {
	if ( !art || art.approvalStatus !== "approved" || !art.directory ) return null;
	if ( !pathsExist(art.directory) ) return null;
	return baseResult({
		avatarPath: art.avatarPath || modulePathFor(art.directory, "Avatar.webp"),
		tokenPath: art.tokenPath || modulePathFor(art.directory, "Token.webp"),
		approvalStatus: "approved",
		folderId,
		directory: art.directory,
		identityMatch: art.identityMatch || "exact",
		loreAccuracy: art.loreAccuracy || "supported-by-exact-local-folder-name",
		tier: 1
	});
}

/** Tier 1: exact normalized NPC-named local folder scan. */
function fromExactFolderScan(sourceName, folderId) {
	const wanted = tokenSet(sourceName);
	const matches = [];
	for ( const dir of listMonsterFolders() ) {
		const display = folderDisplayName(dir);
		if ( !setsEqual(wanted, tokenSet(display)) ) continue;
		if ( !pathsExist(dir) ) continue;
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
		tier: 1
	});
}

/** Tier 2: maintainer-approved likely local folder. */
function fromApprovedLikelyLedger(art, folderId) {
	if ( !art || !art.directory ) return null;
	if ( !isApprovedLikelyStatus(art.approvalStatus) ) return null;
	if ( !pathsExist(art.directory) ) return null;
	return baseResult({
		avatarPath: art.avatarPath || modulePathFor(art.directory, "Avatar.webp"),
		tokenPath: art.tokenPath || modulePathFor(art.directory, "Token.webp"),
		approvalStatus: "approved-likely",
		folderId,
		directory: art.directory,
		identityMatch: art.identityMatch || "partial",
		loreAccuracy: art.loreAccuracy || "maintainer-approved-likely-match",
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
		tier: 4
	});
}

/**
 * Resolve production artwork for an SnV monster name.
 * @param {string} sourceName
 * @param {{ folderId: string }} opts
 */
export function resolveExactMonsterArtwork(sourceName, { folderId } = {}) {
	const ledgerArt = loadEligibilityByName().get(normalizeName(sourceName));

	// Tier 1a: ledger exact/approved
	const approvedExact = fromApprovedExactLedger(ledgerArt, folderId);
	if ( approvedExact ) return approvedExact;

	// Tier 1b: exact normalized folder on disk
	const exactScan = fromExactFolderScan(sourceName, folderId);
	if ( exactScan ) return exactScan;

	// Tier 2: maintainer-approved likely local folder
	const approvedLikely = fromApprovedLikelyLedger(ledgerArt, folderId);
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
}
