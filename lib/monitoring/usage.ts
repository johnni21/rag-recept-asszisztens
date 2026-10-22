export type UsageStage =
  | 'assistant'
  | 'embedding'
  | 'reranking';

export interface ModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
}

export interface UsageEvent {
  stage: UsageStage;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedInputTokens: number | null;
  durationMs: number;
}

export interface UsageMeasurement {
  stage: UsageStage;
  model: string;
  usage: ModelUsage | undefined;
  durationMs: number;
}

export type UsageRecorder = (
  measurement: UsageMeasurement,
) => void;

const normalizeTokenCount = (
  value: number | undefined,
): number | null => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return null;
  }

  return value;
};

export const createUsageCollector = () => {
  const events: UsageEvent[] = [];

  const record: UsageRecorder = measurement => {
    events.push({
      stage: measurement.stage,
      model: measurement.model,
      inputTokens: normalizeTokenCount(
        measurement.usage?.inputTokens,
      ),
      outputTokens: normalizeTokenCount(
        measurement.usage?.outputTokens,
      ),
      cachedInputTokens: normalizeTokenCount(
        measurement.usage?.cachedInputTokens,
      ),
      durationMs: Math.max(
        0,
        Math.round(measurement.durationMs),
      ),
    });
  };

  const snapshot = (): UsageEvent[] =>
    events.map(event => ({ ...event }));

  return {
    record,
    snapshot,
  };
};