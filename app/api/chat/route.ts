import {
  convertToModelMessages,
  generateId,
  streamText,
  validateUIMessages,
} from 'ai';
import type {
  InferUITools,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAssistantConfig } from '@/lib/ai/assistant';
import {
  loadConversation,
  saveConversationMessages,
} from '@/lib/chat/conversations';

export const maxDuration = 60;

const userMessageSchema = z.object({
  id: z.string().min(1).max(191),
  role: z.literal('user'),
  parts: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string().trim().min(1).max(20000),
    }),
  ).min(1).max(10),
});

const requestSchema = z.object({
  conversationId: z.string().min(1).max(191),
  revision: z.number().int().min(0),
  message: userMessageSchema,
}).strict();

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: 'The request body must be valid JSON.',
      },
      { status: 400 },
    );
  }

  const parsed = requestSchema.safeParse(body);

  if (parsed.success === false) {
    return NextResponse.json(
      {
        success: false,
        error:
          'A conversation ID, revision and user message are required.',
      },
      { status: 400 },
    );
  }

  const { conversationId, revision, message } = parsed.data;

  try {
    const conversation = await loadConversation(conversationId);

    if (conversation === null) {
      return NextResponse.json(
        {
          success: false,
          error: 'Conversation not found.',
        },
        { status: 404 },
      );
    }

    if (conversation.revision !== revision) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The conversation changed. Reload it before continuing.',
        },
        { status: 409 },
      );
    }

    if (
      conversation.messages.some(
        existing => existing.id === message.id,
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'This message has already been saved.',
        },
        { status: 409 },
      );
    }

    const config = getAssistantConfig();

    type AssistantMessage = UIMessage<
      unknown,
      UIDataTypes,
      InferUITools<typeof config.tools>
    >;

    const messages = await validateUIMessages<AssistantMessage>({
      messages: [...conversation.messages, message],
      tools: config.tools,
    });

    let completedSuccessfully = false;

    const result = streamText({
      ...config,
      messages: convertToModelMessages(messages),
      abortSignal: AbortSignal.timeout(120_000),
      onFinish: ({ finishReason }) => {
        completedSuccessfully = finishReason === 'stop';
      },
      onError: ({ error }) => {
        console.error('Chat generation failed:', error);
      },
    });

    void result.consumeStream({
      onError: error => {
        console.error('Chat stream consumption failed:', error);
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      generateMessageId: generateId,
      headers: {
        'Cache-Control': 'no-store',
      },
      onFinish: async ({
        messages: completedMessages,
        isAborted,
      }) => {
        if (isAborted || completedSuccessfully === false) {
          return;
        }

        await saveConversationMessages({
          id: conversationId,
          expectedRevision: revision,
          messages: completedMessages,
        });
      },
      onError: error => {
        console.error(
          'Chat response or persistence failed:',
          error,
        );

        return (
          'A válasz elkészítése vagy mentése sikertelen. ' +
          'Töltsd újra a beszélgetést.'
        );
      },
    });
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
