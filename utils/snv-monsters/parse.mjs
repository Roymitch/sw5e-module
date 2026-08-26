/**
 * Deterministic SnV markdown parser → IR + four-dimensional classification.
 * Does not silently substitute alternate corpora.
 */
import fs from "node:fs";
import { classifyFourDimensional } from "./classify.mjs";
import { edgeCaseNameSet } from "./edge-cases.mjs";
import { loadIdentityMap } from "./identity.mjs";
import { createEmptyIrEntry, validateIrEntry } from "./ir-schema.mjs";
import {
	normalizeName,
	semanticKeyFor,
	sha256
} from "./parse-helpers.mjs";
import {
	EXPECTED_COMPLETE_ENTRIES,
	GENERATOR_VERSION,
	SCHEMA_VERSION,
	SNV_FINAL_PATH
} from "./paths.mjs";

export { normalizeName, slugifyName, sha256, semanticKeyFor } from "./parse-helpers.mjs";

/**
 * Split markdown into sectioned creature raw blocks.
 */
export function splitCreatureBlocks(markdown) {
	const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
	const blocks = [];
	let section = "Uncategorized";
	let current = null;

	const flush = () => {
		if ( !current ) return;
		blocks.push(current);
		current = null;
	};

	for ( const line of lines ) {
		const h1 = line.match(/^#\s+(.+)$/);
		if ( h1 && !line.startsWith("> ") ) {
			flush();
			section = h1[1].trim();
			continue;
		}
		const headingBq = line.match(/^>\s*##\s+(.+)$/);
		const headingPlain = line.match(/^##\s+(.+)$/);
		const heading = headingBq || headingPlain;
		if ( heading ) {
			flush();
			current = { name: heading[1].trim(), section, lines: [] };
			continue;
		}
		if ( current ) current.lines.push(line);
	}
	flush();
	return blocks;
}

function buildForceTechBreakdown(features) {
	const ft = {
		actorResourcesSupported: !!(features.hasForce || features.hasTech),
		powerLookup: features.hasPowerList ? "partial" : (features.hasForce || features.hasTech ? "not-assessed" : "n/a"),
		powerEmbedding: features.hasForce || features.hasTech ? "unsupported" : "n/a",
		activityAvailability: features.hasForce || features.hasTech ? "unsupported" : "n/a",
		pointConsumption: features.hasForce || features.hasTech ? "not-assessed" : "n/a",
		discountCompatibility: features.hasForce || features.hasTech ? "requires-activity-consume-targets" : "n/a",
		unsupportedPowerMechanics: []
	};
	if ( features.hasForce ) ft.unsupportedPowerMechanics.push("force-power-items-not-embedded");
	if ( features.hasTech ) ft.unsupportedPowerMechanics.push("tech-power-items-not-embedded");
	if ( features.hasPowerList ) ft.unsupportedPowerMechanics.push("power-list-not-resolved");
	return ft;
}

/**
 * Parse markdown string into IR entries + ledger.
 */
export function parseMarkdownToIr(markdown, opts = {}) {
	const identityMap = opts.identityMap || loadIdentityMap();
	const edgeNames = opts.edgeCaseNames || edgeCaseNameSet();
	const blocks = splitCreatureBlocks(markdown);
	const entries = [];
	let sourceOrder = 0;

	for ( const block of blocks ) {
		sourceOrder += 1;
		const body = block.lines.join("\n");
		const rawSourceHash = sha256(`${block.name}\n${body}`);
		const warnings = [];
		let parseFailed = false;
		if ( !block.name ) {
			parseFailed = true;
			warnings.push("missing name");
		}

		const c = classifyFourDimensional({
			name: block.name,
			section: block.section,
			body,
			parseFailed,
			warnings,
			edgeCaseNames: edgeNames,
			identityMap
		});

		const semanticKey = c.semanticKeyOverride || semanticKeyFor(block.section, block.name);
		const entry = createEmptyIrEntry({
			schemaVersion: SCHEMA_VERSION,
			generatorVersion: GENERATOR_VERSION,
			sourceName: block.name,
			normalizedName: normalizeName(block.name),
			semanticKey,
			section: block.section,
			sourceOrder,
			rawSourceHash,
			parseStatus: c.parseStatus,
			capabilityStatus: c.capabilityStatus,
			outputSelection: c.outputSelection,
			productionReadiness: c.productionReadiness,
			warnings,
			unsupportedMechanics: c.unsupportedMechanics,
			features: c.features,
			manualReview: c.capabilityStatus === "manual-review-required",
			manualReviewReasons: c.capabilityStatus === "manual-review-required" ? c.capabilityReasons : [],
			confidence: c.pinned ? "high" : (c.features.hasBasicScalars ? "medium" : "low"),
			intentionallyExcluded: c.intentionallyExcluded,
			forceTech: buildForceTechBreakdown(c.features),
			legacyNote: {
				priorGeneratorBucketMistake: "N2-A/E initially set generator-unsupported for non-N1 pins via not-in-n1-supported-set"
			}
		});

		const v = validateIrEntry(entry);
		if ( !v.ok && !entry.intentionallyExcluded ) entry.warnings.push(...v.errors);
		entries.push(entry);
	}

	return {
		schemaVersion: SCHEMA_VERSION,
		generatorVersion: GENERATOR_VERSION,
		entryCount: entries.length,
		entries
	};
}

export function loadAuthoritativeSnVSource(filePath = SNV_FINAL_PATH) {
	if ( !fs.existsSync(filePath) ) {
		return {
			ok: false,
			reason: `Local authoritative source missing: ${filePath}. `
				+ "Integration tests must skip; do not substitute recovered/alternate corpora."
		};
	}
	return { ok: true, path: filePath, markdown: fs.readFileSync(filePath, "utf8") };
}

export function parseAuthoritativeSource(opts = {}) {
	const loaded = loadAuthoritativeSnVSource(opts.path);
	if ( !loaded.ok ) return loaded;
	const ir = parseMarkdownToIr(loaded.markdown, opts);
	return { ok: true, path: loaded.path, ir, expectedComplete: EXPECTED_COMPLETE_ENTRIES };
}
