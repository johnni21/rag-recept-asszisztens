'use client';

import {
  useCallback,
  useEffect,
  useState,
} from 'react';

import { ChatInterface } from '@/components/chat-interface';
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
} from '@/lib/chat/client';
import type {
  ConversationSummary,
  SavedConversation,
} from '@/lib/chat/client';

const STORAGE_KEY = 'recipe-assistant-conversation';

const rememberConversation = (id?: string) => {
  try {
    if (id === undefined) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, id);
    }
  } catch {
    // A beszélgetés ettől még elérhető az adatbázisban.
  }
};

const getRememberedConversation = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

const toSummary = (
  conversation: SavedConversation,
): ConversationSummary => ({
  id: conversation.id,
  title: conversation.title,
  revision: conversation.revision,
  createdAt: conversation.createdAt,
  updatedAt: conversation.updatedAt,
  messageCount: conversation.messages.length,
});

export function ConversationManager() {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [active, setActive] = useState<SavedConversation>();
  const [reloadKey, setReloadKey] = useState(0);
  const [isWorking, setIsWorking] = useState(true);
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = isWorking || isChatBusy;

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const conversations = await listConversations();
        const rememberedId = getRememberedConversation();

        const selected =
          conversations.find(item => item.id === rememberedId) ??
          conversations[0];

        const conversation = selected
          ? await getConversation(selected.id)
          : undefined;

        if (cancelled) {
          return;
        }

        setItems(conversations);
        setActive(conversation);

        if (conversation) {
          rememberConversation(conversation.id);
        }
      } catch (caught) {
        if (cancelled === false) {
          setError(
            caught instanceof Error
              ? caught.message
              : 'A beszélgetések betöltése sikertelen.',
          );
        }
      } finally {
        if (cancelled === false) {
          setIsWorking(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, []);

  const selectConversation = (conversation: SavedConversation) => {
    setActive(conversation);
    setReloadKey(value => value + 1);
    rememberConversation(conversation.id);
  };

  const handleCreate = async () => {
    if (disabled) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const conversation = await createConversation();

      setItems(previous => [
        toSummary(conversation),
        ...previous,
      ].slice(0, 100));

      selectConversation(conversation);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Az új beszélgetés létrehozása sikertelen.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleOpen = async (id: string) => {
    if (disabled || id.length === 0) {
      return;
    }

    setIsWorking(true);
    setError(null);

    try {
      const conversation = await getConversation(id);
      selectConversation(conversation);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'A beszélgetés betöltése sikertelen.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleDelete = async () => {
    if (disabled || active === undefined) {
      return;
    }

    if (
      window.confirm(
        'Biztosan törlöd ezt a beszélgetést és az üzeneteit?',
      ) === false
    ) {
      return;
    }

    const id = active.id;

    setIsWorking(true);
    setError(null);

    try {
      await deleteConversation(id);
      setItems(previous => previous.filter(item => item.id !== id));
      setActive(undefined);
      setReloadKey(value => value + 1);
      rememberConversation();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'A beszélgetés törlése sikertelen.',
      );
    } finally {
      setIsWorking(false);
    }
  };

  const handleSaved = useCallback(
    (conversation: SavedConversation) => {
      setActive(current =>
        current?.id === conversation.id
          ? conversation
          : current,
      );

      setItems(previous => [
        toSummary(conversation),
        ...previous.filter(item => item.id !== conversation.id),
      ].slice(0, 100));
    },
    [],
  );

  return (
    <section className="min-w-0 space-y-4">
      <div className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Beszélgetések
          </h2>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={disabled}
              className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              Új beszélgetés
            </button>

            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={disabled || active === undefined}
              className="rounded-md border px-3 py-2 text-sm text-red-700 disabled:opacity-50"
            >
              Törlés
            </button>
          </div>
        </div>

        <select
          aria-label="Beszélgetés kiválasztása"
          value={active?.id ?? ''}
          onChange={event =>
            void handleOpen(event.currentTarget.value)
          }
          disabled={disabled}
          className="w-full min-w-0 rounded-md border px-3 py-2 text-sm disabled:bg-zinc-100"
        >
          <option value="">Válassz beszélgetést...</option>

          {items.map(item => (
            <option key={item.id} value={item.id}>
              {item.title} ({item.messageCount} üzenet)
            </option>
          ))}
        </select>

        {isWorking && (
          <p className="text-sm text-zinc-500">
            Beszélgetések betöltése...
          </p>
        )}

        {isWorking === false && items.length === 0 && (
          <p className="text-sm text-zinc-600">
            Még nincs mentett beszélgetés. Indíts egy újat.
          </p>
        )}

        {error && (
          <p className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>

      <fieldset disabled={isWorking} className="min-w-0">
        <ChatInterface
          key={`${active?.id ?? 'empty'}-${reloadKey}`}
          conversation={active}
          onSaved={handleSaved}
          onBusyChange={setIsChatBusy}
          onReload={() => {
            if (active) {
              void handleOpen(active.id);
            }
          }}
        />
      </fieldset>
    </section>
  );
}