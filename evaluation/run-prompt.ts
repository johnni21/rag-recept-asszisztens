import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

import { getAssistantConfig } from '../lib/ai/assistant';
import { answerSingleTurn } from './answer-single-turn';
import {
  evaluatePromptResponse,
  PROMPT_JUDGE_MODEL,
} from './prompt-judge';

const datasetSchema = z.array(
  z.object({
    id: z.string().min(1),
    question: z.string().min(1),
    answerable: z.boolean(),
    referenceAnswer: z.string().min(1),
    relevantSources: z.array(
      z.object({
        fileName: z.string().min(1),
        section: z.string().min(1),
      }),
    ),
  }),
).min(15);

type Evaluation = Awaited<
  ReturnType<typeof evaluatePromptResponse>
>['evaluation'];

type Measurement = {
  testId: string;
  answerable: boolean;
  evaluation: Evaluation;
  searchCalls: number;
  assistantMs: number;
  judgeMs: number;
};

const saveJson = (path: string, value: unknown) => {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
};

const mean = (values: number[]): number | null =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) /
      values.length;

async function main() {
  const tests = datasetSchema.parse(
    JSON.parse(
      readFileSync('evaluation/datasets/prompt.json', 'utf8'),
    ),
  );

  if (new Set(tests.map(test => test.id)).size !== tests.length) {
    throw new Error('Duplicate test IDs.');
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join('results', 'prompt', runId);
  const config = getAssistantConfig();

  mkdirSync(directory, { recursive: true });

  saveJson(join(directory, 'config.json'), {
    runId,
    assistantModel: config.model.modelId,
    judgeModel: PROMPT_JUDGE_MODEL,
    systemPrompt: config.system,
    mode: 'single-turn with actual retrieval tools',
    scoreRange: '0–3',
    emptyContextRelevance: null,
    dataset: tests,
  });

  const measurements: Measurement[] = [];
  const errors: Array<{ testId: string; message: string }> = [];

  for (const test of tests) {
    console.log('Futtatás:', test.id, '-', test.question);

    try {
      const response = await answerSingleTurn(test.question);

      saveJson(
        join(directory, test.id + '.answer.json'),
        { test, response },
      );

      if (
        response.answer.trim().length === 0 ||
        response.finishReason !== 'stop'
      ) {
        throw new Error(
          'Assistant did not produce a complete final answer: ' +
            response.finishReason,
        );
      }

      const judgeInput = {
        question: test.question,
        answerable: test.answerable,
        referenceAnswer: test.referenceAnswer,
        contexts: response.contexts,
        answer: response.answer,
      };

      const judged = await evaluatePromptResponse(judgeInput);

      saveJson(join(directory, test.id + '.json'), {
        test,
        response,
        judgeInput,
        judged,
      });

      measurements.push({
        testId: test.id,
        answerable: test.answerable,
        evaluation: judged.evaluation,
        searchCalls: response.searchCalls,
        assistantMs: response.durationMs,
        judgeMs: judged.durationMs,
      });

      console.log({
        correctness: judged.evaluation.answerCorrectnessScore,
        groundedness: judged.evaluation.groundednessScore,
        hallucination: judged.evaluation.hallucinationDetected,
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : String(error);

      errors.push({ testId: test.id, message });

      saveJson(join(directory, test.id + '.error.json'), {
        test,
        error: message,
      });

      console.error('Hiba:', test.id, message);
    }
  }

  const contextScores = measurements.flatMap(item =>
    item.evaluation.contextRelevanceScore === null
      ? []
      : [item.evaluation.contextRelevanceScore],
  );

  const flaggedCount = measurements.filter(
    item => item.evaluation.hallucinationDetected,
  ).length;

  const groups = [true, false].map(answerable => {
    const selected = measurements.filter(
      item => item.answerable === answerable,
    );

    return {
      answerable,
      evaluated: selected.length,
      correctnessMean: mean(
        selected.map(item =>
          item.evaluation.answerCorrectnessScore,
        ),
      ),
      groundednessMean: mean(
        selected.map(item => item.evaluation.groundednessScore),
      ),
    };
  });

  const summary = {
    planned: tests.length,
    completed: measurements.length,
    failed: errors.length,
    contextRelevanceMean: mean(contextScores),
    contextRelevanceEvaluatedCases: contextScores.length,
    answerCorrectnessMean: mean(
      measurements.map(item =>
        item.evaluation.answerCorrectnessScore,
      ),
    ),
    groundednessMean: mean(
      measurements.map(item => item.evaluation.groundednessScore),
    ),
    judgeFlaggedHallucinationCount: flaggedCount,
    judgeFlaggedHallucinationRate:
      measurements.length === 0
        ? null
        : flaggedCount / measurements.length,
    casesWithSearchTool: measurements.filter(
      item => item.searchCalls > 0,
    ).length,
    meanAssistantMs: mean(
      measurements.map(item => item.assistantMs),
    ),
    meanJudgeMs: mean(
      measurements.map(item => item.judgeMs),
    ),
    groups,
    errors,
  };

  saveJson(join(directory, 'summary.json'), summary);

  console.table(
    measurements.map(item => ({
      id: item.testId,
      answerable: item.answerable,
      context: item.evaluation.contextRelevanceScore,
      correctness: item.evaluation.answerCorrectnessScore,
      groundedness: item.evaluation.groundednessScore,
      hallucination: item.evaluation.hallucinationDetected,
      searchCalls: item.searchCalls,
    })),
  );

  console.log('Összesítés:');
  console.dir(summary, { depth: null });
  console.log('Eredmények:', directory);

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
