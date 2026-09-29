import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema/resources';

export const runtime = 'nodejs';

type RouteContext = {
  params: {
    id: string;
  };
};

export async function DELETE(
  _request: Request,
  { params }: RouteContext,
) {
  try {
    const documentId = params.id.trim();

    if (!documentId) {
      return NextResponse.json(
        {
          success: false,
          error: 'The document ID is required.',
        },
        { status: 400 },
      );
    }

    const [document] = await db
      .select({
        id: resources.id,
        fileName: resources.fileName,
      })
      .from(resources)
      .where(eq(resources.id, documentId))
      .limit(1);

    if (!document) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found.',
        },
        { status: 404 },
      );
    }

    await db
      .delete(resources)
      .where(eq(resources.id, documentId));

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully.',
      document,
    });
  } catch (error) {
    console.error('Document deletion failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'The document could not be deleted.',
      },
      { status: 500 },
    );
  }
}
