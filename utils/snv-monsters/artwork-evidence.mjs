import fs from "node:fs";
import path from "node:path";
import {
	assertValidArtworkEvidence,
	assertValidVisualBaseline,
	buildGeneratedArtworkProvenance
} from "./artwork-baseline.mjs";
import { ROOT } from "./paths.mjs";
import { slugifyName } from "./parse-helpers.mjs";

export const ARTWORK_GENERATION_ROOT = path.join(
	ROOT,
	"ai/audits/snv-monsters-compendium/n3/artwork-generation"
);

export const ARTWORK_GENERATION_ACTOR_ROOT = path.join(ARTWORK_GENERATION_ROOT, "actors");
export const ARTWORK_GENERATION_QUEUE_PATH = path.join(ARTWORK_GENERATION_ROOT, "queue.json");
export const VISUAL_BASELINE_SCHEMA_PATH = path.join(
	ARTWORK_GENERATION_ROOT,
	"schemas/visual-baseline.schema.json"
);
export const ARTWORK_EVIDENCE_SCHEMA_PATH = path.join(
	ARTWORK_GENERATION_ROOT,
	"schemas/artwork-evidence.schema.json"
);

function ensureDir(dirPath) {
	fs.mkdirSync(dirPath, { recursive: true });
}

function actorDirName(sourceIdentity, sourceName = null) {
	const raw = String(sourceIdentity || sourceName || "").trim();
	return slugifyName(raw);
}

export function actorArtworkAuditDir({ sourceIdentity, sourceName } = {}) {
	return path.join(ARTWORK_GENERATION_ACTOR_ROOT, actorDirName(sourceIdentity, sourceName));
}

export function ensureArtworkGenerationRoot() {
	ensureDir(path.join(ARTWORK_GENERATION_ROOT, "schemas"));
	ensureDir(ARTWORK_GENERATION_ACTOR_ROOT);
	return ARTWORK_GENERATION_ROOT;
}

function writeJson(filePath, value) {
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function loadJsonIfExists(filePath) {
	if ( !fs.existsSync(filePath) ) return null;
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeVisualBaselineArtifact(baseline, opts = {}) {
	assertValidVisualBaseline(baseline);
	const dirPath = actorArtworkAuditDir({
		sourceIdentity: baseline.sourceIdentity,
		sourceName: opts.sourceName
	});
	const filePath = opts.filePath || path.join(dirPath, "baseline.json");
	writeJson(filePath, baseline);
	return filePath;
}

export function writeArtworkEvidenceArtifact(evidence, opts = {}) {
	assertValidArtworkEvidence(evidence);
	const dirPath = actorArtworkAuditDir({
		sourceIdentity: evidence.sourceIdentity,
		sourceName: evidence.sourceName
	});
	const filePath = opts.filePath || path.join(dirPath, "evidence.json");
	writeJson(filePath, evidence);
	return filePath;
}

export function appendArtworkRejection(evidence, rejection) {
	const next = structuredClone(evidence || {});
	next.rejections = [...(next.rejections || []), rejection];
	return assertValidArtworkEvidence(next);
}

export function addAcceptedArtworkOutput(evidence, acceptedOutput) {
	const next = structuredClone(evidence || {});
	next.acceptedOutputs = [...(next.acceptedOutputs || []), acceptedOutput];
	return assertValidArtworkEvidence(next);
}

export function renderReferenceMarkdown(referenceObservations = []) {
	const lines = ["# Reference Observations", ""];
	for ( const reference of referenceObservations ) {
		lines.push(`- URL: ${reference.url}`);
		lines.push(`  - Recorded: ${reference.recordedOn}`);
		for ( const observation of reference.observations || [] ) {
			lines.push(`  - Observation: ${observation}`);
		}
	}
	lines.push("");
	return `${lines.join("\n")}`;
}

export function writeReferenceMarkdown({
	sourceIdentity,
	sourceName,
	referenceObservations
}) {
	const dirPath = actorArtworkAuditDir({ sourceIdentity, sourceName });
	const filePath = path.join(dirPath, "references.md");
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, renderReferenceMarkdown(referenceObservations), "utf8");
	return filePath;
}

export function createArtworkEvidence({
	sourceIdentity,
	sourceName,
	generatedOn,
	reviewAuthority,
	referenceObservations,
	generationPrompt,
	tool = "GenerateImage",
	model = "tool-generated"
}) {
	return assertValidArtworkEvidence({
		sourceIdentity,
		sourceName,
		generatedOn,
		reviewAuthority,
		unofficialFanContent: true,
		notEndorsedBy: ["Disney", "Lucasfilm"],
		referenceObservations,
		generationPrompt,
		rejections: [],
		acceptedOutputs: [],
		provenance: buildGeneratedArtworkProvenance({
			tool,
			model,
			generatedOn,
			reviewAuthority
		})
	});
}

export function writeArtworkAddendum({ date, slug, title, bodyLines }) {
	const filePath = path.join(ARTWORK_GENERATION_ROOT, `ADDENDUM-${date}-${slug}.md`);
	const lines = [
		"---",
		"",
		`## Addendum — ${date} — ${title}`,
		"",
		...bodyLines,
		""
	];
	ensureDir(path.dirname(filePath));
	fs.writeFileSync(filePath, lines.join("\n"), "utf8");
	return filePath;
}
