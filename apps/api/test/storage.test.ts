import type { StoredFile } from '@shikshya/shared';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { S3Storage } from '../src/lib/storage.js';

/**
 * Runs the real AWS SDK against a small stand-in for an S3 service, so the requests it makes are
 * really sent and answered. A fake storage object would not show whether any of that works.
 */
const objects = new Map<string, { body: Buffer; type: string }>();
const seen: { method: string; url: string; authorization: string }[] = [];

const standIn: Server = createServer((req, res) => {
  const key = (req.url ?? '').split('?')[0] ?? '';
  seen.push({
    method: req.method ?? '',
    url: key,
    authorization: req.headers.authorization ?? '',
  });
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    const object = objects.get(key);
    if (req.method === 'PUT') {
      objects.set(key, {
        body: Buffer.concat(chunks),
        type: req.headers['content-type'] ?? '',
      });
      res.writeHead(200, { ETag: '"abc"' }).end();
    } else if (req.method === 'DELETE') {
      objects.delete(key);
      res.writeHead(204).end();
    } else if (!object) {
      res
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code><Message>Not there</Message></Error>');
    } else {
      res
        .writeHead(200, { 'Content-Type': object.type, 'Content-Length': object.body.length })
        .end(object.body);
    }
  });
});

let storage: S3Storage;

beforeAll(async () => {
  await new Promise<void>((ready) => standIn.listen(0, '127.0.0.1', ready));
  const { port } = standIn.address() as AddressInfo;
  storage = new S3Storage({
    bucket: 'uploads',
    region: 'auto',
    endpoint: `http://127.0.0.1:${port}`,
    accessKeyId: 'test-key',
    secretAccessKey: 'test-secret',
  });
});

afterAll(() => {
  standIn.close();
});

beforeEach(() => {
  objects.clear();
  seen.length = 0;
});

const upload = {
  buffer: Buffer.from('%PDF-1.4 the notes'),
  originalname: 'Week 1 Notes.PDF',
  mimetype: 'application/pdf',
};

/** A tiny app, so download behaviour can be seen the way a browser sees it. */
const download = (file: StoredFile) => {
  const app = express();
  app.get('/file', async (_req, res) => {
    await storage.send(file, res);
  });
  app.use(errorHandler);
  return request(app).get('/file');
};

describe('S3 storage', () => {
  it('saves under a random name in the bucket, signed with the credentials', async () => {
    const stored = await storage.save(upload);

    expect(stored.id).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(stored.name).toBe('Week 1 Notes.PDF');
    expect(stored.size).toBe(upload.buffer.length);
    expect(objects.get(`/uploads/${stored.id}`)?.body.toString()).toBe('%PDF-1.4 the notes');
    expect(seen[0]?.authorization).toContain('test-key');
    expect(seen[0]?.authorization).not.toContain('test-secret');
  });

  it('reads the bytes back', async () => {
    const stored = await storage.save(upload);
    expect((await storage.read(stored)).toString()).toBe('%PDF-1.4 the notes');
  });

  it('sends a file as a download, never as a page', async () => {
    const stored = await storage.save(upload);
    const response = await download(stored);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['content-disposition']).toContain('Week%201%20Notes.PDF');
  });

  it('gives a 404 for a file that is not there', async () => {
    const stored = await storage.save(upload);
    await storage.remove(stored);
    expect(objects.size).toBe(0);
    expect((await download(stored)).status).toBe(404);
    await expect(storage.read(stored)).rejects.toThrow(/not found/i);
  });

  it('cannot be pointed outside the bucket by a strange file id', async () => {
    const stored = await storage.save(upload);
    objects.set('/secret.txt', { body: Buffer.from('secret'), type: 'text/plain' });
    await expect(storage.read({ ...stored, id: '../secret.txt' })).rejects.toThrow(/not found/i);
    expect(seen.at(-1)?.url).toBe('/uploads/secret.txt');
  });
});
