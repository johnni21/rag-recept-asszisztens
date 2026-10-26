import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { chunkDocument } from '../lib/ai/chunking';
import {
  evaluatePromptResponse,
  PromptEvaluationInput,
} from './prompt-judge';

async function main() {
  const content = readFileSync(
    'data/recipes/aloo-matar.md',
    'utf8',
  );

  const contexts = chunkDocument(
    content,
    'aloo-matar.md',
    'md',
  )
    .filter(chunk => chunk.section === 'ingredients')
    .map(chunk => ({
      fileName: 'aloo-matar.md',
      section: chunk.section,
      content: chunk.content,
    }));

  assert.ok(contexts.length > 0);

  const question = 'Mennyi kurkuma kell az Aloo Matarhoz?';
  const referenceAnswer = 'Fél teáskanál kurkuma.';

  const cases: Array<{
    id: string;
    input: PromptEvaluationInput;
  }> = [
    {
      id: 'correct-answer',
      input: {
        question,
        answerable: true,
        referenceAnswer,
        contexts,
        answer:
          'Fél teáskanál kurkuma kell hozzá. Forrás: aloo-matar.md',
      },
    },
    {
      id: 'deliberately-wrong-answer',
      input: {
        question,
        answerable: true,
        referenceAnswer,
        contexts,
        answer:
          'A recept szerint 5 evőkanál kurkuma kell hozzá. ' +
          'Forrás: aloo-matar.md',
      },
    },
    {
      id: 'correct-missing-information',
      input: {
        question:
          'A teriyaki-chicken.md szerint hány kalória egy adag?',
        answerable: false,
        referenceAnswer:
          'A recept nem tartalmaz adagonkénti kalóriaadatot.',
        contexts: [],
        answer:
          'A rendelkezésemre álló forrásokban nem találtam ' +
          'adagonkénti kalóriaadatot, így pontos számot nem tudok mondani.',
      },
    },
  ];

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const directory = join('results', 'prompt-judge-check', runId);
  mkdirSync(directory, { recursive: true });

  const rows = [];

  for (const test of cases) {
    const result = await evaluatePromptResponse(test.input);

    writeFileSync(
      join(directory, test.id + '.json'),
      JSON.stringify({ ...test, ...result }, null, 2) + '\n',
    );

    rows.push({
      id: test.id,
      correctness: result.evaluation.answerCorrectnessScore,
      groundedness: result.evaluation.groundednessScore,
      hallucination: result.evaluation.hallucinationDetected,
    });

    if (test.id === 'deliberately-wrong-answer') {
      assert.equal(result.evaluation.hallucinationDetected, true);
      assert.ok(result.evaluation.answerCorrectnessScore <= 1);
      assert.ok(result.evaluation.groundednessScore <= 1);
    } else {
      assert.equal(result.evaluation.hallucinationDetected, false);
      assert.ok(result.evaluation.answerCorrectnessScore >= 2);
      assert.ok(result.evaluation.groundednessScore >= 2);
    }
  }

  console.table(rows);
  console.log('Mindhárom kontrolleset megfelelő értékelést kapott.');
  console.log('Eredmények:', directory);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
