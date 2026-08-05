/**
 * CLI for Phase N2 snv-monsters tooling.
 */
import fs from "node:fs";
import path from "node:path";
import { categoryCoverage, EDGE_CASE_SELECTION } from "./edge-cases.mjs";
import { generateSandbox } from "./generate.mjs";
import { loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import { canonicalResolutionAuditReport } from "./canonical.mjs";
import { parseAuthoritativeSource } from "./parse.mjs";
import { parityAgainstCommitted } from "./parity.mjs";
import {
	EXPECTED_COMPLETE_ENTRIES,
	SANDBOX_AUDIT,
	SANDBOX_PROTOTYPE
} from "./paths.mjs";
import { runOfflineValidationSuite, validateWriteGuard } from "./validate.mjs";
import {
	runBaselineGate,
	runCompiledValidate,
	runDryRun,
	runPostwriteValidation,
	runPrewriteValidation,
	runProductionWrite,
	runRerunCheck
} from "./production-write.mjs";

function writeJson(filePath, data) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function cmdParse() {
	const result = parseAuthoritativeSource();
	if ( !result.ok ) {
		console.error(result.reason);
		process.exit(2);
	}
	const { ir } = result;
	writeJson(path.join(SANDBOX_AUDIT, "ir-ledger.json"), ir);
	const complete = ir.entries.filter(e => !e.intentionallyExcluded);
	const dim = (key) => {
		const o = {};
		for ( const e of complete ) o[e[key]] = (o[e[key]] || 0) + 1;
		return o;
	};
	const summary = {
		totalBlocks: ir.entries.length,
		complete: complete.length,
		expectedComplete: EXPECTED_COMPLETE_ENTRIES,
		intentionallyExcluded: ir.entries.filter(e => e.intentionallyExcluded).map(e => e.sourceName),
		parseStatus: dim("parseStatus"),
		capabilityStatus: dim("capabilityStatus"),
		outputSelection: dim("outputSelection"),
		productionReadiness: dim("productionReadiness"),
		n1Parity: complete.filter(e => e.outputSelection === "selected-n1-parity").map(e => e.sourceName),
		edgeCases: complete.filter(e => e.outputSelection === "selected-edge-case").map(e => e.sourceName),
		edgeCasePlan: EDGE_CASE_SELECTION,
		categoryCoverage: categoryCoverage(),
		legacyConflationNote: "Prior 8/500 generator-supported/unsupported conflated N1 pin allowlist with capability"
	};
	writeJson(path.join(SANDBOX_AUDIT, "classification-summary.json"), summary);
	console.log(JSON.stringify(summary, null, 2));
	if ( complete.length !== EXPECTED_COMPLETE_ENTRIES ) process.exit(1);
	return ir;
}

function cmdGenerate(ir) {
	const identityMap = loadIdentityMap();
	let entries = ir?.entries;
	if ( !entries ) {
		const parsed = parseAuthoritativeSource();
		if ( !parsed.ok ) {
			console.error(parsed.reason);
			process.exit(2);
		}
		entries = parsed.ir.entries;
	}
	const result = generateSandbox({
		outputRoot: SANDBOX_PROTOTYPE,
		identityMap,
		irEntries: entries
	});
	writeJson(path.join(SANDBOX_AUDIT, "generate-result.json"), {
		outputRoot: result.outputRoot,
		emitted: result.emitted.length,
		exceptionTotals: result.exceptionInventory.byCategory,
		edgeCases: result.edgeResults?.length
	});
	writeJson(path.join(SANDBOX_AUDIT, "canonical-resolution-audit.json"), canonicalResolutionAuditReport());
	console.log(JSON.stringify({
		outputRoot: result.outputRoot,
		emitted: result.emitted.length,
		exceptions: result.exceptions.length,
		edgeResults: result.edgeResults.length
	}, null, 2));
	return result;
}

function cmdValidate(ir) {
	const identityMap = loadIdentityMap();
	const ledgerPath = path.join(SANDBOX_AUDIT, "ir-ledger.json");
	const resolvedIr = ir || (fs.existsSync(ledgerPath)
		? JSON.parse(fs.readFileSync(ledgerPath, "utf8"))
		: null);
	const suite = runOfflineValidationSuite({
		ir: resolvedIr,
		sandboxRoot: SANDBOX_PROTOTYPE,
		identityMap
	});
	writeJson(path.join(SANDBOX_AUDIT, "offline-validation.json"), suite);
	console.log(JSON.stringify(suite, null, 2));
	if ( !suite.ok ) process.exit(1);
}

function cmdParity() {
	const result = parityAgainstCommitted(path.join(SANDBOX_PROTOTYPE, "actors"));
	writeJson(path.join(SANDBOX_AUDIT, "parity-result.json"), result);
	console.log(JSON.stringify(result, null, 2));
	if ( !result.ok ) process.exit(1);
}

function cmdPipeline() {
	console.log("identity", summarizeIdentityMap());
	console.log("writeGuard", validateWriteGuard());
	const ir = cmdParse();
	cmdGenerate(ir);
	cmdValidate(ir);
	cmdParity();
	console.log("PIPELINE_OK");
}

function parseArgs(argv) {
	const args = {};
	for ( let index = 0; index < argv.length; index += 1 ) {
		const token = argv[index];
		if ( !token.startsWith("--") ) continue;
		const key = token.slice(2);
		const next = argv[index + 1];
		if ( next && !next.startsWith("--") ) {
			args[key] = next;
			index += 1;
		} else args[key] = true;
	}
	return args;
}

async function main() {
	const cmd = process.argv[2] || "pipeline";
	const args = parseArgs(process.argv.slice(3));
	switch ( cmd ) {
		case "parse":
			cmdParse();
			break;
		case "generate":
			cmdGenerate();
			break;
		case "validate":
			cmdValidate();
			break;
		case "parity":
			cmdParity();
			break;
		case "pipeline":
			cmdPipeline();
			break;
		case "baseline": {
			const result = runBaselineGate({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "dry-run": {
			const result = runDryRun({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				outputRoot: args["output-root"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "prewrite-validate": {
			const result = runPrewriteValidation({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				outputRoot: args["output-root"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "production-write": {
			if ( args.allowProductionWrite !== true ) {
				console.error("[snv-monsters] production-write requires --allowProductionWrite");
				process.exit(1);
			}
			const result = runProductionWrite({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				outputRoot: args["output-root"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "postwrite-validate": {
			const result = runPostwriteValidation({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				outputRoot: args["output-root"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "rerun-check": {
			const result = runRerunCheck({
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"],
				outputRoot: args["output-root"],
				expectedHead: args["expected-head"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		case "compiled-validate": {
			const result = await runCompiledValidate({
				pack: args.pack,
				batch: args.batch,
				batchLedgerPath: args["batch-ledger"]
			});
			console.log(JSON.stringify(result, null, 2));
			if ( !result.ok ) process.exit(1);
			break;
		}
		default:
			console.error(`Unknown command ${cmd}`);
			process.exit(1);
	}
}

await main();
