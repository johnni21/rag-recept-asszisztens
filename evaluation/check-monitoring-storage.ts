import assert from 'node:assert/strict';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { chatMetrics } from '@/lib/db/schema/chat-metrics';
import {
  estimateCostUsd,
  PRICING_VERSION,
} from '@/lib/monitoring/pricing';
import {
  saveChatMeasurement,
  type ChatMeasurement,
} from '@/lib/monitoring/store';
import type { UsageEvent } from '@/lib/monitoring/usage';

async function main() {
  let testMeasurementId: string | undefined;

  const assistantEvent: UsageEvent = {
    stage: 'assistant',
    model: 'gpt-5',
    inputTokens: 1000,
    outputTokens: 200,
    cachedInputTokens: 400,
    durationMs: 3000,
  };

  // 600 normál input + 400 cache-input + 200 output.
  assert.equal(
    estimateCostUsd([assistantEvent]),
    0.0028,
  );

  // Ugyanaz a használat cache-kedvezmény nélkül.
  assert.equal(
    estimateCostUsd([
      { ...assistantEvent, cachedInputTokens: 0 },
    ]),
    0.00325,
  );

  // Hiányzó adatból nem becsülünk nulla költséget.
  assert.equal(
    estimateCostUsd([
      { ...assistantEvent, inputTokens: null },
    ]),
    null,
  );

  assert.equal(
    estimateCostUsd([
      { ...assistantEvent, cachedInputTokens: null },
    ]),
    null,
  );

  assert.equal(
    estimateCostUsd([
      { ...assistantEvent, cachedInputTokens: 1001 },
    ]),
    null,
  );

  assert.equal(
    estimateCostUsd([
      { ...assistantEvent, model: 'unknown-model' },
    ]),
    null,
  );

  assert.equal(estimateCostUsd([]), null);

  console.log('Költségszámítás és cache-kedvezmény: helyes.');
  console.log('Hiányzó vagy hibás adatok: null költség.');

  const measurement: ChatMeasurement = {
    conversationId: 'monitoring-storage-test',
    messageId: 'monitoring-storage-test-message',
    outcome: 'saved',
    firstTextMs: 2800,
    generationMs: 3000,
    totalMs: 3050,
    usage: [
      {
        stage: 'embedding',
        model: 'text-embedding-3-small',
        inputTokens: 1000,
        outputTokens: 0,
        cachedInputTokens: null,
        durationMs: 200,
      },
      {
        stage: 'reranking',
        model: 'gpt-4.1-mini',
        inputTokens: 1000,
        outputTokens: 200,
        cachedInputTokens: 0,
        durationMs: 500,
      },
      assistantEvent,
    ],
  };

  // Embedding: 0.00002 USD
  // Reranking: 0.00072 USD
  // Asszisztens: 0.0028 USD
  assert.equal(
    estimateCostUsd(measurement.usage),
    0.00354,
  );

  try {
    const saved = await saveChatMeasurement(measurement);
    testMeasurementId = saved.id;

    const [stored] = await db
      .select({
        conversationId: chatMetrics.conversationId,
        messageId: chatMetrics.messageId,
        outcome: chatMetrics.outcome,
        firstTextMs: chatMetrics.firstTextMs,
        generationMs: chatMetrics.generationMs,
        totalMs: chatMetrics.totalMs,
        usage: chatMetrics.usage,
        storedType: sql<string>`
          jsonb_typeof(${chatMetrics.usage})
        `,
        estimatedCostUsd: chatMetrics.estimatedCostUsd,
        pricingVersion: chatMetrics.pricingVersion,
      })
      .from(chatMetrics)
      .where(eq(chatMetrics.id, saved.id));

    assert.ok(stored, 'A mérési rekord nem található.');

    assert.equal(stored.storedType, 'array');
    assert.deepEqual(stored.usage, measurement.usage);

    assert.equal(
      stored.conversationId,
      measurement.conversationId,
    );
    assert.equal(stored.messageId, measurement.messageId);
    assert.equal(stored.outcome, measurement.outcome);
    assert.equal(stored.firstTextMs, measurement.firstTextMs);
    assert.equal(stored.generationMs, measurement.generationMs);
    assert.equal(stored.totalMs, measurement.totalMs);

    assert.notEqual(stored.estimatedCostUsd, null);
    assert.equal(Number(stored.estimatedCostUsd), 0.00354);
    assert.equal(stored.pricingVersion, PRICING_VERSION);

    console.log('Tokenhasználat és válaszidők: pontosan visszaolvashatók.');
    console.log('Mentett becsült költség: 0.00354 USD.');
    console.log('Az árazás verziója is elmentődött.');
  } finally {
    if (testMeasurementId) {
      await db
        .delete(chatMetrics)
        .where(eq(chatMetrics.id, testMeasurementId));

      console.log('Az ideiglenes mérési rekord törölve.');
    }
  }

  console.log('Minden monitoringellenőrzés sikeres.');
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  },
);