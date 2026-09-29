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
import { db } from '@/lib/db';
import {
  embeddings,
  resources,
} from '@/lib/db/schema/resources';

const embeddingModel = openai.embedding('text-embedding-3-small');
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
): Promise<number[]> => {
  const input = value.replaceAll('\n', ' ');

  const { embedding } = await embed({
    model: embeddingModel,
    value: input,
  });

  return embedding;
};

export const findRelevantContent = async (
  userQuery: string,
) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);

  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const relevantChunks = await db
    .select({
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
    .orderBy(desc(similarity))
    .limit(4);

  if (relevantChunks.length === 0) {
    return {
      results: [],
      message:
        'No relevant information was found in the knowledge base.',
    };
  }

  return {
    results: relevantChunks.map(chunk => ({
      resourceId: chunk.resourceId,
      fileName: chunk.fileName,
      section: chunk.section,
      content: chunk.content,
      similarity: Number(chunk.similarity),
    })),
  };
};
