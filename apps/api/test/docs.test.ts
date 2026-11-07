import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  API_FILE,
  apiReference,
  DATABASE_FILE,
  databaseReference,
} from '../scripts/docs-content.js';

const read = (file: string) => readFileSync(file, 'utf8').replaceAll('\r\n', '\n');

describe('generated documentation', () => {
  it('docs/api.md matches the routes. If not, run pnpm docs:generate', () => {
    expect(read(API_FILE)).toBe(apiReference());
  });

  it('docs/database.md matches the schema. If not, run pnpm docs:generate', () => {
    expect(read(DATABASE_FILE)).toBe(databaseReference());
  });

  it('files every route under a named area', () => {
    expect(apiReference()).not.toContain('## Other');
  });

  it('files every table under a named area', () => {
    expect(databaseReference()).not.toContain('## Other');
  });

  it('describes the fields of a request, not only its name', () => {
    const reference = apiReference();
    expect(reference).toContain('`invoiceId` text, `method` ESEWA \\| KHALTI');
    expect(reference).toContain('`email` text, `password` text');
  });
});
