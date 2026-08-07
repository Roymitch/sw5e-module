import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { assertValidArtworkEvidence } from "./artwork-baseline.mjs";
import {
	findExactMonsterArtworkFolder,
	formatMonsterArtworkFolderName,
	modulePathForMonsterArtwork,
	nextMonsterArtworkIndex
} from "./artwork.mjs";
import { COMMITTED_PACK_SOURCE, ROOT } from "./paths.mjs";
import { normalizeName } from "./parse-helpers.mjs";

const MONSTERS_ICON_ROOT = path.join(ROOT, "icons/packs/monsters");
const DUMP = { lineWidth: -1, noRefs: true, quotingType: "'", forceQuotes: false };

let cachedActorPathByName = null;

function walkYamlFiles(dir, out = []) {
	if ( !fs.existsSync(dir) ) return out;
	for ( const entry of fs.readdirSync(dir, { withFileTypes: true }) ) {
		const fullPath = path.join(dir, entry.name);
		if ( entry.isDirectory() ) walkYamlFiles(fullPath, out);
		else if ( entry.name.endsWith(".yml") && entry.name !== "_folder.yml" ) out.push(fullPath);
	}
	return out;
}

function buildActorPathIndex(packSourceRoot = COMMITTED_PACK_SOURCE) {
	if ( cachedActorPathByName && path.resolve(packSourceRoot) === path.resolve(COMMITTED_PACK_SOURCE) ) {
		return cachedActorPathByName;
	}
	const index = new Map();
	for ( const filePath of walkYamlFiles(packSourceRoot) ) {
		try {
			const doc = yaml.load(fs.readFileSync(filePath, "utf8"));
			const key = normalizeName(doc?.name);
			if ( key ) index.set(key, filePath);
		} catch {
			// Ignore malformed YAML; install step should fail only when the target actor cannot be resolved.
		}
	}
	if ( path.resolve(packSourceRoot) === path.resolve(COMMITTED_PACK_SOURCE) ) cachedActorPathByName = index;
	return index;
}

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function splitLines(text) {
	const newline = text.includes("\r\n") ? "\r\n" : "\n";
	return { lines: text.split(/\r?\n/), newline };
}

function replaceTopLevelImg(text, newImg) {
	const { lines, newline } = splitLines(text);
	const imgLineIdx = lines.findIndex(line => /^img:\s*/.test(line));
	if ( imgLineIdx === -1 ) throw new Error("[snv-monsters] top-level img line not found");
	lines[imgLineIdx] = `img: ${newImg}`;
	return lines.join(newline);
}

function replacePrototypeTokenSrc(text, newSrc) {
	const { lines, newline } = splitLines(text);
	let inPrototypeToken = false;
	let inTexture = false;
	let replaced = false;
	for ( let index = 0; index < lines.length; index += 1 ) {
		const line = lines[index];
		if ( /^prototypeToken:\s*$/.test(line) ) {
			inPrototypeToken = true;
			inTexture = false;
			continue;
		}
		if ( inPrototypeToken && /^[A-Za-z0-9_-]/.test(line) ) break;
		if ( inPrototypeToken && /^  texture:\s*$/.test(line) ) {
			inTexture = true;
			continue;
		}
		if ( inTexture && /^    src:\s*/.test(line) ) {
			lines[index] = `    src: ${newSrc}`;
			replaced = true;
			break;
		}
	}
	if ( !replaced ) throw new Error("[snv-monsters] prototypeToken.texture.src line not found");
	return lines.join(newline);
}

function indentYamlBlock(block, spaces) {
	const prefix = " ".repeat(spaces);
	return block
		.trimEnd()
		.split("\n")
		.map(line => `${prefix}${line}`)
		.join("\n");
}

function replaceArtworkBlock(text, artwork) {
	const { lines, newline } = splitLines(text);
	const start = lines.findIndex(line => /^ {6}artwork:\s*$/.test(line));
	if ( start === -1 ) throw new Error("[snv-monsters] flags.sw5e.snvMonsters.artwork block not found");
	let end = start + 1;
	while ( end < lines.length ) {
		const line = lines[end];
		if ( /^ {0,6}\S/.test(line) ) break;
		end += 1;
	}
	const artworkYaml = indentYamlBlock(yaml.dump({ artwork }, DUMP), 6).split("\n");
	const nextLines = [
		...lines.slice(0, start),
		...artworkYaml,
		...lines.slice(end)
	];
	return nextLines.join(newline);
}

function resolveActorYamlPath({ sourceName, yamlPath = null, packSourceRoot = COMMITTED_PACK_SOURCE } = {}) {
	if ( yamlPath ) return yamlPath;
	const indexed = buildActorPathIndex(packSourceRoot).get(normalizeName(sourceName));
	if ( indexed ) return indexed;
	throw new Error(`[snv-monsters] could not resolve actor YAML for ${sourceName}`);
}

function buildGeneratedArtworkFlags({
	folderName,
	avatarPath,
	tokenPath,
	confidence,
	reviewAuthority,
	provenance
}) {
	return {
		path: avatarPath,
		tokenPath,
		approval: "generated-original-reviewed",
		source: "ai-generated-original",
		loreConfidence: confidence,
		directory: folderName,
		identityMatch: "exact",
		tier: 1,
		exception: null,
		replacementStatus: null,
		externalProvenance: null,
		reviewAuthority,
		provenance
	};
}

export function installGeneratedArtwork({
	sourceName,
	avatarInputPath,
	tokenInputPath,
	evidence,
	baseline,
	yamlPath = null,
	packSourceRoot = COMMITTED_PACK_SOURCE,
	monsterIconRoot = MONSTERS_ICON_ROOT
}) {
	if ( !fs.existsSync(avatarInputPath) ) throw new Error(`[snv-monsters] missing avatar input: ${avatarInputPath}`);
	if ( !fs.existsSync(tokenInputPath) ) throw new Error(`[snv-monsters] missing token input: ${tokenInputPath}`);
	assertValidArtworkEvidence(evidence);
	const exactFolder = findExactMonsterArtworkFolder(sourceName, { monsterIconRoot });
	const folderName = exactFolder || formatMonsterArtworkFolderName(nextMonsterArtworkIndex({ monsterIconRoot }), sourceName);
	const targetDir = path.join(monsterIconRoot, folderName);
	const avatarPath = modulePathForMonsterArtwork(folderName, "Avatar.webp");
	const tokenPath = modulePathForMonsterArtwork(folderName, "Token.webp");
	const artworkFlags = buildGeneratedArtworkFlags({
		folderName,
		avatarPath,
		tokenPath,
		confidence: baseline?.confidence || "medium",
		reviewAuthority: evidence.reviewAuthority,
		provenance: evidence.provenance
	});
	ensureDir(targetDir);
	const actorYamlPath = resolveActorYamlPath({ sourceName, yamlPath, packSourceRoot });
	const raw = fs.readFileSync(actorYamlPath, "utf8");
	let next = replaceTopLevelImg(raw, avatarPath);
	next = replacePrototypeTokenSrc(next, tokenPath);
	next = replaceArtworkBlock(next, artworkFlags);
	fs.copyFileSync(avatarInputPath, path.join(targetDir, "Avatar.webp"));
	fs.copyFileSync(tokenInputPath, path.join(targetDir, "Token.webp"));
	fs.writeFileSync(actorYamlPath, next, "utf8");
	return {
		sourceName,
		folderName,
		avatarPath,
		tokenPath,
		actorYamlPath,
		artworkFlags
	};
}

export function resetArtworkInstallCachesForTests() {
	cachedActorPathByName = null;
}
