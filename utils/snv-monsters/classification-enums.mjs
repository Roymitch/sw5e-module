/**
 * Phase N2 classification enums and four-dimensional accounting.
 */
export const PARSE_STATUSES = [
	"parsed-valid",
	"parsed-with-warnings",
	"parser-failure",
	"intentionally-excluded"
];

export const CAPABILITY_STATUSES = [
	"fully-supported",
	"partially-supported",
	"unsupported",
	"manual-review-required",
	"capability-not-evaluated"
];

export const OUTPUT_SELECTION_STATUSES = [
	"selected-n1-parity",
	"selected-edge-case",
	"not-selected",
	"excluded"
];

export const PRODUCTION_READINESS_STATUSES = [
	"prototype-validated",
	"sandbox-only",
	"requires-runtime-validation",
	"requires-product-decision",
	"blocked",
	"not-assessed"
];

/** @deprecated legacy single-bucket labels retained only for migration notes */
export const LEGACY_GENERATOR_BUCKETS = [
	"generator-supported",
	"generator-partially-supported",
	"generator-unsupported",
	"manual-review-required",
	"parser-failure"
];
