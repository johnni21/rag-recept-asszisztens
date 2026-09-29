import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { resources } from '@/lib/db/schema/resources';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['md', 'txt']);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: 'No file was provided.',
        },
        { status: 400 },
      );
    }

    const fileName = file.name.split(/[\\/]/).pop()?.trim() ?? '';
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

    if (!fileName) {
      return NextResponse.json(
        {
          success: false,
          error: 'The file name is missing.',
        },
        { status: 400 },
      );
    }

    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Only .md and .txt files are supported.',
        },
        { status: 415 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'The uploaded file is empty.',
        },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: 'The uploaded file exceeds the 1 MB size limit.',
        },
        { status: 413 },
      );
    }

    const content = await file.text();

    if (!content.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'The uploaded file contains no readable text.',
        },
        { status: 400 },
      );
    }

    const [existingDocument] = await db
      .select({ id: resources.id })
      .from(resources)
      .where(eq(resources.fileName, fileName))
      .limit(1);

    if (existingDocument) {
      return NextResponse.json(
        {
          success: false,
          error: 'A document with this file name already exists.',
        },
        { status: 409 },
      );
    }

    const fileType = extension === 'md' ? 'md' : 'txt';

    const [document] = await db
      .insert(resources)
      .values({
        fileName,
        fileType,
        fileSize: file.size,
        content,
        status: 'uploaded',
      })
      .returning({
        id: resources.id,
        fileName: resources.fileName,
        fileType: resources.fileType,
        fileSize: resources.fileSize,
        status: resources.status,
        createdAt: resources.createdAt,
      });

    return NextResponse.json(
      {
        success: true,
        document,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Document upload failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'The document could not be uploaded.',
      },
      { status: 500 },
    );
  }
}
