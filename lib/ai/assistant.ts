import { openai } from '@ai-sdk/openai';
import { stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { findRelevantContent } from '@/lib/ai/embedding';
import { baselineSystemPrompt } from '@/lib/ai/prompts';
import type { UsageRecorder } from '@/lib/monitoring/usage';

export const ASSISTANT_MODEL = 'gpt-5';

export const getAssistantConfig = (
  systemPrompt = baselineSystemPrompt,
  recordUsage?: UsageRecorder,
) => ({
  model: openai(ASSISTANT_MODEL),
  stopWhen: stepCountIs(5),
  system: systemPrompt,
  tools: {
    getInformation: tool({
      description: `
Search the uploaded English-language recipe documents for recipes,
ingredients, cooking steps, preparation time, and meal recommendations.
Translate the user's Hungarian request into a concise English search
query before calling this tool. Preserve recipe names unchanged.
      `.trim(),
      inputSchema: z.object({
        question: z
          .string()
          .trim()
          .min(1)
          .describe(
            'A concise English search query translated from the user request',
          ),
      }),
      execute: async ({ question }) =>
        findRelevantContent(question, recordUsage),
    }),
  },
});