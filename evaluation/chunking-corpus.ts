import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { chunkDocument } from '../lib/ai/chunking';

export type EvaluationChunk = {
  chunkId: string;
  chunkIndex: number;
  fileName: string;
  section: string | null;
  content: string;
};

const hashText = (text: string): string =>
  createHash('sha256').update(text).digest('hex');

export const buildChunkingCorpus = (
  maxBodyLength: number,
) => {
  const directory = 'data/recipes';

  const files = readdirSync(directory)
    .filter(file => file.endsWith('.md'))
    .sort();

  if (files.length === 0) {
    throw new Error('No recipe files found.');
  }

  const chunks: EvaluationChunk[] = [];

  for (const fileName of files) {
    const content = readFileSync(
      join(directory, fileName),
      'utf8',
    );

    const documentChunks = chunkDocument(
      content,
      fileName,
      'md',
      maxBodyLength,
    );

    for (const chunk of documentChunks) {
      const identity = JSON.stringify({
        fileName,
        chunkIndex: chunk.chunkIndex,
        section: chunk.section,
        content: chunk.content,
      });

      chunks.push({
        chunkId: hashText(identity),
        chunkIndex: chunk.chunkIndex,
        fileName,
        section: chunk.section,
        content: chunk.content,
      });
    }
  }

  return {
    maxBodyLength,
    documentCount: files.length,
    chunkCount: chunks.length,
    corpusHash: hashText(JSON.stringify(chunks)),
    chunks,
  };
};
