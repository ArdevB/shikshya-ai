import { extname } from 'node:path';

/** ZIP's first bytes. DOCX and PPTX are ZIP files with a known layout inside. */
const ZIP = [0x50, 0x4b, 0x03, 0x04];

interface FileType {
  mimeType: string;
  signature: number[];
}

const FILE_TYPES: Record<string, FileType> = {
  pdf: { mimeType: 'application/pdf', signature: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // %PDF-
  zip: { mimeType: 'application/zip', signature: ZIP },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    signature: ZIP,
  },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    signature: ZIP,
  },
  jpg: { mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  jpeg: { mimeType: 'image/jpeg', signature: [0xff, 0xd8, 0xff] },
  png: { mimeType: 'image/png', signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

const startsWith = (buffer: Buffer, signature: number[]) =>
  buffer.length >= signature.length && signature.every((byte, index) => buffer[index] === byte);

/**
 * The file type its first bytes actually show, as long as that agrees with its extension.
 * The name and the browser's stated type are both chosen by the uploader, so neither proves
 * anything: this stops a program renamed to notes.pdf. The result replaces the browser's type.
 */
export function detectFileType(buffer: Buffer, fileName: string): string | null {
  const type = FILE_TYPES[extname(fileName).slice(1).toLowerCase()];
  return type && startsWith(buffer, type.signature) ? type.mimeType : null;
}

/** Text with no zero bytes and valid UTF-8. A binary file renamed to .csv fails this. */
export function looksLikeText(buffer: Buffer) {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Only for showing a file's name. Files are stored under a random id, so this never reaches a path.
 * Windows paths and control characters are removed, along with anything before the last slash.
 */
export function displayName(fileName: string) {
  const base = fileName.split(/[/\\]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this removes
  return base.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 255) || 'file';
}
