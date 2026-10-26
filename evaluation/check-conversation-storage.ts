import assert from 'node:assert/strict';

import type { UIMessage } from 'ai';
import { eq, sql } from 'drizzle-orm';

import {
  ConversationConflictError,
  loadConversation,
  saveConversationMessages,
} from '@/lib/chat/conversations';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema/conversations';

async function main() {
  let testConversationId: string | undefined;

  try {
    const [created] = await db
      .insert(conversations)
      .values({ title: 'Automatikus mentési próba' })
      .returning();

    assert.ok(created);
    testConversationId = created.id;

    const firstMessages: UIMessage[] = [
      {
        id: 'storage-user-1',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Első kérdés: árvíztűrő tükörfúrógép.',
          },
        ],
      },
      {
        id: 'storage-assistant-1',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Első válasz.',
          },
        ],
      },
    ];

    const checkStoredMessages = async (
      expectedMessages: UIMessage[],
      expectedRevision: number,
    ) => {
      const [stored] = await db
        .select({
          storedType: sql<string>`
            jsonb_typeof(${conversations.messages})
          `,
        })
        .from(conversations)
        .where(eq(conversations.id, created.id));

      assert.equal(
        stored?.storedType,
        'array',
        'Az adatbázisnak JSON-tömböt kell tárolnia.',
      );

      const loaded = await loadConversation(created.id);

      assert.ok(loaded);
      assert.equal(loaded.revision, expectedRevision);
      assert.deepEqual(loaded.messages, expectedMessages);
    };

    await saveConversationMessages({
      id: created.id,
      expectedRevision: 0,
      messages: firstMessages,
    });

    await checkStoredMessages(firstMessages, 1);
    console.log('Első mentés: JSON-tömb, 2 üzenet.');

    await assert.rejects(
      () =>
        saveConversationMessages({
          id: created.id,
          expectedRevision: 0,
          messages: [],
        }),
      ConversationConflictError,
    );

    await checkStoredMessages(firstMessages, 1);
    console.log('Elavult verzió: elutasítva, az üzenetek megmaradtak.');

    const secondMessages: UIMessage[] = [
      ...firstMessages,
      {
        id: 'storage-user-2',
        role: 'user',
        parts: [
          {
            type: 'text',
            text: 'Második kérdés.',
          },
        ],
      },
      {
        id: 'storage-assistant-2',
        role: 'assistant',
        parts: [
          {
            type: 'text',
            text: 'Második válasz.',
          },
        ],
      },
    ];

    await saveConversationMessages({
      id: created.id,
      expectedRevision: 1,
      messages: secondMessages,
    });

    await checkStoredMessages(secondMessages, 2);
    console.log('Második mentés: JSON-tömb, 4 üzenet.');
  } finally {
    if (testConversationId) {
      await db
        .delete(conversations)
        .where(eq(conversations.id, testConversationId));

      console.log('Az ideiglenes tesztbeszélgetés törölve.');
    }
  }

  console.log('Minden beszélgetésmentési ellenőrzés sikeres.');
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  },
);