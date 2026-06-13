/**
 * Normalize the parsed output of `npm/pnpm info <pkg> --json`.
 *
 * npm 12+ wraps the result in a single-element JSON array
 * (e.g. `[{ "name": "verdaccio", ... }]`) for both full-packument and
 * version-specific queries, whereas older npm versions return a bare object.
 * When multiple results match a range, the array holds one entry per match;
 * the last entry is the highest (latest) version, which is what the tests want.
 *
 * Returns the bare object as-is for backward compatibility.
 */
export function normalizeInfo(parsed: any): any {
  if (Array.isArray(parsed)) {
    return parsed[parsed.length - 1];
  }
  return parsed;
}

/** Parse `info --json` stdout and normalize to a single info object. */
export function parseInfoJson(stdout: string): any {
  return normalizeInfo(JSON.parse(stdout));
}
