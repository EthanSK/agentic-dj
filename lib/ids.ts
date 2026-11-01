// Stable local identifiers shared by tracks, crates, sessions and request IDs.
// Both the command validator (`lib/domain.ts`) and the stored-session
// validator (`lib/sessions.ts`) use this one rule, without importing each other.

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/;
// Saved state uses plain objects keyed by these IDs, so prototype names are
// refused everywhere rather than only where a lookup happens to be unsafe.
const BLOCKED_IDS = new Set(['constructor', 'prototype', '__proto__']);

export function isSafeId(value: unknown): value is string {
  return (
    typeof value === 'string' && SAFE_ID.test(value) && !BLOCKED_IDS.has(value)
  );
}
