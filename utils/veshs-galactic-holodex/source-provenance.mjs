import {
	COLLECTION_ID,
	PACK_NAME,
	SOURCE_FILE,
	SOURCE_IDENTITY,
	SOURCE_VISIBLE
} from "./paths.mjs";

export const VGH_PROVENANCE_FLAG = "veshsGalacticHolodex";

const REQUIRED_PROVENANCE_KEYS = Object.freeze([
	"sourceIdentity",
	"sourceFile",
	"sourceSection",
	"sourceHash",
	"semanticKey",
	"generatorVersion"
]);

function normalizeActor(actor) {
	return {
		...actor,
		system: {
			...(actor.system || {}),
			details: {
				...((actor.system && actor.system.details) || {}),
				source: {
					...((((actor.system || {}).details || {}).source) || {})
				}
			},
			source: {
				...((actor.system && actor.system.source) || {})
			}
		},
		flags: {
			...(actor.flags || {}),
			sw5e: {
				...((actor.flags && actor.flags.sw5e) || {})
			}
		}
	};
}

export function buildActorProvenance(provenance) {
	return {
		sourceIdentity: SOURCE_IDENTITY,
		sourceFile: SOURCE_FILE,
		sourceSection: provenance.sourceSection,
		sourceHash: provenance.sourceHash,
		semanticKey: provenance.semanticKey,
		generatorVersion: provenance.generatorVersion,
		sourceEntry: provenance.sourceEntry || null,
		trackedPack: PACK_NAME,
		collectionId: COLLECTION_ID
	};
}

export function applyActorPublicationSource(actor, provenance) {
	const nextActor = normalizeActor(actor);
	return {
		...nextActor,
		system: {
			...nextActor.system,
			details: {
				...nextActor.system.details,
				source: {
					...nextActor.system.details.source,
					custom: SOURCE_VISIBLE,
					label: SOURCE_VISIBLE
				}
			},
			source: {
				...nextActor.system.source,
				custom: SOURCE_VISIBLE,
				label: SOURCE_VISIBLE
			}
		},
		flags: {
			...nextActor.flags,
			sw5e: {
				...nextActor.flags.sw5e,
				[VGH_PROVENANCE_FLAG]: buildActorProvenance(provenance)
			}
		}
	};
}

export function validateActorPublicationSource(actor) {
	const failures = [];
	const visibleSource = actor?.system?.source?.custom;
	const legacyVisibleSource = actor?.system?.details?.source?.custom;
	if ( visibleSource !== SOURCE_VISIBLE && legacyVisibleSource !== SOURCE_VISIBLE ) {
		failures.push(`visible source must equal ${JSON.stringify(SOURCE_VISIBLE)}`);
	}
	const internal = actor?.flags?.sw5e?.[VGH_PROVENANCE_FLAG];
	if ( !internal ) failures.push(`missing flags.sw5e.${VGH_PROVENANCE_FLAG}`);
	for ( const key of REQUIRED_PROVENANCE_KEYS ) {
		if ( !internal?.[key] ) failures.push(`missing provenance field ${key}`);
	}
	if ( internal?.sourceIdentity && internal.sourceIdentity !== SOURCE_IDENTITY ) {
		failures.push(`sourceIdentity must equal ${JSON.stringify(SOURCE_IDENTITY)}`);
	}
	if ( internal?.sourceFile && internal.sourceFile !== SOURCE_FILE ) {
		failures.push(`sourceFile must equal ${JSON.stringify(SOURCE_FILE)}`);
	}
	if ( internal?.trackedPack && internal.trackedPack !== PACK_NAME ) {
		failures.push(`trackedPack must equal ${JSON.stringify(PACK_NAME)}`);
	}
	if ( internal?.collectionId && internal.collectionId !== COLLECTION_ID ) {
		failures.push(`collectionId must equal ${JSON.stringify(COLLECTION_ID)}`);
	}
	return { ok: failures.length === 0, failures };
}

export function assertValidActorPublicationSource(actor) {
	const result = validateActorPublicationSource(actor);
	if ( !result.ok ) {
		throw new Error(`[veshs-galactic-holodex] invalid actor publication source: ${result.failures.join("; ")}`);
	}
	return actor;
}
