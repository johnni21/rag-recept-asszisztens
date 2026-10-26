'use client';

import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
} from 'ai';
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  getConversation,
  SavedConversation,
} from '@/lib/chat/client';

type ChatInterfaceProps = {
  conversation?: SavedConversation;
  onSaved?: (conversation: SavedConversation) => void;
  onBusyChange?: (busy: boolean) => void;
  onReload?: () => void;
};

export function ChatInterface({
  conversation,
  onSaved,
  onBusyChange,
  onReload,
}: ChatInterfaceProps = {}) {
  const [input, setInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const revisionRef = useRef(conversation?.revision ?? 0);
  const conversationId = conversation?.id;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => {
          const message = messages[messages.length - 1];

          if (
            conversationId === undefined ||
            message === undefined ||
            message.role !== 'user'
          ) {
            throw new Error('Nem küldhető el az üzenet.');
          }

          return {
            body: {
              conversationId,
              revision: revisionRef.current,
              message,
            },
          };
        },
      }),
    [conversationId],
  );

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
  } = useChat({
    id: conversationId ?? 'unselected',
    messages: conversation?.messages ?? [],
    transport,
    onFinish: async ({ message }) => {
      if (conversationId === undefined) {
        return;
      }

      setIsSaving(true);
      setSaveError(null);

      const expectedRevision = revisionRef.current;

      try {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const saved = await getConversation(conversationId);

          const responseSaved = saved.messages.some(
            item =>
              item.id === message.id &&
              item.role === 'assistant',
          );

          if (responseSaved) {
            revisionRef.current = saved.revision;
            setMessages(saved.messages);
            onSaved?.(saved);
            return;
          }

          if (saved.revision > expectedRevision) {
            throw new Error(
              'A beszélgetés egy másik ablakban megváltozott. ' +
                'Töltsd újra a folytatáshoz.',
            );
          }

          await new Promise(resolve => setTimeout(resolve, 250));
        }

        throw new Error(
          'A válasz mentését nem sikerült ellenőrizni. ' +
            'Töltsd újra a beszélgetést.',
        );
      } catch (caught) {
        setSaveError(
          caught instanceof Error
            ? caught.message
            : 'A beszélgetés mentése sikertelen.',
        );
      } finally {
        setIsSaving(false);
      }
    },
  });

  const isResponding =
    status === 'submitted' || status === 'streaming';

  const isBusy = isResponding || isSaving;

  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  const handleSubmit = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const text = input.trim();

    if (
      text.length === 0 ||
      isBusy ||
      conversationId === undefined ||
      saveError !== null
    ) {
      return;
    }

    setInput('');

    void sendMessage({ text }).catch(() => {
      setInput(text);
    });
  };

  return (
    <section className="flex min-h-[700px] flex-col rounded-xl border bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b p-5">
        <div className="min-w-0">
          <h2 className="break-words text-xl font-semibold">
            {conversation?.title ?? 'Receptasszisztens'}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Kérdezz receptekről vagy adj meg hozzávalókat.
          </p>
        </div>

        {conversation && onReload && (
          <button
            type="button"
            onClick={onReload}
            disabled={isBusy}
            className="shrink-0 rounded-md border px-3 py-2 text-sm disabled:opacity-50"
          >
            Újratöltés
          </button>
        )}
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {conversation === undefined && (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Válassz egy beszélgetést, vagy indíts újat.
          </p>
        )}

        {conversation && messages.length === 0 && (
          <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Például: „Mit főzhetek krumpliból és zöldborsóból?”
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
                            {JSON.stringify(part.input, null, 2)}
                          </pre>

                          {part.state === 'output-available' && (
                            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-emerald-800">
                              Találatok:{' '}
                              {JSON.stringify(part.output, null, 2)}
                            </pre>
                          )}

                          {part.state === 'output-error' && (
                            <p className="mt-2 text-red-700">
                              A keresés sikertelen volt.
                            </p>
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

        {isSaving && (
          <p className="text-sm text-zinc-500">
            Beszélgetés mentése...
          </p>
        )}

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            A válasz elkészítése sikertelen. Ha a beszélgetés
            másik ablakban változott, töltsd újra.
          </p>
        )}

        {saveError && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {saveError}
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
          disabled={
            conversation === undefined ||
            isBusy ||
            saveError !== null
          }
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:bg-zinc-100"
        />

        <button
          type="submit"
          disabled={
            conversation === undefined ||
            input.trim().length === 0 ||
            isBusy ||
            saveError !== null
          }
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Küldés
        </button>
      </form>
    </section>
  );
}