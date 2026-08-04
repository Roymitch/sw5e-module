/**
 * Phase N2 package entry — run tests / pipeline.
 */
export { parseMarkdownToIr, parseAuthoritativeSource } from "./parse.mjs";
export { generateSupportedSandbox } from "./generate.mjs";
export { loadIdentityMap } from "./identity.mjs";
export { assertAllowedOutputRoot } from "./write-guard.mjs";
