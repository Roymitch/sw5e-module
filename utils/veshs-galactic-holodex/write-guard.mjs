import path from "node:path";
import {
	COMMITTED_PACK_SOURCE,
	COMPILED_PACK_PATH,
	ROOT,
	SANDBOX_AUDIT,
	SANDBOX_PROTOTYPE
} from "./paths.mjs";

const ALLOWED_PREFIXES = Object.freeze([
	path.resolve(SANDBOX_PROTOTYPE),
	path.resolve(SANDBOX_AUDIT)
]);

const FORBIDDEN_PREFIXES = Object.freeze([
	path.resolve(ROOT, "packs/_source"),
	path.resolve(ROOT, "packs/monsters"),
	path.resolve(ROOT, "packs/snv-monsters"),
	path.resolve(ROOT, "packs/_source/snv-monsters"),
	path.resolve(ROOT, "packs/_source/monsters"),
	path.resolve(COMPILED_PACK_PATH),
	path.resolve(COMMITTED_PACK_SOURCE)
]);

export const PRODUCTION_BATCH_DESCRIPTORS = Object.freeze({});

function resolvePath(targetPath) {
	return path.isAbsolute(targetPath) ? path.resolve(targetPath) : path.resolve(ROOT, targetPath);
}

function isWithinPrefix(targetPath, prefix) {
	return targetPath === prefix || targetPath.startsWith(`${prefix}${path.sep}`);
}

export function toRepoRelative(targetPath) {
	return path.relative(ROOT, resolvePath(targetPath)).split(path.sep).join("/");
}

export function getProductionBatchDescriptor(batch) {
	const descriptor = PRODUCTION_BATCH_DESCRIPTORS[batch];
	if ( !descriptor ) {
		throw new Error(`[veshs-galactic-holodex] unknown production batch: ${batch}`);
	}
	return descriptor;
}

export function getAllowedTrackedRelativePaths(batch) {
	return [...getProductionBatchDescriptor(batch).allowedTrackedRelativePaths];
}

export function isCommittedPackPath(targetPath) {
	const resolved = resolvePath(targetPath);
	return isWithinPrefix(resolved, path.resolve(COMMITTED_PACK_SOURCE))
		|| isWithinPrefix(resolved, path.resolve(COMPILED_PACK_PATH));
}

export function assertAllowedOutputRoot(outputRoot, options = {}) {
	const resolved = resolvePath(outputRoot);
	if ( ALLOWED_PREFIXES.some(prefix => isWithinPrefix(resolved, prefix)) ) return resolved;

	if ( options.allowProductionWrite === true ) {
		const descriptor = getProductionBatchDescriptor(options.batch);
		if ( resolved === path.resolve(descriptor.productionRoot) ) return resolved;
		throw new Error(`[veshs-galactic-holodex] production batch ${options.batch} cannot write to ${toRepoRelative(resolved)}`);
	}

	if ( FORBIDDEN_PREFIXES.some(prefix => isWithinPrefix(resolved, prefix)) ) {
		throw new Error(`[veshs-galactic-holodex] refused output root: ${toRepoRelative(resolved)}`);
	}

	throw new Error(`[veshs-galactic-holodex] output root is not allowlisted: ${toRepoRelative(resolved)}`);
}

export function assertApprovedProductionYamlPath(filePath, batch) {
	const descriptor = getProductionBatchDescriptor(batch);
	const relativePath = toRepoRelative(filePath);
	if ( !descriptor.approvedYamlRelativePaths.includes(relativePath) ) {
		throw new Error(`[veshs-galactic-holodex] YAML path not approved for ${batch}: ${relativePath}`);
	}
	return relativePath;
}
