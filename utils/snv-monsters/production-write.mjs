import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { generateProductionBatch } from "./generate.mjs";
import { loadProductionIdentityMap } from "./identity.mjs";
import { parseAuthoritativeSource } from "./parse.mjs";
import { ROOT } from "./paths.mjs";
import {
	validateCompiledPackData,
	validateN3aCandidateLedger,
	validateN3aDeterministicRerun,
	validateN3aGeneratedManifest,
	validateN3aIdentityExtension,
	validateN3aPostwrite,
	validateTrackedChangesInScope
} from "./validate.mjs";

export const N3_AUDIT_DIR = path.join(ROOT, "ai/audits/snv-monsters-compendium/n3");

function ensureBatch(batch) {
	if ( batch !== "n3a" ) throw new Error(`[snv-monsters] unsupported production batch: ${batch}`);
}

function artifactPath(filename) {
	fs.mkdirSync(N3_AUDIT_DIR, { recursive: true });
	return path.join(N3_AUDIT_DIR, filename);
}

function writeJsonArtifact(filename, data) {
	fs.writeFileSync(artifactPath(filename), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeMarkdownArtifact(filename, text) {
	fs.writeFileSync(artifactPath(filename), `${String(text).trimEnd()}\n`, "utf8");
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

function loadWriteResult() {
	const filePath = artifactPath("n3a-write-result.json");
	if ( !fs.existsSync(filePath) ) throw new Error("[snv-monsters] missing n3a-write-result.json for rerun comparison");
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildBaselineMarkdown(result) {
	return [
		"# N3a Baseline Gate",
		"",
		`- Repo: \`${result.repoRoot}\``,
		`- Branch: \`${result.branch}\``,
		`- HEAD: \`${result.head}\``,
		`- origin/v.next: \`${result.originHead}\``,
		`- Ahead/behind: \`${result.aheadBehind}\``,
		`- Working tree clean: \`${result.workingTreeClean}\``,
		`- Tracked status within N3a scope: \`${result.trackedScope.ok}\``,
		`- Foundry running: \`${result.foundryRunning}\``,
		`- Candidate ledger valid: \`${result.candidateLedger.ok}\``,
		"",
		"## git status --short",
		"",
		...((result.statusLines.length ? result.statusLines : ["(clean)"]).map(line => `- \`${line}\``))
	].join("\n");
}

function currentBaseline(batch, batchLedgerPath, expectedHead) {
	ensureBatch(batch);
	const ledger = loadBatchLedger(batchLedgerPath);
	const repoRoot = git(["rev-parse", "--show-toplevel"]);
	const branch = git(["branch", "--show-current"]);
	const head = git(["rev-parse", "HEAD"]);
	const originHead = git(["rev-parse", "origin/v.next"]);
	const aheadBehind = git(["rev-list", "--left-right", "--count", "origin/v.next...HEAD"]);
	const statusLines = getStatusLines();
	const trackedScope = validateTrackedChangesInScope(statusLines);
	const candidateLedger = validateN3aCandidateLedger(ledger);
	const foundryProcesses = getFoundryProcesses();
	const result = {
		batch,
		repoRoot,
		branch,
		head,
		originHead,
		aheadBehind,
		statusLines,
		workingTreeClean: statusLines.length === 0,
		trackedScope,
		foundryProcesses,
		foundryRunning: foundryProcesses.length > 0,
		candidateLedger,
		expectedHead,
		ok: path.resolve(repoRoot) === path.resolve(ROOT)
			&& branch === "v.next"
			&& head === expectedHead
			&& originHead === expectedHead
			&& aheadBehind === "0\t0"
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

export function runBaselineGate({ batch, batchLedgerPath, expectedHead }) {
	const { result } = currentBaseline(batch, batchLedgerPath, expectedHead);
	writeMarkdownArtifact("n3a-baseline-gate.md", buildBaselineMarkdown(result));
	return result;
}

export function runDryRun({ batch, batchLedgerPath, outputRoot, expectedHead }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const manifest = generateProductionBatch({
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: false
	});
	const generated = validateN3aGeneratedManifest(manifest, ledger, identityMap);
	const report = {
		baseline,
		generated,
		emitted: manifest.emitted,
		exceptionCount: manifest.exceptions.length
	};
	report.ok = baseline.ok && generated.ok && manifest.exceptions.length === 0;
	writeJsonArtifact("n3a-dry-run.json", report);
	return report;
}

export function runPrewriteValidation({ batch, batchLedgerPath, outputRoot, expectedHead }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const identityMap = loadProductionIdentityMap();
	const identity = validateN3aIdentityExtension(identityMap, ledger);
	const expectedYamlPaths = ledger.finalCandidates.map(candidate =>
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
	writeJsonArtifact("n3a-prewrite-validation.json", report);
	return report;
}

export function runProductionWrite({ batch, batchLedgerPath, outputRoot, expectedHead }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const manifest = generateProductionBatch({
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: true
	});
	const generated = validateN3aGeneratedManifest(manifest, ledger, identityMap);
	const report = {
		baseline,
		generated,
		emitted: manifest.emitted,
		exceptions: manifest.exceptions,
		ok: baseline.ok && generated.ok && manifest.exceptions.length === 0
	};
	writeJsonArtifact("n3a-write-result.json", report);
	return report;
}

export function runPostwriteValidation({ batch, batchLedgerPath, outputRoot, expectedHead }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const identityMap = loadProductionIdentityMap();
	const postwrite = validateN3aPostwrite(outputRoot, ledger, identityMap);
	const report = {
		baseline,
		postwrite,
		ok: baseline.ok && postwrite.ok
	};
	writeJsonArtifact("n3a-postwrite-validation.json", report);
	return report;
}

export function runRerunCheck({ batch, batchLedgerPath, outputRoot, expectedHead }) {
	const { ledger, result: baseline } = currentBaseline(batch, batchLedgerPath, expectedHead);
	const writeResult = loadWriteResult();
	const ir = currentIr();
	const identityMap = loadProductionIdentityMap();
	const rerunManifest = generateProductionBatch({
		outputRoot,
		identityMap,
		irEntries: ir.entries,
		batchLedger: ledger,
		write: false
	});
	const rerun = validateN3aDeterministicRerun({ emitted: writeResult.emitted }, rerunManifest);
	const report = {
		baseline,
		rerun,
		emitted: rerunManifest.emitted,
		ok: baseline.ok && rerun.ok
	};
	writeJsonArtifact("n3a-deterministic-rerun.json", report);
	return report;
}

export async function runCompiledValidate({ pack, batch, batchLedgerPath }) {
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
	writeJsonArtifact("n3a-compiled-validation.json", report);
	return report;
}

export function writeBuildResultMarkdown(text) {
	writeMarkdownArtifact("n3a-build-result.md", text);
}

export function writeRegressionMarkdown(text) {
	writeMarkdownArtifact("n3a-regression-tests.md", text);
}

export function writeImplementationReport(text) {
	writeMarkdownArtifact("n3a-implementation-report.md", text);
}
