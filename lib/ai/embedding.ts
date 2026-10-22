import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  sql,
} from 'drizzle-orm';

import {
  chunkDocument,
  SupportedFileType,
} from '@/lib/ai/chunking';
import { rerankCandidates } from '@/lib/ai/reranking';
import { db } from '@/lib/db';
import {
  embeddings,
  resources,
} from '@/lib/db/schema/resources';
import type { UsageRecorder } from '@/lib/monitoring/usage';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const embeddingModel = openai.embedding(EMBEDDING_MODEL);
const MIN_SIMILARITY = 0.45;

export const generateEmbeddings = async (
  value: string,
  fileName = 'manual-entry.txt',
  fileType: SupportedFileType = 'txt',
): Promise<
  Array<{
    embedding: number[];
    content: string;
    chunkIndex: number;
    section: string | null;
  }>
> => {
  const chunks = chunkDocument(value, fileName, fileType);

  if (chunks.length === 0) {
    return [];
  }

  const { embeddings: embeddingVectors } = await embedMany({
    model: embeddingModel,
    values: chunks.map(chunk => chunk.content),
  });

  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddingVectors[index],
  }));
};

export const generateEmbedding = async (
  value: string,
  recordUsage?: UsageRecorder,
): Promise<number[]> => {
  const input = value.replaceAll('\n', ' ');
  const startedAt = performance.now();

  const { embedding, usage } = await embed({
    model: embeddingModel,
    value: input,
  });

  recordUsage?.({
    stage: 'embedding',
    model: EMBEDDING_MODEL,
    usage: {
      inputTokens: usage.tokens,
      outputTokens: 0,
    },
    durationMs: performance.now() - startedAt,
  });

  return embedding;
};

export const retrieveCandidates = async (
  userQuery: string,
  limit = 12,
  recordUsage?: UsageRecorder,
) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error(
      'Candidate limit must be an integer between 1 and 50.',
    );
  }

  const userQueryEmbedded = await generateEmbedding(
    userQuery,
    recordUsage,
  );

  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const chunks = await db
    .select({
      chunkId: embeddings.id,
      chunkIndex: embeddings.chunkIndex,
      resourceId: resources.id,
      fileName: resources.fileName,
      section: embeddings.section,
      content: embeddings.content,
      similarity,
    })
    .from(embeddings)
    .innerJoin(
      resources,
      eq(embeddings.resourceId, resources.id),
    )
    .where(
      and(
        eq(resources.status, 'processed'),
        gt(similarity, MIN_SIMILARITY),
      ),
    )
    .orderBy(desc(similarity), embeddings.id)
    .limit(limit);

  return chunks.map(chunk => ({
    ...chunk,
    similarity: Number(chunk.similarity),
  }));
};

export const findRelevantContent = async (
  userQuery: string,
  recordUsage?: UsageRecorder,
) => {
  const candidates = await retrieveCandidates(
    userQuery,
    12,
    recordUsage,
  );

  const reranked = await rerankCandidates(
    userQuery,
    candidates,
    4,
  );

  if (reranked.usage !== undefined) {
    recordUsage?.({
      stage: 'reranking',
      model: reranked.model,
      usage: reranked.usage,
      durationMs: reranked.durationMs,
    });
  }

  if (reranked.results.length === 0) {
    return {
      results: [],
      message:
        'No relevant information was found in the knowledge base.',
    };
  }

  return {
    results: reranked.results,
  };
};