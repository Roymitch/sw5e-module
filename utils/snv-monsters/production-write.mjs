import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { generateProductionBatch } from "./generate.mjs";
import { listBatchCandidates, loadProductionIdentityMap } from "./identity.mjs";
import { parseAuthoritativeSource } from "./parse.mjs";
import { COMMITTED_PACK_SOURCE, ROOT } from "./paths.mjs";
import {
	validateCompiledPackData,
	validateProductionCandidateLedger,
	validateProductionDeterministicRerun,
	validateProductionGeneratedManifest,
	validateProductionIdentityExtension,
	validateProductionPostwrite,
	validateTrackedChangesInScope
} from "./validate.mjs";
import { getAllowedTrackedRelativePaths, getProductionBatchDescriptor } from "./write-guard.mjs";

export const N3_AUDIT_DIR = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3");

function ensureBatch(batch) {
	return getProductionBatchDescriptor(batch);
}

function artifactFilename(batch, suffix, artifactPrefix = null) {
	const descriptor = ensureBatch(batch);
	const prefix = artifactPrefix || descriptor.artifactPrefix;
	return `${prefix}-${suffix}`;
}

function artifactPath(batch, suffix, artifactPrefix = null) {
	fs.mkdirSync(N3_AUDIT_DIR, { recursive: true });
	return path.join(N3_AUDIT_DIR, artifactFilename(batch, suffix, artifactPrefix));
}

function writeJsonArtifact(batch, suffix, data, artifactPrefix = null) {
	fs.writeFileSync(artifactPath(batch, suffix, artifactPrefix), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeMarkdownArtifact(batch, suffix, text, artifactPrefix = null) {
	fs.writeFileSync(artifactPath(batch, suffix, artifactPrefix), `${String(text).trimEnd()}\n`, "utf8");
}

function git(args) {
	return execFileSync("git", args, {
		cwd: ROOT,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"]
	}).trim();
}

function getStatusLines() {
	const output = git(["status", "--short"]);
	return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function getFoundryProcesses() {
	try {
		const output = execFileSync("powershell", [
			"-NoProfile",
			"-Command",
			"@(Get-Process | Where-Object { $_.ProcessName -match 'Foundry' } | Select-Object ProcessName, Id) | ConvertTo-Json -Compress"
		], {
			cwd: ROOT,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"]
		}).trim();
		if ( !output ) return [];
		const parsed = JSON.parse(output);
		return Array.isArray(parsed) ? parsed : [parsed];
	} catch {
		return [];
	}
}

function loadBatchLedger(batchLedgerPath) {
	const resolved = path.resolve(ROOT, batchLedgerPath);
	return JSON.parse(fs.readFileSync(resolved, "utf8"));
}

function loadWriteResult(batch, artifactPrefix = null) {
	const filePath = artifactPath(batch, "write-result.json", artifactPrefix);
	if ( !fs.existsSync(filePath) ) throw new Error(`[snv-monsters] missing ${path.basename(filePath)} for rerun comparison`);
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildBaselineMarkdown(result) {
	return [
		`# ${result.batch.toUpperCase()} Baseline Gate`,
		"",
		`- Repo: \`${result.repoRoot}\``,
		`- Branch: \`${result.branch}\``,
		`- HEAD: \`${result.head}\``,
		`- origin/v.next: \`${result.originHead}\``,
		`- Ahead/behind: \`${result.aheadBehind}\``,
		`- Expected head: \`${result.expectedHead || "(not enforced)"}\``,
		`- Expected head ok: \`${result.expectedHeadOk}\``,
		`- Working tree clean: \`${result.workingTreeClean}\``,
		`- Working tree rule: \`${result.workingTreeRule}\``,
		`- Working tree condition ok: \`${result.workingTreeConditionOk}\``,
		`- Tracked status within batch scope: \`${result.trackedScope.ok}\``,
		`- Foundry running: \`${result.foundryRunning}\``,
		`- Candidate ledger valid: \`${result.candidateLedger.ok}\``,
		"",
		"## git status --short",
		"",
		...((result.statusLines.length ? result.statusLines : ["(clean)"]).map(line => `- \`${line}\``))
	].join("\n");
}

function currentBaseline(batch, batchLedgerPath, expectedHead) {
	const descriptor = ensureBatch(batch);
	const ledger = loadBatchLedger(batchLedgerPath);
	const repoRoot = git(["rev-parse", "--show-toplevel"]);
	const branch = git(["branch", "--show-current"]);
	const head = git(["rev-parse", "HEAD"]);
	const originHead = git(["rev-parse", "origin/v.next"]);
	const aheadBehind = git(["rev-list", "--left-right", "--count", "origin/v.next...HEAD"]);
	const statusLines = getStatusLines();
	const trackedScope = validateTrackedChangesInScope(statusLines, getAllowedTrackedRelativePaths(batch));
	const candidateLedger = validateProductionCandidateLedger(batch, ledger);
	const foundryProcesses = getFoundryProcesses();
	const workingTreeClean = statusLines.length === 0;
	const workingTreeConditionOk = descriptor.requireWorkingTreeClean ? workingTreeClean : trackedScope.ok;
	const expectedHeadOk = expectedHead ? (head === expectedHead && originHead === expectedHead) : true;
	const result = {
		batch,
		repoRoot,
		branch,
		head,
		originHead,
		aheadBehind,
		statusLines,
		workingTreeClean,
		workingTreeRule: descriptor.requireWorkingTreeClean ? "clean" : "allowlisted-in-scope",
		workingTreeConditionOk,
		trackedScope,
		foundryProcesses,
		foundryRunning: foundryProcesses.length > 0,
		candidateLedger,
		expectedHead: expectedHead || null,
		expectedHeadOk,
		ok: path.resolve(repoRoot) === path.resolve(ROOT)
			&& branch === "v.next"
			&& aheadBehind === "0\t0"
			&& expectedHeadOk
			&& workingTreeConditionOk
			&& !foundryProcesses.length
			&& candidateLedger.ok
			&& trackedScope.ok
	};
	return { ledger, result };
}

function currentIr() {
	const parsed = parseAuthoritativeSource();
	if ( !parsed.ok ) throw new Error(parsed.reason);
	return parsed.ir;
}

export function runBaselineGate({ batch, batchLedgerPath, expectedHead, artifactPrefix = null }) {
	const { result } = currentBaseline(batch, batchLedgerPath, expectedHead);
	writeMarkdownArtifact(batch, "baseline-gate.md", buildBaselineMarkdown(result), artifactPrefix);
	return result;
}

export function runDryRun({ batch, batchLedgerPath, outputRoot, expectedHead, artifactPrefix = null }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const manifest = generateProductionBatch({
		batch,
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: false
	});
	const generated = validateProductionGeneratedManifest(batch, manifest, ledger, identityMap);
	const report = {
		baseline,
		generated,
		emitted: manifest.emitted,
		exceptionCount: manifest.exceptions.length
	};
	report.ok = baseline.ok && generated.ok && manifest.exceptions.length === 0;
	writeJsonArtifact(batch, "dry-run.json", report, artifactPrefix);
	return report;
}

export function runPrewriteValidation({ batch, batchLedgerPath, outputRoot = COMMITTED_PACK_SOURCE, expectedHead, artifactPrefix = null }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const identityMap = loadProductionIdentityMap();
	const identity = validateProductionIdentityExtension(batch, identityMap, ledger);
	const expectedYamlPaths = listBatchCandidates(ledger).map(candidate =>
		path.resolve(ROOT, outputRoot, "beasts", `${candidate.semanticKey.split(":").at(-1)}.yml`)
	);
	const preexistingYaml = expectedYamlPaths
		.filter(filePath => fs.existsSync(filePath))
		.map(filePath => path.relative(ROOT, filePath).split(path.sep).join("/"));
	const report = {
		baseline,
		identity,
		preexistingYaml,
		ok: baseline.ok && identity.ok && preexistingYaml.length === 0
	};
	writeJsonArtifact(batch, "prewrite-validation.json", report, artifactPrefix);
	return report;
}

export function runProductionWrite({ batch, batchLedgerPath, outputRoot, expectedHead, artifactPrefix = null }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const manifest = generateProductionBatch({
		batch,
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: true
	});
	const generated = validateProductionGeneratedManifest(batch, manifest, ledger, identityMap);
	const report = {
		baseline,
		generated,
		emitted: manifest.emitted,
		exceptions: manifest.exceptions,
		ok: baseline.ok && generated.ok && manifest.exceptions.length === 0
	};
	writeJsonArtifact(batch, "write-result.json", report, artifactPrefix);
	return report;
}

export function runPostwriteValidation({ batch, batchLedgerPath, outputRoot, expectedHead, artifactPrefix = null }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const identityMap = loadProductionIdentityMap();
	const postwrite = validateProductionPostwrite(batch, outputRoot, ledger, identityMap);
	const report = {
		baseline,
		postwrite,
		ok: baseline.ok && postwrite.ok
	};
	writeJsonArtifact(batch, "postwrite-validation.json", report, artifactPrefix);
	return report;
}

export function runRerunCheck({ batch, batchLedgerPath, outputRoot, expectedHead, artifactPrefix = null }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const writeResult = loadWriteResult(batch, artifactPrefix);
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const rerunManifest = generateProductionBatch({
		batch,
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: false
	});
	const rerun = validateProductionDeterministicRerun({ emitted: writeResult.emitted }, rerunManifest);
	const report = {
		baseline,
		rerun,
		emitted: rerunManifest.emitted,
		ok: baseline.ok && rerun.ok
	};
	writeJsonArtifact(batch, "deterministic-rerun.json", report, artifactPrefix);
	return report;
}

export async function runCompiledValidate({ pack, batch, batchLedgerPath, artifactPrefix = null }) {
	ensureBatch(batch);
	if ( pack !== "snv-monsters" ) throw new Error(`[snv-monsters] unsupported compiled-validate pack: ${pack}`);
	const ledger = loadBatchLedger(batchLedgerPath);
	const identityMap = loadProductionIdentityMap();
	const db = new ClassicLevel(path.join(ROOT, "packs", pack), {
		keyEncoding: "utf8",
		valueEncoding: "json"
	});
	await db.open();
	const entries = [];
	for await ( const [key, value] of db.iterator() ) entries.push({ key, value });
	await db.close();
	const compiled = validateCompiledPackData(entries, ledger, identityMap);
	const report = {
		pack,
		entryCount: entries.length,
		compiled,
		ok: compiled.ok
	};
	writeJsonArtifact(batch, "compiled-validation.json", report, artifactPrefix);
	return report;
}

function normalizeLegacyReportArtifactArgs(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix) {
	if ( textOrArtifactPrefix === undefined ) {
		return {
			batch: "n3a",
			text: batchOrText,
			artifactPrefix: null
		};
	}
	return {
		batch: batchOrText,
		text: textOrArtifactPrefix,
		artifactPrefix: maybeArtifactPrefix || null
	};
}

export function writeBuildResultMarkdown(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix = null) {
	const { batch, text, artifactPrefix } = normalizeLegacyReportArtifactArgs(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix);
	writeMarkdownArtifact(batch, "build-result.md", text, artifactPrefix);
}

export function writeRegressionMarkdown(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix = null) {
	const { batch, text, artifactPrefix } = normalizeLegacyReportArtifactArgs(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix);
	writeMarkdownArtifact(batch, "regression-tests.md", text, artifactPrefix);
}

export function writeImplementationReport(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix = null) {
	const { batch, text, artifactPrefix } = normalizeLegacyReportArtifactArgs(batchOrText, textOrArtifactPrefix, maybeArtifactPrefix);
	writeMarkdownArtifact(batch, "implementation-report.md", text, artifactPrefix);
}
