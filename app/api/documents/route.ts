import { count, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import {
  embeddings,
  resources,
} from '@/lib/db/schema/resources';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const documents = await db
      .select({
        id: resources.id,
        fileName: resources.fileName,
        fileType: resources.fileType,
        fileSize: resources.fileSize,
        status: resources.status,
        errorMessage: resources.errorMessage,
        chunkCount: count(embeddings.id),
        createdAt: resources.createdAt,
        updatedAt: resources.updatedAt,
        processedAt: resources.processedAt,
      })
      .from(resources)
      .leftJoin(
        embeddings,
        eq(embeddings.resourceId, resources.id),
      )
      .groupBy(resources.id)
      .orderBy(desc(resources.createdAt));

    return NextResponse.json({
      success: true,
      documents,
    });
  } catch (error) {
    console.error('Document listing failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'The documents could not be loaded.',
      },
      { status: 500 },
    );
  }
}
