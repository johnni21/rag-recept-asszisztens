import {
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

const API_BASE_URL =
  process.env.APP_URL ?? 'http://localhost:3000';
const RECIPES_DIRECTORY = './data/recipes';

type DocumentSummary = {
  id: string;
  fileName: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
};

type DocumentsResponse = {
  success: boolean;
  documents: DocumentSummary[];
};

type UploadResponse = {
  success: boolean;
  document?: DocumentSummary;
  error?: string;
};

type ProcessResponse = {
  success: boolean;
  documentId?: string;
  status?: string;
  chunkCount?: number;
  error?: string;
};

const getDocuments = async (): Promise<DocumentSummary[]> => {
  const response = await fetch(`${API_BASE_URL}/api/documents`);

  if (!response.ok) {
    throw new Error(
      `Document listing failed with HTTP ${response.status}.`,
    );
  }

  const data = (await response.json()) as DocumentsResponse;
  return data.documents;
};

const uploadRecipe = async (
  fileName: string,
  content: string,
): Promise<DocumentSummary> => {
  const formData = new FormData();

  formData.append(
    'file',
    new File([content], fileName, {
      type: 'text/markdown',
    }),
  );

  const response = await fetch(
    `${API_BASE_URL}/api/upload`,
    {
      method: 'POST',
      body: formData,
    },
  );

  const data = (await response.json()) as UploadResponse;

  if (!response.ok || !data.document) {
    throw new Error(
      data.error ??
        `Upload failed with HTTP ${response.status}.`,
    );
  }

  return data.document;
};

const processRecipe = async (
  documentId: string,
): Promise<ProcessResponse> => {
  const response = await fetch(
    `${API_BASE_URL}/api/process`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documentId }),
    },
  );

  const data = (await response.json()) as ProcessResponse;

  if (!response.ok) {
    throw new Error(
      data.error ??
        `Processing failed with HTTP ${response.status}.`,
    );
  }

  return data;
};

const main = async () => {
  const files = readdirSync(RECIPES_DIRECTORY)
    .filter(file => file.endsWith('.md'))
    .sort();

  const documents = await getDocuments();
  const documentsByName = new Map(
    documents.map(document => [document.fileName, document]),
  );

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let totalChunks = 0;

  for (const fileName of files) {
    try {
      const existingDocument = documentsByName.get(fileName);

      if (existingDocument?.status === 'processed') {
        console.log(`SKIP ${fileName}`);
        skipped += 1;
        continue;
      }

      const document =
        existingDocument ??
        (await uploadRecipe(
          fileName,
          readFileSync(
            join(RECIPES_DIRECTORY, fileName),
            'utf8',
          ),
        ));

      const result = await processRecipe(document.id);

      processed += 1;
      totalChunks += result.chunkCount ?? 0;

      console.log(
        `OK   ${fileName} (${result.chunkCount ?? 0} chunks)`,
      );
    } catch (error) {
      failed += 1;

      console.error(
        `FAIL ${fileName}:`,
        error instanceof Error
          ? error.message
          : 'Unknown error',
      );
    }
  }

  console.log('');
  console.log(`Documents found: ${files.length}`);
  console.log(`Processed: ${processed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
  console.log(`New chunks: ${totalChunks}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
};

main().catch(error => {
  console.error('Recipe seed failed:', error);
  process.exitCode = 1;
});
