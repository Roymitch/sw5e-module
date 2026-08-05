/**
 * Hard write-root refusal for N2 generator.
 * Allows only approved gitignored sandbox roots.
 */
import path from "node:path";
import { COMMITTED_PACK_SOURCE, ROOT, SANDBOX_AUDIT, SANDBOX_PROTOTYPE } from "./paths.mjs";

const ALLOWED_PREFIXES = [
	path.resolve(SANDBOX_PROTOTYPE),
	path.resolve(SANDBOX_AUDIT)
];

const FORBIDDEN_PREFIXES = [
	path.resolve(COMMITTED_PACK_SOURCE),
	path.resolve(ROOT, "packs/snv-monsters"),
	path.resolve(ROOT, "packs/_source")
];

export const N3A_ALLOWED_TRACKED_RELATIVE_PATHS = [
	"utils/snv-monsters/identity.mjs",
	"utils/snv-monsters/generate-generalized.mjs",
	"utils/snv-monsters/generate.mjs",
	"utils/snv-monsters/production-write.mjs",
	"utils/snv-monsters/validate.mjs",
	"utils/snv-monsters/write-guard.mjs",
	"utils/snv-monsters/cli.mjs",
	"utils/snv-monsters/manifests/identity-map.json",
	"packs/_source/snv-monsters/beasts/blurrg.yml",
	"packs/_source/snv-monsters/beasts/fyrnock.yml",
	"packs/_source/snv-monsters/beasts/jakrab.yml",
	"packs/_source/snv-monsters/beasts/kath-hound.yml",
	"packs/_source/snv-monsters/beasts/massiff.yml",
	"packs/_source/snv-monsters/beasts/stintaril.yml",
	"packs/_source/snv-monsters/beasts/zalaaca.yml"
];

export const N3A_ALLOWED_PRODUCTION_YAMLS = N3A_ALLOWED_TRACKED_RELATIVE_PATHS
	.filter(relativePath => relativePath.startsWith("packs/_source/snv-monsters/beasts/"))
	.map(relativePath => path.resolve(ROOT, relativePath));

function isUnder(parent, child) {
	const rel = path.relative(parent, child);
	return child === parent || (rel && !rel.startsWith("..") && !path.isAbsolute(rel));
}

function isExactAllowedTrackedPath(candidate) {
	const relative = path.relative(ROOT, candidate).split(path.sep).join("/");
	return N3A_ALLOWED_TRACKED_RELATIVE_PATHS.includes(relative);
}

export function toRepoRelative(candidate) {
	return path.relative(ROOT, candidate).split(path.sep).join("/");
}

export function isAllowedN3aTrackedPath(candidate) {
	return isExactAllowedTrackedPath(path.resolve(ROOT, candidate));
}

/**
 * @param {string} outputRoot
 * @param {{ allowProductionWrite?: boolean }} [opts]
 * @returns {string} resolved absolute path
 */
export function assertAllowedOutputRoot(outputRoot, opts = {}) {
	if ( !outputRoot || typeof outputRoot !== "string" ) {
		throw new Error("[snv-monsters] output root is required");
	}
	const resolved = path.resolve(ROOT, outputRoot);

	for ( const forbidden of FORBIDDEN_PREFIXES ) {
		if ( isUnder(forbidden, resolved) ) {
			if ( opts.allowProductionWrite === true ) {
				if ( opts.batch === "n3a" && resolved === path.resolve(COMMITTED_PACK_SOURCE) ) return resolved;
				throw new Error("[snv-monsters] production pack/source write is only authorized for the exact N3a pack source root.");
			}
			throw new Error(
				`[snv-monsters] REFUSED: cannot write under ${path.relative(ROOT, forbidden) || forbidden} during N2. `
				+ "Use ai/prototypes/snv-monsters/n2/ or ai/audits/snv-monsters-compendium/n2/."
			);
		}
	}

	const allowed = ALLOWED_PREFIXES.some(prefix => isUnder(prefix, resolved));
	if ( !allowed ) {
		throw new Error(
			`[snv-monsters] REFUSED: output root not in allowed N2 sandbox paths: ${resolved}`
		);
	}

	return resolved;
}

export function isCommittedPackPath(candidate) {
	const resolved = path.resolve(ROOT, candidate);
	return isUnder(path.resolve(COMMITTED_PACK_SOURCE), resolved)
		|| isUnder(path.resolve(ROOT, "packs/snv-monsters"), resolved);
}

export function assertApprovedN3aYamlPath(candidate) {
	const resolved = path.resolve(ROOT, candidate);
	if ( !N3A_ALLOWED_PRODUCTION_YAMLS.includes(resolved) ) {
		throw new Error(`[snv-monsters] REFUSED: non-approved N3a YAML path ${toRepoRelative(resolved)}`);
	}
	return resolved;
}
