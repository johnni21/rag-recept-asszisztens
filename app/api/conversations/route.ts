import { desc, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema/conversations';

export const dynamic = 'force-dynamic';

const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
}).strict();

export async function GET() {
  try {
    const items = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        revision: conversations.revision,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        messageCount: sql<number>`
          jsonb_array_length(${conversations.messages})
        `,
      })
      .from(conversations)
      .orderBy(
        desc(conversations.updatedAt),
        desc(conversations.id),
      )
      .limit(100);

    return NextResponse.json({
      success: true,
      conversations: items,
    });
  } catch (error) {
    console.error('Conversation listing failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Conversations could not be loaded.',
      },
      { status: 500 },
    );
  }
}

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

  const parsed = createConversationSchema.safeParse(body);

  if (parsed.success === false) {
    return NextResponse.json(
      {
        success: false,
        error: 'Title must be between 1 and 200 characters.',
      },
      { status: 400 },
    );
  }

  try {
    const [conversation] = await db
      .insert(conversations)
      .values({
        title: parsed.data.title ?? 'Új beszélgetés',
      })
      .returning();

    return NextResponse.json(
      {
        success: true,
        conversation,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Conversation creation failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Conversation could not be created.',
      },
      { status: 500 },
    );
  }
}
