import { randomUUID } from 'node:crypto';

export const APPLICATION_BASE_URL = (
  process.env.EVALUATION_BASE_URL ??
  'http://localhost:3000'
).replace(/\/+$/, '');

const REQUEST_TIMEOUT_MS = 180_000;

export const applicationRequest = async (
  path: string,
  init: RequestInit = {},
  expectedStatus = 200,
) => {
  const startedAt = performance.now();

  const response = await fetch(
    `${APPLICATION_BASE_URL}${path}`,
    {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  const text = await response.text();

  if (response.status !== expectedStatus) {
    throw new Error(
      `${init.method ?? 'GET'} ${path}: ` +
      `expected HTTP ${expectedStatus}, received ` +
      `${response.status}. Response: ${text.slice(0, 2000)}`,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `${path}: the response is not valid JSON.`,
    );
  }

  return {
    status: response.status,
    durationMs: Math.round(performance.now() - startedAt),
    body,
  };
};

const isObject = (
  value: unknown,
): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value);

export const streamApplicationChat = async ({
  conversationId,
  revision,
  question,
}: {
  conversationId: string;
  revision: number;
  question: string;
}) => {
  const userMessage = {
    id: randomUUID(),
    role: 'user' as const,
    parts: [
      {
        type: 'text' as const,
        text: question,
      },
    ],
  };

  const startedAt = performance.now();

  const response = await fetch(
    `${APPLICATION_BASE_URL}/api/chat`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conversationId,
        revision,
        message: userMessage,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );

  const headersMs = Math.round(
    performance.now() - startedAt,
  );

  if (response.status !== 200) {
    const errorBody = await response.text();

    throw new Error(
      `Chat request failed with HTTP ${response.status}: ` +
      errorBody.slice(0, 2000),
    );
  }

  if (
    !response.headers
      .get('content-type')
      ?.includes('text/event-stream')
  ) {
    throw new Error(
      'The chat endpoint did not return an SSE stream.',
    );
  }

  if (response.body === null) {
    throw new Error('The chat response has no body.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const parts: Array<Record<string, unknown>> = [];
  const textFragments: string[] = [];

  let buffer = '';
  let assistantMessageId: string | null = null;
  let firstByteMs: number | null = null;
  let firstTextMs: number | null = null;
  let textDeltaCount = 0;
  let finishSeen = false;
  let doneSeen = false;

  const processFrame = (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');

    if (data.length === 0) {
      return;
    }

    if (data === '[DONE]') {
      doneSeen = true;
      return;
    }

    const part: unknown = JSON.parse(data);

    if (!isObject(part) || typeof part.type !== 'string') {
      throw new Error('Invalid UI message stream part.');
    }

    parts.push(part);

    if (
      part.type === 'error' ||
      part.type === 'tool-output-error' ||
      part.type === 'abort'
    ) {
      throw new Error(
        `The chat stream reported an error: ${
          typeof part.errorText === 'string'
            ? part.errorText
            : part.type
        }`,
      );
    }

    if (
      part.type === 'start' &&
      typeof part.messageId === 'string'
    ) {
      assistantMessageId = part.messageId;
    }

    if (part.type === 'text-delta') {
      if (typeof part.delta !== 'string') {
        throw new Error('Invalid text-delta stream part.');
      }

      if (part.delta.length > 0) {
        if (firstTextMs === null) {
          firstTextMs = Math.round(
            performance.now() - startedAt,
          );
        }

        textDeltaCount += 1;
        textFragments.push(part.delta);
      }
    }

    if (part.type === 'finish') {
      finishSeen = true;
    }
  };

  const processBufferedFrames = () => {
    let separator = /\r?\n\r?\n/.exec(buffer);

    while (separator !== null) {
      const frame = buffer.slice(0, separator.index);

      buffer = buffer.slice(
        separator.index + separator[0].length,
      );

      processFrame(frame);
      separator = /\r?\n\r?\n/.exec(buffer);
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) {
        break;
      }

      if (value.byteLength > 0 && firstByteMs === null) {
        firstByteMs = Math.round(
          performance.now() - startedAt,
        );
      }

      buffer += decoder.decode(value, { stream: true });
      processBufferedFrames();
    }

    buffer += decoder.decode();
    processBufferedFrames();

    if (buffer.trim().length > 0) {
      processFrame(buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const totalStreamMs = Math.round(
    performance.now() - startedAt,
  );

  const answer = textFragments.join('');

  if (!finishSeen || !doneSeen) {
    throw new Error('The chat stream ended incompletely.');
  }

  if (assistantMessageId === null) {
    throw new Error('The stream has no assistant message ID.');
  }

  if (answer.trim().length === 0 || firstTextMs === null) {
    throw new Error('The chat stream returned no answer text.');
  }

  return {
    userMessage,
    assistantMessageId,
    answer,
    parts,
    timing: {
      headersMs,
      firstByteMs,
      firstTextMs,
      totalStreamMs,
      textDeltaCount,
    },
  };
};