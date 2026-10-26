import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { cosineSimilarity } from 'ai';
import { z } from 'zod';

import { buildChunkingCorpus } from './chunking-corpus';
import {
  embedTextsCached,
  EVALUATION_EMBEDDING_MODEL,
} from './embedding-cache';
import { calculateRetrievalMetrics } from './retrieval-metrics';

const datasetSchema = z.array(
  z.object({
    id: z.string().min(1),
    question: z.string().min(1),
    searchQuery: z.string().min(1),
    relevantSources: z.array(
      z.object({
        fileName: z.string().min(1),
        section: z.string().min(1),
      }),
    ).min(1),
  }),
).min(20);

type Metrics = ReturnType<typeof calculateRetrievalMetrics>;

const K = 4;
const MIN_SIMILARITY = 0.45;

const saveJson = (path: string, value: unknown) => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};

const averageMetrics = (items: Metrics[]): Metrics => {
  const keys: Array<keyof Metrics> = [
    'precisionAtK',
    'recallAtK',
    'reciprocalRankAtK',
    'returnedPrecision',
    'returnedCount',
  ];

  const result = {} as Metrics;

  for (const key of keys) {
    result[key] =
      items.reduce((sum, item) => sum + item[key], 0) /
      items.length;
  }

  return result;
};

async function main() {
  const tests = datasetSchema.parse(
    JSON.parse(
      readFileSync('evaluation/datasets/retrieval.json', 'utf8'),
    ),
  );

  if (new Set(tests.map(test => test.id)).size !== tests.length) {
    throw new Error('Duplicate test IDs.');
  }

  const corpora = [1000, 500].map(buildChunkingCorpus);

  for (const corpus of corpora) {
    for (const test of tests) {
      for (const expected of test.relevantSources) {
        const exists = corpus.chunks.some(
          chunk =>
            chunk.fileName === expected.fileName &&
            chunk.section === expected.section,
        );

        if (exists === false) {
          throw new Error(
            'Missing expected source: ' +
              test.id + ', size=' + corpus.maxBodyLength,
          );
        }
      }
    }
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join('results', 'chunking', runId);

  mkdirSync(directory, { recursive: true });

  saveJson(join(directory, 'config.json'), {
    runId,
    embeddingModel: EVALUATION_EMBEDDING_MODEL,
    k: K,
    minSimilarity: MIN_SIMILARITY,
    reranking: false,
    search: 'in-memory exact cosine similarity',
    unit: 'unique fileName + section',
    dataset: tests,
    corpora: corpora.map(corpus => ({
      maxBodyLength: corpus.maxBodyLength,
      documentCount: corpus.documentCount,
      chunkCount: corpus.chunkCount,
      corpusHash: corpus.corpusHash,
    })),
  });

  for (const corpus of corpora) {
    saveJson(
      join(directory, 'corpus-' + corpus.maxBodyLength + '.json'),
      corpus,
    );
  }

  const texts = [
    ...tests.map(test => test.searchQuery),
    ...corpora.flatMap(corpus =>
      corpus.chunks.map(chunk => chunk.content),
    ),
  ];

  const embedded = await embedTextsCached(texts);
  const queryVectors = embedded.embeddings.slice(0, tests.length);

  saveJson(join(directory, 'embedding-usage.json'), {
    model: EVALUATION_EMBEDDING_MODEL,
    ...embedded.usage,
    preparationMs: embedded.durationMs,
  });

  let vectorOffset = tests.length;

  const summary: Array<{
    size: number;
    chunks: number;
    meanSearchMs: number;
    metrics: Metrics;
  }> = [];

  for (const corpus of corpora) {
    const vectors = embedded.embeddings.slice(
      vectorOffset,
      vectorOffset + corpus.chunkCount,
    );

    vectorOffset += corpus.chunkCount;

    const measurements: Metrics[] = [];
    const searchTimes: number[] = [];

    for (const [index, test] of tests.entries()) {
      const startedAt = performance.now();

      const results = corpus.chunks
        .map((chunk, chunkIndex) => ({
          ...chunk,
          similarity: cosineSimilarity(
            queryVectors[index],
            vectors[chunkIndex],
          ),
        }))
        .filter(chunk => chunk.similarity > MIN_SIMILARITY)
        .sort(
          (a, b) =>
            b.similarity - a.similarity ||
            a.chunkId.localeCompare(b.chunkId),
        )
        .slice(0, K);

      const searchMs = performance.now() - startedAt;

      const metrics = calculateRetrievalMetrics(
        results,
        test.relevantSources,
        K,
      );

      measurements.push(metrics);
      searchTimes.push(searchMs);

      saveJson(
        join(directory, corpus.maxBodyLength + '-' + test.id + '.json'),
        {
          test,
          maxBodyLength: corpus.maxBodyLength,
          results,
          metrics,
          searchMs,
        },
      );
    }

    summary.push({
      size: corpus.maxBodyLength,
      chunks: corpus.chunkCount,
      meanSearchMs:
        searchTimes.reduce((sum, value) => sum + value, 0) /
        searchTimes.length,
      metrics: averageMetrics(measurements),
    });
  }

  saveJson(join(directory, 'summary.json'), {
    testsPerVariant: tests.length,
    variants: summary,
    embeddingUsage: embedded.usage,
  });

  console.table(
    summary.map(item => ({
      size: item.size,
      chunks: item.chunks,
      ...item.metrics,
    })),
  );

  console.log('Embeddinghasználat:', embedded.usage);
  console.log('Eredmények:', directory);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('A chunking-mérés nem fejeződött be:', error);
    process.exit(1);
  });
