/**
 * protobufSchemaGuard.ts
 *
 * Centralized guard for protobuf schema/descriptor loading.
 *
 * Security context:
 *   protobufjs can execute JavaScript derived from schema metadata when loading
 *   crafted JSON descriptors (via Root.fromJSON, load, loadSync, etc.).
 *   This module ensures only trusted, application-bundled schemas are loaded.
 *
 * Usage:
 *   import { loadTrustedDescriptor, assertTrustedSchemaSource } from './security/protobufSchemaGuard';
 */

/** The set of source identifiers considered trusted (bundle-time, internal). */
const TRUSTED_SOURCES = new Set(["internal-bundle", "build-time-generated"]);

/**
 * Assert that a schema source identifier is trusted.
 * Throws if the source is not in the trusted allowlist.
 */
export function assertTrustedSchemaSource(source: string): void {
  if (!TRUSTED_SOURCES.has(source)) {
    throw new Error(
      `Untrusted protobuf schema source rejected: "${source}". ` +
        `Only internal, application-bundled schemas may be loaded.`
    );
  }
}

export type JsonDescriptor = Record<string, unknown>;

/**
 * Load a protobuf JSON descriptor only from trusted sources.
 *
 * @param descriptor - The JSON descriptor object to load.
 * @param source     - A trusted source identifier (must be in TRUSTED_SOURCES).
 * @returns The validated descriptor (ready for protobuf.Root.fromJSON).
 */
export function loadTrustedDescriptor(
  descriptor: JsonDescriptor,
  source: string
): JsonDescriptor {
  assertTrustedSchemaSource(source);
  return descriptor;
}
