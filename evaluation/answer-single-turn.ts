import { generateText } from 'ai';
import { z } from 'zod';

import { getAssistantConfig } from '../lib/ai/assistant';

const contextSchema = z.object({
  chunkId: z.string(),
  fileName: z.string(),
  section: z.string().nullable(),
  content: z.string(),
});

const searchOutputSchema = z.object({
  results: z.array(contextSchema),
});

type Context = z.infer<typeof contextSchema>;

export const answerSingleTurn = async (question: string) => {
  const config = getAssistantConfig();
  const startedAt = performance.now();

  const result = await generateText({
    ...config,
    prompt: question,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(120_000),
  });

  const durationMs = Math.round(performance.now() - startedAt);
  const contexts = new Map<string, Context>();
  let searchCalls = 0;

  const steps = result.steps.map(step => {
    for (const toolResult of step.toolResults) {
      if (toolResult.toolName === 'getInformation') {
        searchCalls += 1;

        const output = searchOutputSchema.parse(
          toolResult.output,
        );

        for (const context of output.results) {
          contexts.set(context.chunkId, context);
        }
      }
    }

    return {
      text: step.text,
      toolCalls: step.toolCalls,
      toolResults: step.toolResults,
      usage: step.usage,
      finishReason: step.finishReason,
    };
  });

  return {
    answer: result.text,
    contexts: [...contexts.values()],
    searchCalls,
    steps,
    assistantUsage: result.totalUsage,
    durationMs,
    finishReason: result.finishReason,
    model: config.model.modelId,
    resolvedModel: result.response.modelId,
    systemPrompt: config.system,
  };
};
