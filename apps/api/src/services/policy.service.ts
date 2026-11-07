import type { PolicyDocumentBody, PolicyDocumentView, StoredFile } from '@shikshya/shared';
import { extractDocumentText } from '../lib/aiService.js';
import { logAiCall } from '../lib/aiLog.js';
import { badRequest, notFound } from '../lib/errors.js';
import { getLlm } from '../lib/llm.js';
import { prisma } from '../lib/prisma.js';
import { storage } from '../lib/storage.js';
import type { CurrentUser } from '../middleware/auth.js';
import { chunkText } from './chunking.js';

const PASSAGES = 4;

let vectorColumn: boolean | undefined;

/** The embedding column only exists where pgvector does, which is not the test database. */
async function hasVectorColumn(): Promise<boolean> {
  if (vectorColumn === undefined) {
    const rows = await prisma.$queryRaw<{ found: number }[]>`
      SELECT 1 AS found FROM information_schema.columns
      WHERE table_name = 'PolicyChunk' AND column_name = 'embedding'`;
    vectorColumn = rows.length > 0;
  }
  return vectorColumn;
}

const toVectorLiteral = (values: number[]) => `[${values.join(',')}]`;

/**
 * Gives chunks with no embedding one, so they can be found by meaning. Chunks that fail stay
 * searchable by keyword, and the next re-index tries them again.
 */
async function embedMissingChunks(userId: string, documentId?: string) {
  const llm = getLlm();
  if (!llm || !(await hasVectorColumn())) return 0;

  const chunks = documentId
    ? await prisma.$queryRaw<{ id: string; content: string }[]>`
        SELECT id, content FROM "PolicyChunk"
        WHERE embedding IS NULL AND "documentId" = ${documentId}`
    : await prisma.$queryRaw<{ id: string; content: string }[]>`
        SELECT id, content FROM "PolicyChunk" WHERE embedding IS NULL`;
  if (chunks.length === 0) return 0;

  const started = Date.now();
  try {
    const vectors = await llm.embed(
      chunks.map((chunk) => chunk.content),
      'document',
    );
    for (const [index, chunk] of chunks.entries()) {
      await prisma.$executeRaw`
        UPDATE "PolicyChunk" SET embedding = ${toVectorLiteral(vectors[index]!)}::vector
        WHERE id = ${chunk.id}`;
    }
    await logAiCall({
      userId,
      feature: 'EMBEDDING',
      model: llm.embeddingModel,
      latencyMs: Date.now() - started,
      succeeded: true,
    });
    return chunks.length;
  } catch (error) {
    console.error('Could not embed policy chunks', error);
    await logAiCall({
      userId,
      feature: 'EMBEDDING',
      model: llm.embeddingModel,
      latencyMs: Date.now() - started,
      succeeded: false,
      errorCode: 'EMBED_FAILED',
    });
    return 0;
  }
}

async function toViews(ids?: string[]): Promise<PolicyDocumentView[]> {
  const documents = await prisma.policyDocument.findMany({
    where: ids ? { id: { in: ids } } : undefined,
    include: {
      uploadedBy: { select: { firstName: true, lastName: true } },
      _count: { select: { chunks: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const embedded = new Map<string, number>();
  if (await hasVectorColumn()) {
    const rows = await prisma.$queryRaw<{ documentId: string; count: number }[]>`
      SELECT "documentId", COUNT(*)::int AS count FROM "PolicyChunk"
      WHERE embedding IS NOT NULL GROUP BY "documentId"`;
    for (const row of rows) embedded.set(row.documentId, row.count);
  }

  return documents.map((document) => ({
    id: document.id,
    title: document.title,
    fileName: (document.file as unknown as StoredFile).name,
    chunks: document._count.chunks,
    embeddedChunks: embedded.get(document.id) ?? 0,
    uploadedBy: `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`,
    createdAt: document.createdAt.toISOString(),
  }));
}

export const listPolicies = () => toViews();

export async function uploadPolicy(
  user: CurrentUser,
  body: PolicyDocumentBody,
  file: Express.Multer.File | undefined,
) {
  if (!file) throw badRequest('Please choose a file');

  // Read it first, so a file with no text is refused rather than stored and useless.
  const text = await extractDocumentText(file.buffer, file.originalname);
  const chunks = chunkText(text);
  if (chunks.length === 0) throw badRequest('No text found in this file.');

  const stored = await storage.save(file);
  const document = await prisma.policyDocument.create({
    data: {
      title: body.title,
      file: stored as unknown as object,
      uploadedById: user.id,
      chunks: { create: chunks.map((content, position) => ({ content, position })) },
    },
  });
  await embedMissingChunks(user.id, document.id);
  return (await toViews([document.id]))[0]!;
}

export async function deletePolicy(id: string) {
  const document = await prisma.policyDocument.findUnique({ where: { id } });
  if (!document) throw notFound('Document');
  await prisma.policyDocument.delete({ where: { id } });
  await storage.remove(document.file as unknown as StoredFile);
}

/** Embeds anything still missing, for example documents uploaded before a key was set. */
export async function reindexPolicies(user: CurrentUser) {
  return { embedded: await embedMissingChunks(user.id) };
}

export interface PolicyPassage {
  document: string;
  text: string;
}

/** Finds passages by keyword. Used when meaning-based search is not available or finds nothing. */
async function keywordSearch(query: string): Promise<PolicyPassage[]> {
  // "or" between words, so a question finds passages that use only some of its words.
  const terms = query
    .replace(/["']/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .join(' or ');
  if (!terms) return [];
  return prisma.$queryRaw<PolicyPassage[]>`
    SELECT d.title AS document, c.content AS text
    FROM "PolicyChunk" c JOIN "PolicyDocument" d ON d.id = c."documentId"
    WHERE to_tsvector('english', c.content) @@ websearch_to_tsquery('english', ${terms})
    ORDER BY ts_rank(to_tsvector('english', c.content), websearch_to_tsquery('english', ${terms})) DESC
    LIMIT ${PASSAGES}`;
}

/** The passages that best answer a question. Only rules the college uploaded, for any role. */
export async function searchPolicies(query: string, userId: string): Promise<PolicyPassage[]> {
  const llm = getLlm();
  if (llm && (await hasVectorColumn())) {
    const started = Date.now();
    try {
      const [vector] = await llm.embed([query], 'query');
      await logAiCall({
        userId,
        feature: 'EMBEDDING',
        model: llm.embeddingModel,
        latencyMs: Date.now() - started,
        succeeded: true,
      });
      const literal = toVectorLiteral(vector!);
      // <=> is pgvector's cosine distance. Smaller is closer.
      const rows = await prisma.$queryRaw<PolicyPassage[]>`
        SELECT d.title AS document, c.content AS text
        FROM "PolicyChunk" c JOIN "PolicyDocument" d ON d.id = c."documentId"
        WHERE c.embedding IS NOT NULL
        ORDER BY c.embedding <=> ${literal}::vector
        LIMIT ${PASSAGES}`;
      if (rows.length > 0) return rows;
    } catch (error) {
      console.error('Meaning-based search failed, falling back to keywords', error);
      await logAiCall({
        userId,
        feature: 'EMBEDDING',
        model: llm.embeddingModel,
        latencyMs: Date.now() - started,
        succeeded: false,
        errorCode: 'EMBED_FAILED',
      });
    }
  }
  return keywordSearch(query);
}
