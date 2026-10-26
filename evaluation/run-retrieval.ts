import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { retrieveCandidates } from '../lib/ai/embedding';
import { rerankCandidates } from '../lib/ai/reranking';
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
const CANDIDATE_LIMIT = 12;

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
    result[key] = items.length === 0
      ? 0
      : items.reduce((sum, item) => sum + item[key], 0) /
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
    throw new Error('Duplicate test IDs in dataset.');
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory = join('results', 'retrieval', runId);

  mkdirSync(outputDirectory, { recursive: true });

  saveJson(join(outputDirectory, 'config.json'), {
    runId,
    k: K,
    candidateLimit: CANDIDATE_LIMIT,
    minSimilarity: 0.45,
    embeddingModel: 'text-embedding-3-small',
    rerankModel: 'gpt-4.1-mini',
    rerankMinScore: 2,
    unit: 'unique fileName + section',
    queryLanguage: 'English',
    dataset: tests,
  });

  const baselineMetrics: Metrics[] = [];
  const rerankedMetrics: Metrics[] = [];
  const errors: Array<{ testId: string; message: string }> = [];

  for (const test of tests) {
    console.log('Futtatás:', test.id, '-', test.question);

    try {
      const startedAt = performance.now();

      const candidates = await retrieveCandidates(
        test.searchQuery,
        CANDIDATE_LIMIT,
      );

      const retrievalMs = Math.round(
        performance.now() - startedAt,
      );

      const baselineResults = candidates.slice(0, K);

      const reranked = await rerankCandidates(
        test.searchQuery,
        candidates,
        K,
      );

      const baseline = calculateRetrievalMetrics(
        baselineResults,
        test.relevantSources,
        K,
      );

      const afterReranking = calculateRetrievalMetrics(
        reranked.results,
        test.relevantSources,
        K,
      );

      saveJson(join(outputDirectory, test.id + '.json'), {
        test,
        candidates,
        baseline: {
          results: baselineResults,
          metrics: baseline,
        },
        reranked: {
          results: reranked.results,
          metrics: afterReranking,
        },
        timing: {
          retrievalMs,
          rerankingMs: reranked.durationMs,
          totalMs: Math.round(performance.now() - startedAt),
        },
        rerankingUsage: reranked.usage,
      });

      baselineMetrics.push(baseline);
      rerankedMetrics.push(afterReranking);

      console.log(
        'Recall@4:',
        baseline.recallAtK,
        '→',
        afterReranking.recallAtK,
      );
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      errors.push({ testId: test.id, message });

      saveJson(join(outputDirectory, test.id + '.error.json'), {
        test,
        error: message,
      });

      console.error('Hiba:', test.id, message);
    }
  }

  const summary = {
    planned: tests.length,
    completed: baselineMetrics.length,
    failed: errors.length,
    baseline: averageMetrics(baselineMetrics),
    reranked: averageMetrics(rerankedMetrics),
    errors,
  };

  saveJson(join(outputDirectory, 'summary.json'), summary);

  console.table([
    { mode: 'Vektoros keresés', ...summary.baseline },
    { mode: 'Reranking után', ...summary.reranked },
  ]);

  console.log('Sikeresen mért esetek:', summary.completed);
  console.log('Hibás esetek:', summary.failed);
  console.log('Eredmények:', outputDirectory);

  if (errors.length > 0) {
    throw new Error('Incomplete evaluation. Check saved errors.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
