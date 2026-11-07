/**
 * Writes docs/api.md and docs/database.md from the code: `pnpm docs:generate`.
 * test/docs.test.ts fails if either one no longer matches, so they cannot go quietly out of date.
 */
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { apiReference, API_FILE, DATABASE_FILE, databaseReference } from './docs-content.js';

export function writeDocs() {
  writeFileSync(API_FILE, apiReference());
  writeFileSync(DATABASE_FILE, databaseReference());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeDocs();
  console.log('Wrote docs/api.md and docs/database.md');
  process.exit(0);
}
