import { openai } from '@ai-sdk/openai';
import { embed, embedMany } from 'ai';
import { cosineDistance, desc, gt, sql } from 'drizzle-orm';

import {
  chunkDocument,
  SupportedFileType,
} from '@/lib/ai/chunking';
import { db } from '@/lib/db';
import { embeddings } from '@/lib/db/schema/resources';

const embeddingModel = openai.embedding('text-embedding-3-small');

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

export const findRelevantContent = async (userQuery: string) => {
  const userQueryEmbedded = await generateEmbedding(userQuery);
  const similarity = sql<number>`1 - (${cosineDistance(
    embeddings.embedding,
    userQueryEmbedded,
  )})`;

  const similarGuides = await db
    .select({ content: embeddings.content, similarity })
    .from(embeddings)
    .where(gt(similarity, 0.3))
    .orderBy(t => desc(t.similarity))
    .limit(4);

  if (similarGuides.length === 0) {
    return 'No relevant information found in the knowledge base.';
  }

  return similarGuides.map(guide => guide.content).join('\n');
};