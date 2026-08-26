import fs from "node:fs";
import {
	EXPECTED_ATTACK_NAME_COUNT,
	EXPECTED_BODY_HEADING_COUNT,
	EXPECTED_COMPLETE_ACTOR_COUNT,
	EXPECTED_FORCE_ACTOR_COUNT,
	EXPECTED_TECH_ACTOR_COUNT,
	EXPECTED_TOC_ENTRY_COUNT,
	GENERATOR_VERSION,
	SCHEMA_VERSION,
	SOURCE_PATH
} from "./paths.mjs";
import { detectFeatures } from "./classify.mjs";
import { parseCreatureTypeFromDescriptorPart } from "./creature-type-folders.mjs";
import { normalizeForMatching, sha256Buffer } from "./parse-helpers.mjs";
import { buildAttackNameCensus } from "./weapon-classification.mjs";

function normalizeLineEndings(value) {
	return String(value || "").replace(/\r\n/g, "\n");
}

export function parseTableOfContents(markdown) {
	const lines = normalizeLineEndings(markdown).split("\n");
	const entries = [];
	let section = "Uncategorized";
	const stopIndex = lines.findIndex(line => /^>\s*##\s+/i.test(line));
	const tocLines = stopIndex >= 0 ? lines.slice(0, stopIndex) : lines;
	for (const line of tocLines) {
		const sectionMatch = line.match(/^###\s+(?:[IVX]+\.\s*)?(.+?)\s*:?\s*$/);
		if (sectionMatch) {
			section = sectionMatch[1].trim();
			continue;
		}
		const entryMatch = line.match(/^\d+\.\s+\[(.+?)\]\(/);
		if (!entryMatch) continue;
		const name = entryMatch[1]
			.replace(/^\*\*|\*\*$/g, "")
			.replace(/\*\*/g, "")
			.replace(/\*/g, "")
			.trim();
		entries.push({
			name,
			sourceSection: section,
			matchKey: normalizeForMatching(name),
			rawLine: line
		});
	}
	return entries;
}

function scoreNameMatch(left, right) {
	const leftTokens = new Set(normalizeForMatching(left).split(" ").filter(Boolean));
	const rightTokens = new Set(normalizeForMatching(right).split(" ").filter(Boolean));
	if (!leftTokens.size || !rightTokens.size) return 0;
	let overlap = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) overlap += 1;
	}
	return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function findTocMatch(displayName, tocEntries) {
	const matchKey = normalizeForMatching(displayName);
	const exact = tocEntries.find(entry => entry.matchKey === matchKey);
	if (exact) return { tocMatch: exact, matchStatus: "exact" };
	let best = null;
	let bestScore = 0;
	for (const entry of tocEntries) {
		const entryKey = entry.matchKey;
		const inclusive = entryKey.includes(matchKey) || matchKey.includes(entryKey);
		const score = inclusive ? Math.max(scoreNameMatch(displayName, entry.name), 0.8) : scoreNameMatch(displayName, entry.name);
		if (score > bestScore) {
			best = entry;
			bestScore = score;
		}
	}
	if (best && bestScore >= 0.8) return { tocMatch: best, matchStatus: "name-drift" };
	return { tocMatch: null, matchStatus: "unmatched" };
}

export function splitBodyBlocks(markdown) {
	const lines = normalizeLineEndings(markdown).split("\n");
	const blocks = [];
	let current = null;
	const flush = () => {
		if (!current) return;
		current.body = current.lines.join("\n").trim();
		delete current.lines;
		blocks.push(current);
		current = null;
	};
	for (const line of lines) {
		const headingMatch = line.match(/^>\s*##\s+(.+)$/);
		if (headingMatch) {
			flush();
			current = {
				displayName: headingMatch[1].trim(),
				headingLine: line,
				lines: []
			};
			continue;
		}
		if (current) current.lines.push(line);
	}
	flush();
	return blocks;
}

function hasCompleteStatBlock(body) {
	return /Armor Class/i.test(body) && /Hit Points/i.test(body) && /Challenge/i.test(body);
}

function inferCreatureType(body) {
	const descriptorLine = normalizeLineEndings(body).split("\n").find(line => /^>\*\w|^\*\w|^>\*\w/i.test(line) || /^>\s*\*[^*]+\*$/i.test(line) || /^\*[^*]+\*$/i.test(line));
	if (!descriptorLine) return { value: "custom", subtype: "", swarm: "", custom: "" };
	const stripped = descriptorLine.replace(/^>\s*/, "").replace(/^\*|\*$/g, "").trim();
	const typePart = stripped.replace(/^(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+/i, "").split(/\s*,\s*/, 1)[0];
	return parseCreatureTypeFromDescriptorPart(typePart);
}

export function parseAuthoritativeSource({ path = SOURCE_PATH } = {}) {
	const buffer = fs.readFileSync(path);
	const markdown = normalizeLineEndings(buffer.toString("utf8"));
	const tocEntries = parseTableOfContents(markdown);
	const bodyBlocks = splitBodyBlocks(markdown);
	let lastSection = tocEntries[0]?.sourceSection || "Uncategorized";
	const completeActorBlocks = bodyBlocks
		.filter(block => hasCompleteStatBlock(block.body))
		.map((block, index) => {
			const { tocMatch, matchStatus } = findTocMatch(block.displayName, tocEntries);
			const sourceSection = tocMatch?.sourceSection || lastSection;
			lastSection = sourceSection;
			const creatureType = inferCreatureType(block.body);
			return {
				...block,
				sourceOrder: index + 1,
				sourceSection,
				matchStatus,
				tocMatch,
				creatureType: creatureType.value,
				creatureTypeDetails: creatureType
			};
		});

	const sourceCensus = {
		counts: {
			tocEntries: tocEntries.length,
			bodyHeadings: bodyBlocks.length,
			completeActors: completeActorBlocks.length
		}
	};

	const forceActors = [];
	const techActors = [];
	for (const block of completeActorBlocks) {
		const features = detectFeatures(block.body);
		block.features = features;
		if (features.hasForce) forceActors.push(block.displayName);
		if (features.hasTech) techActors.push(block.displayName);
	}

	const forceTechReadiness = {
		forceActorCount: forceActors.length,
		techActorCount: techActors.length,
		forceActors,
		techActors
	};

	const attackCensus = buildAttackNameCensus(completeActorBlocks);

	return {
		ok: true,
		path,
		schemaVersion: SCHEMA_VERSION,
		generatorVersion: GENERATOR_VERSION,
		sourceHash: sha256Buffer(buffer),
		sourceCensus,
		tocEntries,
		bodyBlocks,
		completeActorBlocks,
		forceTechReadiness,
		attackCensus,
		expectations: {
			tocEntries: EXPECTED_TOC_ENTRY_COUNT,
			bodyHeadings: EXPECTED_BODY_HEADING_COUNT,
			completeActors: EXPECTED_COMPLETE_ACTOR_COUNT,
			forceActors: EXPECTED_FORCE_ACTOR_COUNT,
			techActors: EXPECTED_TECH_ACTOR_COUNT,
			attackNames: EXPECTED_ATTACK_NAME_COUNT
		}
	};
}
