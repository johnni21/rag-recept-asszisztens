import { openai } from '@ai-sdk/openai';
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAssistantConfig } from '@/lib/ai/assistant';

import { findRelevantContent } from '@/lib/ai/embedding';
import { baselineSystemPrompt } from '@/lib/ai/prompts';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'The request body must be valid JSON.',
        },
        { status: 400 },
      );
    }

    if (
      !requestBody ||
      typeof requestBody !== 'object' ||
      !('messages' in requestBody) ||
      !Array.isArray(requestBody.messages)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'A messages array is required.',
        },
        { status: 400 },
      );
    }

    const messages = requestBody.messages as UIMessage[];

    const result = streamText({
      ...getAssistantConfig(),
      messages: convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error('Chat request failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'The chat request could not be completed.',
      },
      { status: 500 },
    );
  }
}