type Source = {
  fileName: string;
  section: string | null;
};

const sourceKey = (source: Source): string =>
  JSON.stringify([source.fileName, source.section]);

export const calculateRetrievalMetrics = (
  retrieved: Source[],
  relevant: Source[],
  k = 4,
) => {
  if (!Number.isInteger(k) || k < 1) {
    throw new Error('k must be a positive integer.');
  }

  const relevantKeys = new Set(relevant.map(sourceKey));

  if (relevantKeys.size === 0) {
    throw new Error('At least one relevant source is required.');
  }

  // Egy fájl azonos szakasza csak egy találatnak számít.
  const seen = new Set<string>();
  const uniqueRetrieved: string[] = [];

  for (const source of retrieved) {
    const key = sourceKey(source);

    if (!seen.has(key)) {
      seen.add(key);
      uniqueRetrieved.push(key);
    }
  }

  const topK = uniqueRetrieved.slice(0, k);
  const hits = topK.filter(key => relevantKeys.has(key)).length;
  const firstRelevantIndex = topK.findIndex(key =>
    relevantKeys.has(key),
  );

  return {
    precisionAtK: hits / k,
    recallAtK: hits / relevantKeys.size,
    reciprocalRankAtK:
      firstRelevantIndex === -1
        ? 0
        : 1 / (firstRelevantIndex + 1),
    returnedPrecision:
      topK.length === 0 ? 0 : hits / topK.length,
    returnedCount: topK.length,
  };
};
