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

function isUnder(parent, child) {
	const rel = path.relative(parent, child);
	return child === parent || (rel && !rel.startsWith("..") && !path.isAbsolute(rel));
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
				throw new Error(
					"[snv-monsters] production pack/source write is not authorized in Phase N2 "
					+ "(allowProductionWrite requires a future explicit authorization gate)."
				);
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
