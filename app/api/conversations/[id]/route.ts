import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema/conversations';

export const dynamic = 'force-dynamic';

type RouteContext = {
  params: { id: string };
};

const idSchema = z.string().min(1).max(191);

export async function GET(
  _request: Request,
  { params }: RouteContext,
) {
  const parsed = idSchema.safeParse(params.id);

  if (parsed.success === false) {
    return NextResponse.json(
      { success: false, error: 'Invalid conversation ID.' },
      { status: 400 },
    );
  }

  try {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, parsed.data))
      .limit(1);

    if (conversation === undefined) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      conversation,
    });
  } catch (error) {
    console.error('Conversation loading failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Conversation could not be loaded.',
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  const parsed = idSchema.safeParse(params.id);

  if (parsed.success === false) {
    return NextResponse.json(
      { success: false, error: 'Invalid conversation ID.' },
      { status: 400 },
    );
  }

  try {
    const [deleted] = await db
      .delete(conversations)
      .where(eq(conversations.id, parsed.data))
      .returning({
        id: conversations.id,
        title: conversations.title,
      });

    if (deleted === undefined) {
      return NextResponse.json(
        { success: false, error: 'Conversation not found.' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      conversation: deleted,
      message: 'Conversation deleted successfully.',
    });
  } catch (error) {
    console.error('Conversation deletion failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Conversation could not be deleted.',
      },
      { status: 500 },
    );
  }
}