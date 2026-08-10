/**
 * Fail closed when a generated numeric value is nonfinite.
 * @param {unknown} value
 * @param {string} valuePath
 * @param {object} [context]
 */
export function assertFiniteNumber(value, valuePath, context = {}) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	const detail = Object.entries(context).map(([key, entry]) => `${key}=${JSON.stringify(entry)}`).join(" ");
	throw new Error(`[veshs-galactic-holodex] nonfinite numeric at ${valuePath}${detail ? ` (${detail})` : ""}: ${String(value)}`);
}

/**
 * Fail closed when a formula string would evaluate with NaN / Infinity terms.
 * @param {string} formula
 * @param {string} valuePath
 * @param {object} [context]
 */
export function assertSafeFormula(formula, valuePath, context = {}) {
	const text = formula == null ? "" : String(formula);
	if (text === "") return text;
	if (/\bNaN\b/i.test(text) || /\bInfinity\b/i.test(text) || /\bundefined\b/i.test(text)) {
		const detail = Object.entries(context).map(([key, entry]) => `${key}=${JSON.stringify(entry)}`).join(" ");
		throw new Error(`[veshs-galactic-holodex] unsafe formula at ${valuePath}${detail ? ` (${detail})` : ""}: ${JSON.stringify(text)}`);
	}
	return text;
}
