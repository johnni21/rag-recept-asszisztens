import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { generateEmbeddings } from '@/lib/ai/embedding';
import { db } from '@/lib/db';
import {
  embeddings,
  resources,
} from '@/lib/db/schema/resources';

export const runtime = 'nodejs';
export const maxDuration = 60;

const processRequestSchema = z.object({
  documentId: z.string().trim().min(1),
});

const markAsFailed = async (
  documentId: string,
  errorMessage: string,
) => {
  await db
    .update(resources)
    .set({
      status: 'failed',
      errorMessage,
      updatedAt: new Date(),
    })
    .where(eq(resources.id, documentId));
};

export async function POST(request: Request) {
  let activeDocumentId: string | null = null;

  try {
    let requestBody: unknown;

    try {
      requestBody = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'The request body must be valid JSON.',
        },
        { status: 400 },
      );
    }

    const validationResult =
      processRequestSchema.safeParse(requestBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'A valid documentId is required.',
        },
        { status: 400 },
      );
    }

    const { documentId } = validationResult.data;
    activeDocumentId = documentId;

    const [document] = await db
      .select()
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

    if (document.status === 'processing') {
      return NextResponse.json(
        {
          success: false,
          error: 'The document is already being processed.',
        },
        { status: 409 },
      );
    }

    if (
      document.fileType !== 'md' &&
      document.fileType !== 'txt'
    ) {
      await markAsFailed(
        documentId,
        'The stored file type is not supported.',
      );

      return NextResponse.json(
        {
          success: false,
          error: 'The stored file type is not supported.',
        },
        { status: 422 },
      );
    }

    await db
      .update(resources)
      .set({
        status: 'processing',
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(resources.id, documentId));

    let generatedEmbeddings;

    try {
      generatedEmbeddings = await generateEmbeddings(
        document.content,
        document.fileName,
        document.fileType,
      );
    } catch (error) {
      console.error('Embedding generation failed:', error);

      await markAsFailed(
        documentId,
        'Embedding generation failed.',
      );

      return NextResponse.json(
        {
          success: false,
          error: 'Embedding generation failed.',
        },
        { status: 502 },
      );
    }

    if (generatedEmbeddings.length === 0) {
      await markAsFailed(
        documentId,
        'The document did not produce any chunks.',
      );

      return NextResponse.json(
        {
          success: false,
          error: 'The document did not produce any chunks.',
        },
        { status: 422 },
      );
    }

    const processedAt = new Date();

    await db.transaction(async transaction => {
      await transaction
        .delete(embeddings)
        .where(eq(embeddings.resourceId, documentId));

      await transaction.insert(embeddings).values(
        generatedEmbeddings.map(item => ({
          resourceId: documentId,
          content: item.content,
          chunkIndex: item.chunkIndex,
          section: item.section,
          embedding: item.embedding,
        })),
      );

      await transaction
        .update(resources)
        .set({
          status: 'processed',
          errorMessage: null,
          processedAt,
          updatedAt: processedAt,
        })
        .where(eq(resources.id, documentId));
    });

    return NextResponse.json({
      success: true,
      documentId,
      status: 'processed',
      chunkCount: generatedEmbeddings.length,
    });
  } catch (error) {
    console.error('Document processing failed:', error);

    if (activeDocumentId) {
      try {
        await markAsFailed(
          activeDocumentId,
          'Document processing failed.',
        );
      } catch (statusUpdateError) {
        console.error(
          'Failed to update document status:',
          statusUpdateError,
        );
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: 'The document could not be processed.',
      },
      { status: 500 },
    );
  }
}
