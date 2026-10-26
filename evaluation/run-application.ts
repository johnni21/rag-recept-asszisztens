import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import {
  ASSISTANT_MODEL,
  getAssistantConfig,
} from '@/lib/ai/assistant';
import { db } from '@/lib/db';
import { embeddings, resources } from '@/lib/db/schema/resources';
import {
  estimateCostUsd,
  PRICING_SOURCES,
  PRICING_VERSION,
} from '@/lib/monitoring/pricing';

import {
  APPLICATION_BASE_URL,
  applicationRequest,
  streamApplicationChat,
} from './application-http';
import {
  APPLICATION_JUDGE_MODEL,
  evaluateApplicationConversation,
} from './application-judge';
import {
  createApplicationConversation,
  extractApplicationContexts,
  getApplicationConversation,
  waitForApplicationMetric,
  waitForApplicationTurn,
} from './application-state';
import type {
  ApplicationConversation,
} from './application-state';

const datasetSchema = z.object({
  version: z.literal(1),
  fixture: z.object({
    content: z.string().min(1),
  }),
  cases: z.array(
    z.object({
      id: z.string().regex(/^app-\d{2}$/),
      name: z.string().min(1),
      persona: z.string().min(1),
      goal: z.string().min(1),
      fileType: z.enum(['md', 'txt']),
      check: z.enum([
        'reload',
        'duplicate-upload',
        'unsupported-upload',
        'empty-upload',
        'stale-revision',
        'invalid-chat',
        'missing-conversation',
        'conversation-isolation',
        'reprocess',
        'missing-document',
      ]),
      turns: z.array(
        z.object({
          question: z.string().min(1),
          referenceAnswer: z.string().min(1),
        }),
      ).length(2),
    }),
  ).length(10),
});

type TestCase = z.infer<typeof datasetSchema>['cases'][number];
type StreamResult = Awaited<
  ReturnType<typeof streamApplicationChat>
>;
type Metric = Awaited<
  ReturnType<typeof waitForApplicationMetric>
>;
type JudgeResult = Awaited<
  ReturnType<typeof evaluateApplicationConversation>
>;

interface TurnResult {
  question: string;
  referenceAnswer: string;
  answer: string;
  contexts: ReturnType<typeof extractApplicationContexts>;
  stream: StreamResult;
  metric: Metric;
  conversation: ApplicationConversation;
}

interface CaseResult {
  id: string;
  name: string;
  recipeName: string;
  fileName: string;
  technicalPassed: boolean;
  success: boolean;
  checks: Array<{
    name: string;
    status: number | null;
    durationMs: number | null;
  }>;
  turns: TurnResult[];
  judge: JudgeResult | null;
  journeyMs: number | null;
  totalCaseMs: number | null;
  error: string | null;
  cleanupErrors: string[];
}

const jsonRequest = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const writeJson = async (file: string, value: unknown) => {
  await writeFile(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
};

const mean = (values: number[]) =>
  values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) /
      values.length;

async function runCase(
  test: TestCase,
  fixtureTemplate: string,
  outputDirectory: string,
) {
  const startedAt = performance.now();
  const nonce = randomUUID();

  const recipeName = `Evaluation Chickpea Bowl ${test.id} ${nonce}`;
  const fileName = `evaluation-${test.id}-${nonce}.${test.fileType}`;
  const content = fixtureTemplate.replaceAll(
    '{{recipeName}}',
    recipeName,
  );

  const result: CaseResult = {
    id: test.id,
    name: test.name,
    recipeName,
    fileName,
    technicalPassed: false,
    success: false,
    checks: [],
    turns: [],
    judge: null,
    journeyMs: null,
    totalCaseMs: null,
    error: null,
    cleanupErrors: [],
  };

  const resultFile = path.join(
    outputDirectory,
    `${test.id}.json`,
  );

  const conversationIds: string[] = [];
  const attemptedFileNames = new Set<string>();

  const checkpoint = () => writeJson(resultFile, result);

  const request = async (
    name: string,
    endpoint: string,
    init: RequestInit = {},
    expectedStatus = 200,
  ) => {
    const response = await applicationRequest(
      endpoint,
      init,
      expectedStatus,
    );

    result.checks.push({
      name,
      status: response.status,
      durationMs: response.durationMs,
    });

    await checkpoint();
    return response.body;
  };

  const upload = async (
    name: string,
    uploadedName: string,
    uploadedContent: string,
    expectedStatus: number,
  ) => {
    attemptedFileNames.add(uploadedName);

    const form = new FormData();
    form.append(
      'file',
      new Blob([uploadedContent], { type: 'text/plain' }),
      uploadedName,
    );

    return request(
      name,
      '/api/upload',
      { method: 'POST', body: form },
      expectedStatus,
    );
  };

  const createConversation = async (suffix: string) => {
    const conversation = await createApplicationConversation(
      `Evaluation ${test.id} ${nonce} ${suffix}`,
    );

    conversationIds.push(conversation.id);
    assert.equal(conversation.revision, 0);
    assert.equal(conversation.messages.length, 0);

    return conversation;
  };

  try {
    await checkpoint();

    if (test.check === 'unsupported-upload') {
      await upload(
        'Nem támogatott fájltípus elutasítása',
        `evaluation-${test.id}-${nonce}.pdf`,
        content,
        415,
      );
    }

    if (test.check === 'empty-upload') {
      await upload(
        'Üres feltöltés elutasítása',
        `evaluation-empty-${nonce}.txt`,
        '',
        400,
      );
    }

    if (test.check === 'missing-document') {
      await request(
        'Nem létező dokumentum feldolgozásának elutasítása',
        '/api/process',
        jsonRequest({ documentId: `missing-${nonce}` }),
        404,
      );
    }

    if (test.check === 'missing-conversation') {
      const missingId = `missing-${nonce}`;

      await request(
        'Nem létező beszélgetés lekérése',
        `/api/conversations/${missingId}`,
        {},
        404,
      );

      await request(
        'Nem létező beszélgetéshez küldött kérdés elutasítása',
        '/api/chat',
        jsonRequest({
          conversationId: missingId,
          revision: 0,
          message: {
            id: randomUUID(),
            role: 'user',
            parts: [{ type: 'text', text: 'Próba kérdés.' }],
          },
        }),
        404,
      );
    }

    const uploaded = z.object({
      success: z.literal(true),
      document: z.object({
        id: z.string().min(1),
        fileName: z.string(),
        status: z.literal('uploaded'),
      }),
    }).parse(
      await upload(
        'Tesztfájl feltöltése',
        fileName,
        content,
        201,
      ),
    ).document;

    assert.equal(uploaded.fileName, fileName);

    if (test.check === 'duplicate-upload') {
      await upload(
        'Duplikált fájlnév elutasítása',
        fileName,
        content,
        409,
      );
    }

    const processed = z.object({
      success: z.literal(true),
      documentId: z.string(),
      status: z.literal('processed'),
      chunkCount: z.number().int().positive(),
    }).parse(
      await request(
        'Dokumentum feldolgozása',
        '/api/process',
        jsonRequest({ documentId: uploaded.id }),
      ),
    );

    assert.equal(processed.documentId, uploaded.id);

    const loadChunks = () =>
      db
        .select({
          chunkIndex: embeddings.chunkIndex,
          content: embeddings.content,
        })
        .from(embeddings)
        .where(eq(embeddings.resourceId, uploaded.id))
        .orderBy(embeddings.chunkIndex);

    const initialChunks = await loadChunks();

    assert.equal(
      initialChunks.length,
      processed.chunkCount,
    );
    assert.equal(
      new Set(initialChunks.map(chunk => chunk.chunkIndex)).size,
      initialChunks.length,
    );

    if (test.check === 'reprocess') {
      await request(
        'Dokumentum ismételt feldolgozása',
        '/api/process',
        jsonRequest({ documentId: uploaded.id }),
      );

      assert.deepEqual(
        await loadChunks(),
        initialChunks,
        'Reprocessing changed or duplicated the chunks.',
      );
    }

    let conversation = await createConversation('active');

    const listing = z.object({
      success: z.literal(true),
      conversations: z.array(z.object({ id: z.string() })),
    }).parse(
      await request(
        'Beszélgetés megjelenése a listában',
        '/api/conversations',
      ),
    );

    assert.ok(
      listing.conversations.some(
        item => item.id === conversation.id,
      ),
    );

    let isolated: ApplicationConversation | null = null;

    if (test.check === 'conversation-isolation') {
      isolated = await createConversation('isolated');
    }

    if (test.check === 'invalid-chat') {
      await request(
        'Üres üzenetrészek elutasítása',
        '/api/chat',
        jsonRequest({
          conversationId: conversation.id,
          revision: conversation.revision,
          message: {
            id: randomUUID(),
            role: 'user',
            parts: [],
          },
        }),
        400,
      );

      assert.deepEqual(
        await getApplicationConversation(conversation.id),
        conversation,
      );
    }

    for (const [index, turn] of test.turns.entries()) {
      console.log(`[${test.id}] ${index + 1}. kör`);

      const question = turn.question.replaceAll(
        '{{recipeName}}',
        recipeName,
      );

      const stream = await streamApplicationChat({
        conversationId: conversation.id,
        revision: conversation.revision,
        question,
      });

      const saved = await waitForApplicationTurn({
        previous: conversation,
        userMessageId: stream.userMessage.id,
        assistantMessageId: stream.assistantMessageId,
        answer: stream.answer,
      });

      assert.deepEqual(
        saved.messages[conversation.messages.length].parts,
        stream.userMessage.parts,
      );

      const metric = await waitForApplicationMetric(
        conversation.id,
        stream.userMessage.id,
      );

      result.turns.push({
        question,
        referenceAnswer: turn.referenceAnswer,
        answer: stream.answer,
        contexts: extractApplicationContexts(stream.parts),
        stream,
        metric,
        conversation: saved,
      });

      conversation = saved;
      await checkpoint();

      assert.deepEqual(
        await getApplicationConversation(conversation.id),
        conversation,
        'Reloaded conversation differs from the saved conversation.',
      );

      if (isolated !== null) {
        assert.deepEqual(
          await getApplicationConversation(isolated.id),
          isolated,
          'The inactive conversation changed.',
        );
      }

      if (
        index === 0 &&
        test.check === 'stale-revision'
      ) {
        await request(
          'Elavult beszélgetésverzió elutasítása',
          '/api/chat',
          jsonRequest({
            conversationId: conversation.id,
            revision: 0,
            message: {
              id: randomUUID(),
              role: 'user',
              parts: [
                { type: 'text', text: 'Elavult kérés.' },
              ],
            },
          }),
          409,
        );

        assert.deepEqual(
          await getApplicationConversation(conversation.id),
          conversation,
          'The stale request changed the conversation.',
        );
      }
    }

    result.technicalPassed = true;
    result.journeyMs = Math.round(
      performance.now() - startedAt,
    );
    await checkpoint();

    console.log(`[${test.id}] Beszélgetés értékelése`);

    result.judge = await evaluateApplicationConversation({
      persona: test.persona,
      goal: test.goal,
      turns: result.turns.map(turn => ({
        question: turn.question,
        referenceAnswer: turn.referenceAnswer,
        answer: turn.answer,
        contexts: turn.contexts,
      })),
    });

    const evaluation = result.judge.evaluation;

    result.success =
      evaluation.goalAchieved &&
      evaluation.responseQualityScore >= 2 &&
      evaluation.simulatedSatisfactionScore >= 2 &&
      !evaluation.hallucinationDetected;
  } catch (error) {
    result.error = errorMessage(error);
    result.success = false;
    console.error(`[${test.id}] ${result.error}`);
  } finally {
    try {
      const ownedDocuments = await db
        .select({ id: resources.id })
        .from(resources)
        .where(
          inArray(
            resources.fileName,
            [...attemptedFileNames],
          ),
        );

      for (const document of ownedDocuments) {
        await request(
          'Tesztfájl törlése',
          `/api/documents/${document.id}`,
          { method: 'DELETE' },
        );

        const remainingChunks = await db
          .select({ id: embeddings.id })
          .from(embeddings)
          .where(eq(embeddings.resourceId, document.id))
          .limit(1);

        assert.equal(
          remainingChunks.length,
          0,
          'Chunks remained after deleting the test document.',
        );

        await request(
          'Már törölt dokumentum ismételt törlése',
          `/api/documents/${document.id}`,
          { method: 'DELETE' },
          404,
        );
      }
    } catch (error) {
      result.cleanupErrors.push(errorMessage(error));
    }

    for (const id of conversationIds) {
      try {
        await request(
          'Tesztbeszélgetés törlése',
          `/api/conversations/${id}`,
          { method: 'DELETE' },
        );

        await request(
          'Törölt beszélgetés már nem tölthető vissza',
          `/api/conversations/${id}`,
          {},
          404,
        );
      } catch (error) {
        result.cleanupErrors.push(errorMessage(error));
      }
    }

    if (result.cleanupErrors.length > 0) {
      result.technicalPassed = false;
      result.success = false;
    }

    result.totalCaseMs = Math.round(
      performance.now() - startedAt,
    );

    await checkpoint();
  }

  return result;
}

async function main(): Promise<number> {
  const dataset = datasetSchema.parse(
    JSON.parse(
      await readFile(
        'evaluation/datasets/application.json',
        'utf8',
      ),
    ),
  );

  assert.equal(
    new Set(dataset.cases.map(test => test.id)).size,
    dataset.cases.length,
  );

  assert.equal(
    new Set(dataset.cases.map(test => test.check)).size,
    dataset.cases.length,
  );

  const selectedId = process.argv[2];
  const selectedCases = selectedId
    ? dataset.cases.filter(test => test.id === selectedId)
    : dataset.cases;

  if (selectedCases.length === 0) {
    throw new Error(`Unknown test case: ${selectedId}`);
  }

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDirectory = path.join(
    'results',
    'application',
    runId,
  );

  await mkdir(outputDirectory, { recursive: true });

  await writeJson(
    path.join(outputDirectory, 'config.json'),
    {
      startedAt: new Date().toISOString(),
      baseUrl: APPLICATION_BASE_URL,
      selectedIds: selectedCases.map(test => test.id),
      dataset,
      assistantModel: ASSISTANT_MODEL,
      systemPrompt: getAssistantConfig().system,
      judgeModel: APPLICATION_JUDGE_MODEL,
      pricingVersion: PRICING_VERSION,
      pricingSources: PRICING_SOURCES,
      scope: 'HTTP API journeys with database verification',
      documentProcessingCostIncluded: false,
      successCriteria: {
        technicalChecksPassed: true,
        goalAchieved: true,
        minimumResponseQuality: 2,
        minimumSimulatedSatisfaction: 2,
        hallucinationDetected: false,
      },
    },
  );

  await applicationRequest('/api/documents');
  await applicationRequest('/api/conversations');

  const results: CaseResult[] = [];

  for (const test of selectedCases) {
    console.log(`[${test.id}] ${test.name}`);

    const result = await runCase(
      test,
      dataset.fixture.content,
      outputDirectory,
    );

    results.push(result);
  }

  const judged = results.flatMap(
    result => result.judge === null ? [] : [result.judge],
  );

  const turns = results.flatMap(result => result.turns);

  const pricedMetrics = turns.filter(
    turn => turn.metric.estimatedCostUsd !== null,
  );

  const judgeCosts = judged
    .map(judge =>
      estimateCostUsd([
        {
          stage: 'assistant',
          model: judge.model,
          inputTokens: judge.usage.inputTokens ?? null,
          outputTokens: judge.usage.outputTokens ?? null,
          cachedInputTokens:
            judge.usage.cachedInputTokens ?? null,
          durationMs: judge.durationMs,
        },
      ]),
    )
    .filter((cost): cost is number => cost !== null);

  const executionErrors = results.filter(
    result =>
      result.error !== null ||
      result.cleanupErrors.length > 0,
  ).length;

  const summary = {
    planned: selectedCases.length,
    technicalPassed: results.filter(
      result => result.technicalPassed,
    ).length,
    judged: judged.length,
    successful: results.filter(result => result.success).length,
    executionErrors,
    completedTurns: turns.length,
    responseQualityMean: mean(
      judged.map(judge =>
        judge.evaluation.responseQualityScore,
      ),
    ),
    simulatedSatisfactionMean: mean(
      judged.map(judge =>
        judge.evaluation.simulatedSatisfactionScore,
      ),
    ),
    goalAchievedCount: judged.filter(
      judge => judge.evaluation.goalAchieved,
    ).length,
    judgeFlaggedHallucinationCount: judged.filter(
      judge => judge.evaluation.hallucinationDetected,
    ).length,
    meanClientFirstTextMs: mean(
      turns.map(turn => turn.stream.timing.firstTextMs),
    ),
    meanClientStreamMs: mean(
      turns.map(turn => turn.stream.timing.totalStreamMs),
    ),
    meanServerTotalMs: mean(
      turns.map(turn => turn.metric.totalMs),
    ),
    meanJourneyMs: mean(
      results.flatMap(result =>
        result.journeyMs === null ? [] : [result.journeyMs],
      ),
    ),
    knownChatCostUsd:
      pricedMetrics.length === 0
        ? null
        : pricedMetrics.reduce(
            (sum, turn) =>
              sum + Number(turn.metric.estimatedCostUsd),
            0,
          ),
    chatCostCoverage: {
      pricedTurns: pricedMetrics.length,
      recordedTurns: turns.length,
    },
    knownJudgeCostUsd:
      judgeCosts.length === 0
        ? null
        : judgeCosts.reduce((sum, cost) => sum + cost, 0),
    judgeCostCoverage: {
      pricedEvaluations: judgeCosts.length,
      evaluations: judged.length,
    },
    documentProcessingCostIncluded: false,
  };

  await writeJson(
    path.join(outputDirectory, 'summary.json'),
    summary,
  );

  console.table(
    results.map(result => ({
      id: result.id,
      technical: result.technicalPassed,
      quality: result.judge?.evaluation.responseQualityScore,
      satisfaction:
        result.judge?.evaluation.simulatedSatisfactionScore,
      goal: result.judge?.evaluation.goalAchieved,
      hallucination:
        result.judge?.evaluation.hallucinationDetected,
      success: result.success,
      error: result.error,
      cleanupErrors: result.cleanupErrors.length,
    })),
  );

  console.log('Összesítés:', summary);
  console.log('Eredmények:', outputDirectory);

  return results.every(result => result.success) ? 0 : 1;
}

main().then(
  code => process.exit(code),
  error => {
    console.error('Az alkalmazásteszt futtatása sikertelen:', error);
    process.exit(1);
  },
);