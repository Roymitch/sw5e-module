import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "../..");
export const MODULE_ID = "sw5e-module";
export const PACK_NAME = "veshs-galactic-holodex";
export const COLLECTION_ID = `${MODULE_ID}.${PACK_NAME}`;

export const COMMITTED_PACK_SOURCE = path.join(ROOT, "packs/_source/veshs-galactic-holodex");
export const COMPILED_PACK_PATH = path.join(ROOT, "packs/veshs-galactic-holodex");
export const IDENTITY_MAP_PATH = path.join(__dirname, "manifests/identity-map.json");

export const SOURCE_FILE = "ai/Veshs_Galactic_Holodex.md";
export const SOURCE_PATH = path.join(ROOT, SOURCE_FILE);
export const SOURCE_IDENTITY = PACK_NAME;
export const SOURCE_ABBREVIATION = "VGH";
export const SOURCE_VISIBLE = "Vesh's Galactic Holodex";
export const SOURCE_SHA256 = "E616AA7F9F8762CFA66BD744EE0EB8A8DAFE3DB8A68F6E3AAA8A7B641AA0C8AC";

// Phase 0 proved these counts against the locked source hash above.
export const EXPECTED_TOC_ENTRY_COUNT = 117;
export const EXPECTED_BODY_HEADING_COUNT = 116;
export const EXPECTED_COMPLETE_ACTOR_COUNT = 115;
export const EXPECTED_ATTACK_NAME_COUNT = 69;
export const EXPECTED_FORCE_ACTOR_COUNT = 13;
export const EXPECTED_TECH_ACTOR_COUNT = 7;

export const SANDBOX_PROTOTYPE = path.join(ROOT, "ai/prototypes/veshs-galactic-holodex");
export const SANDBOX_AUDIT = path.join(ROOT, "ai/audits/veshs-galactic-holodex");

export const SCHEMA_VERSION = "vgh-ir-0.1";
export const GENERATOR_VERSION = "vgh-phase2-2026-08-07";
