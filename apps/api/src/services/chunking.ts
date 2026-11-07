/**
 * Splits a document into overlapping pieces for search. English averages about 4 characters to a
 * token, so 800 tokens with 100 of overlap is about 3200 and 400 characters. The overlap keeps a
 * rule that falls across a boundary readable in at least one piece.
 */
export const CHUNK_CHARACTERS = 3200;
export const OVERLAP_CHARACTERS = 400;

/** Where to end a chunk: a paragraph break if there is one nearby, or else a sentence or space. */
function findBreak(text: string, start: number, limit: number): number {
  if (limit >= text.length) return text.length;
  // Never so early that the chunk is mostly overlap.
  const earliest = start + Math.floor((limit - start) * 0.6);
  const window = text.slice(earliest, limit);
  for (const separator of ['\n\n', '. ', '\n', ' ']) {
    const at = window.lastIndexOf(separator);
    if (at !== -1) return earliest + at + separator.length;
  }
  return limit;
}

export function chunkText(
  text: string,
  size = CHUNK_CHARACTERS,
  overlap = OVERLAP_CHARACTERS,
): string[] {
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = findBreak(clean, start, start + size);
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    // Always moves forward, however the breaks fall.
    start = Math.max(end - overlap, start + 1);
  }
  return chunks.filter(Boolean);
}
