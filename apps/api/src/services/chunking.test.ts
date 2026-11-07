import { describe, expect, it } from 'vitest';
import { chunkText, CHUNK_CHARACTERS, OVERLAP_CHARACTERS } from './chunking.js';

const sentences = (count: number) =>
  Array.from({ length: count }, (_, i) => `Rule number ${i} says something clear.`).join(' ');

describe('chunkText', () => {
  it('keeps a short document whole', () => {
    expect(chunkText('Attendance must be 75%.')).toEqual(['Attendance must be 75%.']);
  });

  it('gives nothing for an empty document', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('  \n  ')).toEqual([]);
  });

  it('never makes a chunk longer than the limit', () => {
    const chunks = chunkText(sentences(1000));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_CHARACTERS);
  });

  it('loses no text, and overlaps so a rule across a boundary stays readable', () => {
    const text = sentences(1000);
    const chunks = chunkText(text);
    for (let i = 1000 - 1; i >= 0; i -= 97) {
      const rule = `Rule number ${i} says`;
      expect(chunks.some((chunk) => chunk.includes(rule))).toBe(true);
    }
    for (let i = 1; i < chunks.length; i += 1) {
      const tail = chunks[i - 1]!.slice(-Math.floor(OVERLAP_CHARACTERS / 4));
      expect(chunks[i]!.includes(tail)).toBe(true);
    }
  });

  it('breaks at a paragraph or sentence, not in the middle of a word', () => {
    const chunks = chunkText(sentences(1000));
    for (const chunk of chunks.slice(0, -1)) expect(chunk.endsWith('.')).toBe(true);
  });

  it('copes with one very long word', () => {
    const chunks = chunkText('x'.repeat(10000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= CHUNK_CHARACTERS)).toBe(true);
  });

  it('always finishes, even when overlap is close to the chunk size', () => {
    expect(chunkText(sentences(50), 100, 95).length).toBeGreaterThan(1);
  });
});
