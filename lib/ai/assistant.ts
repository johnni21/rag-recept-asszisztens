import { openai } from '@ai-sdk/openai';
import { stepCountIs, tool } from 'ai';
import { z } from 'zod';

import { findRelevantContent } from '@/lib/ai/embedding';
import { baselineSystemPrompt } from '@/lib/ai/prompts';

export const getAssistantConfig = (
  systemPrompt = baselineSystemPrompt,
) => ({
  model: openai('gpt-5'),
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
      execute: async ({ question }) => findRelevantContent(question),
    }),
  },
});