import type { UsageEvent } from '@/lib/monitoring/usage';

export const PRICING_VERSION =
  'openai-standard-usd-2026-10-22';

export const PRICING_SOURCES = [
  'https://developers.openai.com/api/docs/models/gpt-5',
  'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
  'https://developers.openai.com/api/docs/models/text-embedding-3-small',
];

interface ModelPrice {
  input: number;
  cachedInput: number | null;
  output: number;
}

const PRICES: Readonly<Record<string, ModelPrice>> = {
  'gpt-5': {
    input: 1.25,
    cachedInput: 0.125,
    output: 10,
  },
  'gpt-4.1-mini': {
    input: 0.4,
    cachedInput: 0.1,
    output: 1.6,
  },
  'text-embedding-3-small': {
    input: 0.02,
    cachedInput: null,
    output: 0,
  },
};

const isTokenCount = (
  value: number | null,
): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0;

export const estimateCostUsd = (
  events: readonly UsageEvent[],
): number | null => {
  if (events.length === 0) {
    return null;
  }

  let total = 0;

  for (const event of events) {
    const price = Object.prototype.hasOwnProperty.call(
      PRICES,
      event.model,
    )
      ? PRICES[event.model]
      : undefined;

    if (
      price === undefined ||
      !isTokenCount(event.inputTokens) ||
      !isTokenCount(event.outputTokens)
    ) {
      return null;
    }

    let cachedTokens = 0;

    if (price.cachedInput !== null) {
      if (
        !isTokenCount(event.cachedInputTokens) ||
        event.cachedInputTokens > event.inputTokens
      ) {
        return null;
      }

      cachedTokens = event.cachedInputTokens;
    }

    const regularInputTokens =
      event.inputTokens - cachedTokens;

    total += (
      regularInputTokens * price.input +
      cachedTokens * (price.cachedInput ?? 0) +
      event.outputTokens * price.output
    ) / 1_000_000;
  }

  return Number(total.toFixed(10));
};