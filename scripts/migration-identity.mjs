/**
 * Bounded SW5E migration identity and missing-system diagnostics.
 * Does not invent system or advancement data. Does not log private campaign text.
 */

export const SOURCE_CONTEXT = Object.freeze({
	WORLD_ITEM: "world-item",
	ACTOR_EMBEDDED_ITEM: "actor-embedded-item",
	SCENE_ACTOR_DELTA_ITEM: "scene-actor-delta-item",
	COMPENDIUM_ITEM: "compendium-item",
	COMPENDIUM_ACTOR_ITEM: "compendium-actor-item",
	COMPENDIUM_SCENE_DELTA_ITEM: "compendium-scene-delta-item"
});

export const MISSING_SYSTEM_CLASS = Object.freeze({
	LEGACY_SPARSE_DELTA: "legacy-or-nonstandard-sparse-source",
	FULL_ITEM_OMISSION: "legacy-or-malformed-full-source-omission"
});

const SCENE_DELTA_CONTEXTS = new Set([
	SOURCE_CONTEXT.SCENE_ACTOR_DELTA_ITEM,
	SOURCE_CONTEXT.COMPENDIUM_SCENE_DELTA_ITEM
]);

/**
 * @param {object} [itemData]
 * @returns {{ hasSystem: boolean, hasAdvancementParent: boolean, advancementDefined: boolean }}
 */
export function describeItemSystemShape(itemData) {
	const system = itemData?.system;
	const hasSystem = system !== undefined && system !== null && typeof system === "object";
	const advancementDefined = hasSystem && system.advancement !== undefined;
	return {
		hasSystem,
		hasAdvancementParent: hasSystem,
		advancementDefined
	};
}

/**
 * @param {unknown} advancement
 * @returns {{ form: "absent"|"array"|"object"|"malformed", entries: object[]|null }}
 */
export function getAdvancementEntries(advancement) {
	if ( advancement === undefined || advancement === null ) {
		return { form: "absent", entries: null };
	}
	if ( Array.isArray(advancement) ) {
		return { form: "array", entries: advancement };
	}
	if ( typeof advancement === "object" ) {
		return { form: "object", entries: Object.values(advancement) };
	}
	return { form: "malformed", entries: null };
}

export function isSceneActorDeltaContext(sourceContext) {
	return SCENE_DELTA_CONTEXTS.has(sourceContext);
}

export function classifyMissingSystem(sourceContext) {
	if ( isSceneActorDeltaContext(sourceContext) ) return MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA;
	return MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION;
}

export function createDiagnosticDedupe() {
	return new Map();
}

/**
 * @param {object} [context]
 * @param {object} [itemData]
 * @param {object} [shape]
 * @returns {object}
 */
export function buildBoundedIdentity(context={}, itemData={}, shape=null) {
	const resolvedShape = shape ?? describeItemSystemShape(itemData);
	return {
		phase: context.phase ?? null,
		sourceContext: context.sourceContext ?? null,
		packId: context.packId ?? null,
		documentType: context.documentType ?? "Item",
		documentId: context.documentId ?? itemData?._id ?? itemData?.id ?? null,
		documentName: context.documentName ?? itemData?.name ?? null,
		parentDocumentId: context.parentDocumentId ?? context.actorId ?? context.sceneId ?? null,
		sceneId: context.sceneId ?? null,
		tokenId: context.tokenId ?? null,
		actorLink: context.actorLink ?? null,
		actorId: context.actorId ?? null,
		actorDeltaPresent: context.actorDeltaPresent ?? null,
		itemId: context.itemId ?? itemData?._id ?? itemData?.id ?? null,
		itemType: context.itemType ?? itemData?.type ?? null,
		hasSystem: resolvedShape.hasSystem,
		hasAdvancementParent: resolvedShape.hasAdvancementParent,
		advancementDefined: resolvedShape.advancementDefined
	};
}

function missingSystemDedupeKey(classification, context, itemData) {
	return [
		classification,
		context?.sourceContext ?? "unknown",
		context?.packId ?? "world",
		itemData?.type ?? "unknown"
	].join("|");
}

/**
 * Emit one bounded diagnostic per legacy shape. Does not throw.
 * @param {object} [run]
 * @param {object} [context]
 * @param {object} [itemData]
 * @param {object} [shape]
 * @returns {object}
 */
export function emitMissingSystemDiagnostic(run, context, itemData, shape) {
	const classification = classifyMissingSystem(context?.sourceContext);
	const severity = classification === MISSING_SYSTEM_CLASS.FULL_ITEM_OMISSION ? "error" : "warn";
	const identity = buildBoundedIdentity(context, itemData, shape);
	const key = missingSystemDedupeKey(classification, context, itemData);
	const dedupe = run?.diagnostics ?? createDiagnosticDedupe();
	if ( run && !run.diagnostics ) run.diagnostics = dedupe;
	const prior = dedupe.get(key);
	if ( prior ) {
		prior.count += 1;
		return { emitted: false, duplicate: true, severity, classification, identity, count: prior.count };
	}
	const record = {
		classification,
		severity,
		identity,
		count: 1,
		note: classification === MISSING_SYSTEM_CLASS.LEGACY_SPARSE_DELTA
			? "Safely preserved legacy or nonstandard sparse source. Advancement migration is not applicable without system."
			: "Full Item source omitted system. Source preserved unchanged. Advancement migration is not applicable."
	};
	dedupe.set(key, record);
	const logger = severity === "error" ? console.error : console.warn;
	logger("SW5E MODULE | Missing item.system during advancement migration", record);
	if ( Array.isArray(run?.missingSystemDiagnostics) ) run.missingSystemDiagnostics.push(record);
	return { emitted: true, duplicate: false, severity, classification, identity, count: 1 };
}

function createEmptyMigrationSummary() {
	return {
		documentsAttempted: 0,
		documentsUpdated: 0,
		documentsUnchanged: 0,
		expectedLegacyNoOps: 0,
		documentFailures: 0,
		packsAttempted: 0,
		packFailures: 0,
		artworkInvariantSkips: 0,
		completionState: "pending"
	};
}

export function createMigrationRunState() {
	return {
		phase: "collect-world",
		identity: {},
		packLedger: [],
		diagnostics: createDiagnosticDedupe(),
		missingSystemDiagnostics: [],
		sw5eWritesBegun: false,
		sw5eWritesCompleted: false,
		foundryPackMigrateCompleted: [],
		summary: createEmptyMigrationSummary(),
		documentFailures: [],
		documentFailureKeys: new Set()
	};
}

function documentFailureDedupeKey(record) {
	return [
		record.phase ?? "",
		record.sourceContext ?? "",
		record.packId ?? "",
		record.documentType ?? "",
		record.documentId ?? "",
		record.originalMessage ?? ""
	].join("|");
}

/**
 * Record a recoverable document-level migration failure. Does not throw.
 * Preserves the original error and stack. Deduplicates repeated copies.
 * @param {object} run
 * @param {Error|unknown} err
 * @param {object} [identity]
 * @returns {object}
 */
export function recordDocumentFailure(run, err, identity={}) {
	const original = err?.originalError ?? err?.cause ?? err;
	const record = {
		phase: identity.phase ?? run?.phase ?? null,
		sourceContext: identity.sourceContext ?? null,
		packId: identity.packId ?? identity.collectionId ?? null,
		collectionId: identity.collectionId ?? identity.packId ?? null,
		documentType: identity.documentType ?? null,
		documentId: identity.documentId ?? identity.itemId ?? identity.actorId ?? identity.sceneId ?? null,
		documentName: identity.documentName ?? null,
		parentDocumentId: identity.parentDocumentId ?? identity.actorId ?? identity.sceneId ?? null,
		sceneId: identity.sceneId ?? null,
		tokenId: identity.tokenId ?? null,
		actorId: identity.actorId ?? null,
		itemId: identity.itemId ?? null,
		originalError: original instanceof Error ? original : null,
		originalMessage: original?.message ?? String(err),
		originalStack: original?.stack ?? err?.stack ?? null,
		count: 1
	};
	if ( !run ) {
		console.error("SW5E MODULE | Document migration failed", record);
		return record;
	}
	if ( !Array.isArray(run.documentFailures) ) run.documentFailures = [];
	if ( !(run.documentFailureKeys instanceof Set) ) run.documentFailureKeys = new Set();
	if ( !run.summary ) run.summary = createEmptyMigrationSummary();
	const key = documentFailureDedupeKey(record);
	if ( run.documentFailureKeys.has(key) ) {
		const prior = run.documentFailures.find(row => documentFailureDedupeKey(row) === key);
		if ( prior ) prior.count += 1;
		run.summary.documentFailures = run.documentFailures.length;
		return prior ?? record;
	}
	run.documentFailureKeys.add(key);
	run.documentFailures.push(record);
	run.summary.documentFailures = run.documentFailures.length;
	console.error("SW5E MODULE | Document migration failed", record);
	return record;
}

/**
 * @param {object} run
 * @param {object} entry
 */
export function upsertPackLedger(run, entry) {
	if ( !run ) return entry;
	const existing = run.packLedger.find(row => row.packId === entry.packId);
	if ( existing ) {
		Object.assign(existing, entry);
		return existing;
	}
	run.packLedger.push(entry);
	return entry;
}
