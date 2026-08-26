/**
 * Phase N2 paths and constants for snv-monsters tooling.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "../..");
export const MODULE_ID = "sw5e-module";
export const PACK_NAME = "snv-monsters";
export const COLLECTION_ID = `${MODULE_ID}.${PACK_NAME}`;

export const COMMITTED_PACK_SOURCE = path.join(ROOT, "packs/_source/snv-monsters");
export const IDENTITY_MAP_PATH = path.join(__dirname, "manifests/identity-map.json");
export const SNV_FINAL_PATH = path.join(ROOT, "ai/SnV_Final.md");

export const SANDBOX_PROTOTYPE = path.join(ROOT, "ai/prototypes/snv-monsters/n2");
export const SANDBOX_AUDIT = path.join(ROOT, "ai/audits/snv-monsters-compendium/n2");

export const SCHEMA_VERSION = "n2-ir-0.1";
export const GENERATOR_VERSION = "n2-2026-08-04";

/** @deprecated superseded by four-dimensional classification in classify.mjs */
export const GENERATOR_BUCKETS = [
	"generator-supported",
	"generator-partially-supported",
	"generator-unsupported",
	"manual-review-required",
	"parser-failure"
];

export const EXPECTED_COMPLETE_ENTRIES = 508;
export const EXPECTED_HEADINGS = 509;
