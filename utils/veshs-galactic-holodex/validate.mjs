import {
	COLLECTION_ID,
	COMMITTED_PACK_SOURCE,
	PACK_NAME,
	SANDBOX_AUDIT,
	SANDBOX_PROTOTYPE
} from "./paths.mjs";
import { loadIdentityMap, summarizeIdentityMap } from "./identity.mjs";
import { assertAllowedOutputRoot } from "./write-guard.mjs";

function expectFailure(fn, label, failures, messagePattern = /\b(refused|allowlisted|unknown production batch|cannot write)\b/i) {
	try {
		fn();
		failures.push(`expected refusal for ${label}`);
	} catch ( error ) {
		if ( !messagePattern.test(String(error?.message || "")) ) {
			failures.push(`unexpected error while validating ${label}: ${error?.message || error}`);
		}
	}
}

export function validateIdentityMap(map = loadIdentityMap()) {
	const failures = [];
	if ( map.pack !== PACK_NAME ) failures.push(`pack drift: ${map.pack}`);
	if ( map.collectionId !== COLLECTION_ID ) {
		failures.push(`collectionId drift: ${map.collectionId}`);
	}
	const summary = summarizeIdentityMap(map);
	if ( summary.actors !== 0 ) failures.push(`phase1 identity map must not prepopulate actors: ${summary.actors}`);
	return { ok: failures.length === 0, failures, summary };
}

export function validateWriteGuard() {
	const failures = [];
	for ( const relativePath of [
		"packs/_source/snv-monsters",
		"packs/_source/monsters",
		"packs/_source/veshs-galactic-holodex",
		"packs/veshs-galactic-holodex"
	] ) {
		expectFailure(() => assertAllowedOutputRoot(relativePath), relativePath, failures);
	}
	try {
		assertAllowedOutputRoot(SANDBOX_AUDIT);
	} catch ( error ) {
		failures.push(`sandbox audit root should be allowed: ${error.message}`);
	}
	try {
		assertAllowedOutputRoot(SANDBOX_PROTOTYPE);
	} catch ( error ) {
		failures.push(`sandbox prototype root should be allowed: ${error.message}`);
	}
	expectFailure(
		() => assertAllowedOutputRoot(COMMITTED_PACK_SOURCE, { allowProductionWrite: true, batch: "phase1" }),
		"unregistered production batch phase1",
		failures
	);
	return { ok: failures.length === 0, failures };
}
