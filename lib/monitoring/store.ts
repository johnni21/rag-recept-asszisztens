import { sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { chatMetrics } from '@/lib/db/schema/chat-metrics';
import type { ChatMetricOutcome } from '@/lib/db/schema/chat-metrics';
import {
  estimateCostUsd,
  PRICING_VERSION,
} from '@/lib/monitoring/pricing';
import type { UsageEvent } from '@/lib/monitoring/usage';

export interface ChatMeasurement {
  conversationId: string;
  messageId: string;
  outcome: ChatMetricOutcome;
  firstTextMs: number | null;
  generationMs: number | null;
  totalMs: number;
  usage: UsageEvent[];
}

export const saveChatMeasurement = async (
  measurement: ChatMeasurement,
) => {
  const estimatedCost = estimateCostUsd(measurement.usage);

  const [saved] = await db
    .insert(chatMetrics)
    .values({
      conversationId: measurement.conversationId,
      messageId: measurement.messageId,
      outcome: measurement.outcome,
      firstTextMs: measurement.firstTextMs,
      generationMs: measurement.generationMs,
      totalMs: measurement.totalMs,
      usage: sql`${JSON.stringify(measurement.usage)}::text::jsonb`,
      estimatedCostUsd:
        estimatedCost === null
          ? null
          : estimatedCost.toFixed(10),
      pricingVersion: PRICING_VERSION,
    })
    .returning({ id: chatMetrics.id });

  if (saved === undefined) {
    throw new Error('The chat measurement could not be saved.');
  }

  return saved;
};