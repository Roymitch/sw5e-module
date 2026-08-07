/**
 * Exact NPC-folder artwork resolution for snv-monsters population.
 * Prefer approved eligibility-ledger paths; else exact/normalized folder match.
 * Fall back to stock npc.svg only when no safe local folder exists.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const NPC_SVG = "systems/dnd5e/icons/svg/actors/npc.svg";
const MONSTERS_ICON_ROOT = path.join(ROOT, "icons/packs/monsters");
const ELIGIBILITY_LEDGER = path.join(
	ROOT,
	"ai/audits/snv-monsters-compendium/n3/production-eligibility-ledger.json"
);

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
	// e.g. 371_-_Front-Line_Soldier -> Front-Line_Soldier
	return String(dirName).replace(/^\d+_-+_/, "").replace(/_27s_/g, "'s ").replace(/_2C_/g, ", ").replace(/_/g, " ");
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

function fromLedgerArt(art, folderId) {
	if ( !art || art.approvalStatus !== "approved" || !art.directory ) return null;
	if ( !pathsExist(art.directory) ) return null;
	return {
		avatarPath: art.avatarPath || modulePathFor(art.directory, "Avatar.webp"),
		tokenPath: art.tokenPath || modulePathFor(art.directory, "Token.webp"),
		approvalStatus: "approved",
		folderId,
		directory: art.directory,
		identityMatch: art.identityMatch || "exact",
		loreAccuracy: art.loreAccuracy || "supported-by-exact-local-folder-name",
		artworkException: null
	};
}

function fromFolderScan(sourceName, folderId) {
	const wanted = tokenSet(sourceName);
	const folders = listMonsterFolders();
	const matches = [];
	for ( const dir of folders ) {
		const display = folderDisplayName(dir);
		if ( !setsEqual(wanted, tokenSet(display)) ) continue;
		if ( !pathsExist(dir) ) continue;
		matches.push(dir);
	}
	if ( matches.length !== 1 ) return null;
	const directory = matches[0];
	return {
		avatarPath: modulePathFor(directory, "Avatar.webp"),
		tokenPath: modulePathFor(directory, "Token.webp"),
		approvalStatus: "approved",
		folderId,
		directory,
		identityMatch: "exact",
		loreAccuracy: "supported-by-exact-local-folder-name",
		artworkException: null
	};
}

/**
 * @param {string} sourceName
 * @param {{ folderId: string }} opts
 */
export function resolveExactMonsterArtwork(sourceName, { folderId } = {}) {
	const ledgerArt = loadEligibilityByName().get(normalizeName(sourceName));
	const fromLedger = fromLedgerArt(ledgerArt, folderId);
	if ( fromLedger ) return fromLedger;

	const fromScan = fromFolderScan(sourceName, folderId);
	if ( fromScan ) return fromScan;

	return {
		avatarPath: NPC_SVG,
		tokenPath: NPC_SVG,
		approvalStatus: "approved-fallback",
		folderId,
		directory: null,
		identityMatch: "none",
		loreAccuracy: "unresolved",
		artworkException: "npc-svg-fallback"
	};
}

export function resetArtworkCachesForTests() {
	cachedEligibilityByName = null;
	cachedFolders = null;
}
