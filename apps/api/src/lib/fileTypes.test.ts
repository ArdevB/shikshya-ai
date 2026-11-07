import { describe, expect, it } from 'vitest';
import { detectFileType, displayName, looksLikeText } from './fileTypes.js';

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

describe('detectFileType', () => {
  it.each([
    ['notes.pdf', Buffer.from('%PDF-1.7'), 'application/pdf'],
    ['NOTES.PDF', Buffer.from('%PDF-1.7'), 'application/pdf'],
    ['photo.png', png, 'image/png'],
    ['photo.jpg', jpeg, 'image/jpeg'],
    ['photo.jpeg', jpeg, 'image/jpeg'],
    ['work.zip', zip, 'application/zip'],
  ])('recognises %s', (name, bytes, type) => {
    expect(detectFileType(bytes, name)).toBe(type);
  });

  it('recognises Office files, which are ZIP files inside', () => {
    expect(detectFileType(zip, 'essay.docx')).toContain('wordprocessingml');
    expect(detectFileType(zip, 'slides.pptx')).toContain('presentationml');
  });

  it.each([
    ['a program named as a PDF', Buffer.from('MZ...'), 'notes.pdf'],
    ['a web page named as a picture', Buffer.from('<script>alert(1)</script>'), 'photo.png'],
    ['a PDF named as a picture', Buffer.from('%PDF-1.7'), 'photo.png'],
    ['an empty file', Buffer.alloc(0), 'notes.pdf'],
    ['a file too short to hold the signature', Buffer.from('%P'), 'notes.pdf'],
    ['an extension not on the list', Buffer.from('%PDF-1.7'), 'notes.exe'],
    ['no extension at all', Buffer.from('%PDF-1.7'), 'notes'],
  ])('refuses %s', (_name, bytes, fileName) => {
    expect(detectFileType(bytes, fileName)).toBeNull();
  });
});

describe('looksLikeText', () => {
  it('accepts plain text, including Nepali', () => {
    expect(looksLikeText(Buffer.from('name,roll\nसीता,12\n'))).toBe(true);
  });

  it('refuses binary files and text that is not valid UTF-8', () => {
    expect(looksLikeText(Buffer.from([0x4d, 0x5a, 0x00]))).toBe(false);
    expect(looksLikeText(Buffer.from([0xc3, 0x28]))).toBe(false);
  });
});

describe('displayName', () => {
  it.each([
    ['report.pdf', 'report.pdf'],
    ['../../etc/passwd.pdf', 'passwd.pdf'],
    ['C:\\Users\\me\\report.pdf', 'report.pdf'],
    ['bad\r\nname.pdf', 'badname.pdf'],
    ['', 'file'],
  ])('turns %j into %j', (input, output) => {
    expect(displayName(input)).toBe(output);
  });
});
