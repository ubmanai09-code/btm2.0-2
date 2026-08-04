/**
 * protobufSchemaGuard.test.ts
 *
 * Validates the security guard for protobuf schema loading.
 * Run with: npx tsx src/security/protobufSchemaGuard.test.ts
 */

import {
  assertTrustedSchemaSource,
  loadTrustedDescriptor,
} from "./protobufSchemaGuard.js";

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e: unknown) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${e instanceof Error ? e.message : String(e)}`);
    failed++;
  }
}

function assertThrows(fn: () => void, expectedMsg?: string) {
  try {
    fn();
    throw new Error("Expected an error to be thrown but none was");
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "Expected an error to be thrown but none was") {
      throw e;
    }
    if (expectedMsg && e instanceof Error && !e.message.includes(expectedMsg)) {
      throw new Error(
        `Expected error containing "${expectedMsg}" but got: "${e instanceof Error ? e.message : String(e)}"`
      );
    }
  }
}

console.log("\nprotobufSchemaGuard security tests\n");

test("allows trusted source: internal-bundle", () => {
  assertTrustedSchemaSource("internal-bundle");
});

test("allows trusted source: build-time-generated", () => {
  assertTrustedSchemaSource("build-time-generated");
});

test("rejects untrusted source: user-upload", () => {
  assertThrows(
    () => assertTrustedSchemaSource("user-upload"),
    "Untrusted protobuf schema source rejected"
  );
});

test("rejects untrusted source: http-request", () => {
  assertThrows(
    () => assertTrustedSchemaSource("http-request"),
    "Untrusted protobuf schema source rejected"
  );
});

test("rejects empty string source", () => {
  assertThrows(
    () => assertTrustedSchemaSource(""),
    "Untrusted protobuf schema source rejected"
  );
});

test("loadTrustedDescriptor returns descriptor for trusted source", () => {
  const descriptor = { nested: { MyMessage: { fields: {} } } };
  const result = loadTrustedDescriptor(descriptor, "internal-bundle");
  if (result !== descriptor) {
    throw new Error("Expected returned descriptor to be the same object");
  }
});

test("loadTrustedDescriptor rejects untrusted source", () => {
  assertThrows(
    () => loadTrustedDescriptor({ fields: {} }, "external-api"),
    "Untrusted protobuf schema source rejected"
  );
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
