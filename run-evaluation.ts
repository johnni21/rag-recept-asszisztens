import 'dotenv/config';

import { mkdir, readFile, writeFile } from 'node:fs/promises';

import {
  baselineSystemPrompt,
  improvedSystemPrompt,
} from './lib/ai/prompts';
import { createSimulatedUsers, runSimulation } from './simulation';
import { evaluateConversation } from './evaluation';

const readSavedJson = async <T>(path: string): Promise<T | null> => {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

const saveJson = async (path: string, value: unknown) => {
  await writeFile(path, JSON.stringify(value, null, 2) + '\n', {
    flag: 'wx',
  });
};

const main = async () => {
  const variant = process.argv[2] ?? 'baseline';

if (variant !== 'baseline' && variant !== 'improved') {
  throw new Error('A változat csak baseline vagy improved lehet.');
}

const systemPrompt =
  variant === 'baseline'
    ? baselineSystemPrompt
    : improvedSystemPrompt;

const directory = `results/${variant}`;
  await mkdir(directory, { recursive: true });

  // Megőrizzük a pontos promptot, amellyel a mérés készült.
  const savedPrompt = await readSavedJson<{ systemPrompt: string }>(
    `${directory}/config.json`,
  );

  if (savedPrompt) {
    if (savedPrompt.systemPrompt !== systemPrompt) {
      throw new Error(
        'A baseline prompt megváltozott a mentett méréshez képest.',
      );
    }
  } else {
    await saveJson(`${directory}/config.json`, {
      assistantModel: 'gpt-5',
      simulatedUserModel: 'gpt-4.1-mini',
      judgeModel: 'gpt-4.1-mini',
      systemPrompt: systemPrompt,
      createdAt: new Date().toISOString(),
    });
  }

  for (const user of createSimulatedUsers()) {
    const conversationPath =
      `${directory}/${user.id}.conversation.json`;
    const evaluationPath =
      `${directory}/${user.id}.evaluation.json`;

    let simulation = await readSavedJson<
      Awaited<ReturnType<typeof runSimulation>>
    >(conversationPath);

    if (!simulation) {
      simulation = await runSimulation(user, systemPrompt);
      await saveJson(conversationPath, simulation);
    } else {
      console.log(`[${user.id}] Mentett beszélgetés betöltve.`);
    }

    let evaluation = await readSavedJson<
      Awaited<ReturnType<typeof evaluateConversation>>
    >(evaluationPath);

    if (!evaluation) {
      evaluation = await evaluateConversation({
        persona: simulation.persona,
        goal: simulation.goal,
        conversation: simulation.conversation,
      });

      await saveJson(evaluationPath, evaluation);
    } else {
      console.log(`[${user.id}] Mentett értékelés betöltve.`);
    }

    console.log({
      persona: user.id,
      score: evaluation.detailFitScore,
      goalAchieved: evaluation.goalAchieved,
      userSatisfied: simulation.userSatisfied,
    });
  }
};

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Az evaluáció futtatása sikertelen:', error);
    process.exit(1);
  });
  