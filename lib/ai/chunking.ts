export type SupportedFileType = 'md' | 'txt';

export type DocumentChunk = {
  content: string;
  chunkIndex: number;
  section: string | null;
};

const MAX_CHUNK_BODY_LENGTH = 1000;

const splitLongLine = (
  line: string,
  maxBodyLength: number,
): string[] => {
  const parts: string[] = [];
  let current = '';

  for (const word of line.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length <= maxBodyLength) {
      current = candidate;
    } else {
      if (current) {
        parts.push(current);
      }

      current = word;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
};

const groupLines = (
  text: string,
  maxBodyLength: number,
): string[] => {
  const groups: string[] = [];
  let current = '';

  const lines = text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;

    if (candidate.length <= maxBodyLength) {
      current = candidate;
      continue;
    }

    if (current) {
      groups.push(current);
      current = '';
    }

    if (line.length > maxBodyLength) {
      const longLineParts = splitLongLine(line, maxBodyLength);
      groups.push(...longLineParts.slice(0, -1));
      current = longLineParts.at(-1) ?? '';
    } else {
      current = line;
    }
  }

  if (current) {
    groups.push(current);
  }

  return groups;
};

const normalizeSectionName = (value: string): string => {
  return value.trim().replace(/\s+/g, ' ').slice(0, 100);
};

const chunkMarkdown = (
  content: string,
  fileName: string,
  maxBodyLength: number,
): DocumentChunk[] => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const sections: Array<{ name: string; body: string }> = [];

  let title = fileName.replace(/\.md$/i, '');
  let currentSection = 'overview';
  let currentLines: string[] = [];

  const saveSection = () => {
    const body = currentLines.join('\n').trim();

    if (body) {
      sections.push({
        name: normalizeSectionName(currentSection),
        body,
      });
    }

    currentLines = [];
  };

  for (const line of lines) {
    const titleMatch = line.match(/^#\s+(.+)$/);
    const sectionMatch = line.match(/^#{2,6}\s+(.+)$/);

    if (titleMatch) {
      title = titleMatch[1].trim();
      continue;
    }

    if (sectionMatch) {
      saveSection();
      currentSection = sectionMatch[1].trim();
      continue;
    }

    currentLines.push(line);
  }

  saveSection();

  const chunks: DocumentChunk[] = [];

  for (const section of sections) {
    for (const part of groupLines(section.body, maxBodyLength)) {
      chunks.push({
        chunkIndex: chunks.length,
        section: section.name,
        content: [
          `Document: ${fileName}`,
          `Title: ${title}`,
          `Section: ${section.name}`,
          '',
          part,
        ].join('\n'),
      });
    }
  }

  return chunks;
};

const chunkText = (
  content: string,
  fileName: string,
  maxBodyLength: number,
): DocumentChunk[] => {
  return groupLines(
    content.replace(/\r\n/g, '\n'),
    maxBodyLength,
  ).map((part, chunkIndex) => ({
    chunkIndex,
    section: 'text',
    content: [`Document: ${fileName}`, '', part].join('\n'),
  }));
};

export const chunkDocument = (
  content: string,
  fileName: string,
  fileType: SupportedFileType,
  maxBodyLength = MAX_CHUNK_BODY_LENGTH,
): DocumentChunk[] => {
  if (!Number.isInteger(maxBodyLength) || maxBodyLength < 100) {
    throw new Error(
      'Chunk body length must be an integer of at least 100.',
    );
  }

  const normalizedContent = content.trim();

  if (!normalizedContent) {
    return [];
  }

  return fileType === 'md'
    ? chunkMarkdown(normalizedContent, fileName, maxBodyLength)
    : chunkText(normalizedContent, fileName, maxBodyLength);
};
