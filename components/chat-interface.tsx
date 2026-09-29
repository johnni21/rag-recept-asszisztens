'use client';

import { useChat } from '@ai-sdk/react';
import {
  getToolName,
  isToolUIPart,
} from 'ai';
import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

export function ChatInterface() {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    sendMessage,
    status,
    error,
  } = useChat();

  const isResponding =
    status === 'submitted' || status === 'streaming';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const message = input.trim();

    if (!message || isResponding) {
      return;
    }

    sendMessage({ text: message });
    setInput('');
  };

  return (
    <section className="flex min-h-[700px] flex-col rounded-xl border bg-white shadow-sm">
      <div className="border-b p-5">
        <h2 className="text-xl font-semibold">
          Receptasszisztens
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          Kérdezz receptekről vagy adj meg hozzávalókat.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {messages.length === 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Például: „Mit főzhetek krumpliból és
            zöldborsóból?”
          </div>
        )}

        {messages.map(message => {
          const textParts = message.parts.filter(
            part => part.type === 'text',
          );
          const toolParts = message.parts.filter(isToolUIPart);
          const isUser = message.role === 'user';

          return (
            <div
              key={message.id}
              className={`flex ${
                isUser ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[90%] rounded-xl px-4 py-3 ${
                  isUser
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-900'
                }`}
              >
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-70">
                  {isUser ? 'Te' : 'Receptasszisztens'}
                </p>

                {textParts.map((part, index) => (
                  <p
                    key={index}
                    className="whitespace-pre-wrap text-sm leading-6"
                  >
                    {part.text}
                  </p>
                ))}

                {toolParts.length > 0 && (
                  <details className="mt-3 border-t border-zinc-300 pt-2 text-zinc-700">
                    <summary className="cursor-pointer text-xs font-medium">
                      Hogyan találtam meg? ({toolParts.length}{' '}
                      keresés)
                    </summary>

                    <div className="mt-3 space-y-3">
                      {toolParts.map((part, index) => (
                        <div
                          key={index}
                          className="rounded-md bg-white p-3 text-xs"
                        >
                          <p className="font-semibold">
                            {getToolName(part)}
                          </p>

                          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap">
                            Keresés:{' '}
                            {JSON.stringify(
                              part.input,
                              null,
                              2,
                            )}
                          </pre>

                          {part.state ===
                            'output-available' && (
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-emerald-800">
                              Találatok:{' '}
                              {JSON.stringify(
                                part.output,
                                null,
                                2,
                              )}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </div>
          );
        })}

        {isResponding && (
          <p className="text-sm text-zinc-500">
            Válasz készítése...
          </p>
        )}

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            A válasz elkészítése sikertelen. Próbáld újra.
          </p>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex gap-2 border-t p-4"
      >
        <input
          value={input}
          onChange={event =>
            setInput(event.currentTarget.value)
          }
          placeholder="Kérdezz egy receptet..."
          disabled={isResponding}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />

        <button
          type="submit"
          disabled={!input.trim() || isResponding}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Küldés
        </button>
      </form>
    </section>
  );
}
