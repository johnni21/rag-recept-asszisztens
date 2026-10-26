import { createHash } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { openai } from '@ai-sdk/openai';
import { embedMany } from 'ai';
import { z } from 'zod';

export const EVALUATION_EMBEDDING_MODEL =
  'text-embedding-3-small';

const DIMENSIONS = 1536;
const BATCH_SIZE = 32;

const vectorSchema = z.array(z.number().finite())
  .length(DIMENSIONS);

const cacheSchema = z.object({
  model: z.literal(EVALUATION_EMBEDDING_MODEL),
  textHash: z.string(),
  embedding: vectorSchema,
});

const hashText = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

export const embedTextsCached = async (texts: string[]) => {
  const startedAt = performance.now();

  const directory = join(
    'evaluation',
    'cache',
    EVALUATION_EMBEDDING_MODEL,
  );

  mkdirSync(directory, { recursive: true });

  const hashes = texts.map(hashText);
  const uniqueTexts = new Map(
    texts.map((text, index) => [hashes[index], text]),
  );

  const vectors = new Map<string, number[]>();
  const missing: Array<{ hash: string; text: string }> = [];

  for (const [hash, text] of uniqueTexts) {
    const path = join(directory, hash + '.json');

    if (existsSync(path)) {
      const cached = cacheSchema.parse(
        JSON.parse(readFileSync(path, 'utf8')),
      );

      if (cached.textHash !== hash) {
        throw new Error('Embedding cache hash mismatch: ' + path);
      }

      vectors.set(hash, cached.embedding);
    } else {
      missing.push({ hash, text });
    }
  }

  const cacheHits = hashes.filter(hash => vectors.has(hash)).length;
  let tokens = 0;
  let batches = 0;

  for (let offset = 0; offset < missing.length; offset += BATCH_SIZE) {
    const batch = missing.slice(offset, offset + BATCH_SIZE);

    const result = await embedMany({
      model: openai.embedding(EVALUATION_EMBEDDING_MODEL),
      values: batch.map(item => item.text),
      maxRetries: 0,
    });

    if (result.embeddings.length !== batch.length) {
      throw new Error('Unexpected number of embedding vectors.');
    }

    tokens += result.usage.tokens;
    batches += 1;

    appendFileSync(
      join(directory, 'usage.jsonl'),
      JSON.stringify({
        createdAt: new Date().toISOString(),
        model: EVALUATION_EMBEDDING_MODEL,
        texts: batch.length,
        tokens: result.usage.tokens,
      }) + '\n',
    );

    for (const [index, item] of batch.entries()) {
      const embedding = vectorSchema.parse(
        result.embeddings[index],
      );

      writeFileSync(
        join(directory, item.hash + '.json'),
        JSON.stringify({
          model: EVALUATION_EMBEDDING_MODEL,
          textHash: item.hash,
          embedding,
        }),
      );

      vectors.set(item.hash, embedding);
    }

    console.log(
      'Embeddingek elkészültek:',
      Math.min(offset + BATCH_SIZE, missing.length),
      '/',
      missing.length,
    );
  }

  return {
    embeddings: hashes.map(hash => {
      const vector = vectors.get(hash);

      if (vector === undefined) {
        throw new Error('Missing embedding: ' + hash);
      }

      return vector;
    }),
    usage: {
      tokens,
      batches,
      cacheHits,
      generatedUniqueTexts: missing.length,
    },
    durationMs: Math.round(performance.now() - startedAt),
  };
};
