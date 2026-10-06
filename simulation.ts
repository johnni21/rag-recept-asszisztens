import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, type ModelMessage } from 'ai';

import { getAssistantConfig } from '@/lib/ai/assistant';
import { z } from 'zod';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface SimulatedUser {
  id: string;
  persona: string;
  goal: string;
  patience: number;
  initialQuestion: string;
  conversationHistory: Message[];
}

export const createSimulatedUsers = (): SimulatedUser[] => [
  {
    id: 'impatient-beginner',
    persona:
      'Türelmetlen kezdő. Rövid, egyszerű válaszokat szeretne. ' +
      'Ha túl hosszú a válasz, kéri a lényeg összefoglalását.',
    goal:
      'Megérteni a chicken-schnitzel recept elkészítését ' +
      'legfeljebb 5 rövid lépésben.',
    patience: 1,
    initialQuestion:
      'Hogyan készítsek chicken-schnitzelt? ' +
      'Kezdő vagyok, csak 5 rövid lépést kérek.',
    conversationHistory: [],
  },
  {
    id: 'patient-beginner',
    persona:
      'Türelmes kezdő. Részletes, egyszerű magyarázatot szeretne. ' +
      'Visszakérdez, ha egy főzési művelet nem világos.',
    goal:
      'Megérteni a chicken-schnitzel elkészítését, ' +
      'különösen a panírozás sorrendjét és menetét.',
    patience: 5,
    initialQuestion:
      'Először készítek chicken-schnitzelt. ' +
      'Kérlek, részletesen és egyszerűen magyarázd el az elkészítését.',
    conversationHistory: [],
  },
  {
    id: 'experienced-cook',
    persona:
      'Tapasztalt szakács. Tömör, konkrét válaszokat szeretne. ' +
      'Az alapvető konyhai műveleteket már ismeri.',
    goal:
      'Megtudni az Aloo Matar recept fűszereit ' +
      'és azt, hogy mikor kerülnek az ételbe.',
    patience: 3,
    initialQuestion:
      'Az Aloo Matar fűszerezése érdekel. ' +
      'Milyen fűszerek kellenek, és mikor adjam hozzá őket? ' +
      'Az alaplépéseket ismerem, tömören válaszolj.',
    conversationHistory: [],
  },
];

export interface UserReaction {
  message: string;
  satisfied: boolean;
  done: boolean;
  reason: string;
}

export const buildUserPrompt = (user: SimulatedUser): string => `
Te egy szimulált felhasználó vagy, aki receptasszisztenssel beszélget.
- Az első asszisztensválasz után még tegyél fel egy releváns
  pontosító kérdést, és legyen done=false. Legalább két kör legyen.

Személyiséged:
${user.persona}

Célod:
${user.goal}

Türelmed: ${user.patience}/5.

A beszélgetés eddig:
${JSON.stringify(user.conversationHistory, null, 2)}

Feladatod:
Reagálj az asszisztens legutóbbi válaszára magyarul.

Szabályok:
- Maradj a megadott személyiségednél és célodnál.
- A válasz részletességét a saját igényeid alapján ítéld meg.
- Ha túl hosszú vagy túl rövid, kérj konkrét változtatást.
- Ha valami nem világos, kérdezz vissza.
- Ne találj ki hibát, ha a válasz megfelelő.
- Ne válaszold meg magad a receptes kérdést.
- Ha a célod teljesült, elégedetten zárd le a beszélgetést.
- Ha elfogyott a türelmed, elégedetlenül is lezárhatod.
- Az alacsony türelem nem jelent automatikus elégedetlenséget.

A döntés mezői:
- message: a következő üzeneted vagy az elköszönésed.
- satisfied: teljesült-e a célod a kívánt részletességgel.
- done: befejeznéd-e a beszélgetést.
- reason: rövid indoklás a döntésedhez.
`.trim();

const userReactionSchema = z.object({
  message: z.string().trim().min(1),
  satisfied: z.boolean(),
  done: z.boolean(),
  reason: z.string().trim().min(1),
});

export const generateUserReaction = async (
  user: SimulatedUser,
): Promise<UserReaction> => {
  const lastMessage =
    user.conversationHistory[user.conversationHistory.length - 1];

  if (!lastMessage || lastMessage.role !== 'assistant') {
    throw new Error(
      'A user reakciójához előbb asszisztensválasz szükséges.',
    );
  }

  const { object } = await generateObject({
    model: openai('gpt-4.1-mini'),
    schema: userReactionSchema,
    prompt: buildUserPrompt(user),
    temperature: 0,
    maxRetries: 0,
  });

  return object;
};

export const runSimulation = async (
  user: SimulatedUser,
  systemPrompt: string,
) => {
  const modelMessages: ModelMessage[] = [
    { role: 'user', content: user.initialQuestion },
  ];

  user.conversationHistory.push({
    role: 'user',
    content: user.initialQuestion,
  });

  const reactions: UserReaction[] = [];
  const startedAt = Date.now();

  for (let turn = 1; turn <= 4; turn++) {
    console.log(`[${user.id}] ${turn}. kör`);

    const result = await generateText({
      ...getAssistantConfig(systemPrompt),
      messages: modelMessages,
      maxRetries: 0,
    });

    if (!result.text.trim()) {
      throw new Error(
        `[${user.id}] Az asszisztens nem adott szöveges választ.`,
      );
    }

    // A tool-hívásokat és eredményeiket is megőrizzük.
    modelMessages.push(...result.response.messages);

    user.conversationHistory.push({
      role: 'assistant',
      content: result.text,
    });

    const reaction = await generateUserReaction(user);
    reactions.push(reaction);

    user.conversationHistory.push({
      role: 'user',
      content: reaction.message,
    });

    if (reaction.done && turn >= 2) {
      break;
    }

    modelMessages.push({
      role: 'user',
      content: reaction.message,
    });
  }

  const lastReaction = reactions[reactions.length - 1];

  return {
    personaId: user.id,
    persona: user.persona,
    goal: user.goal,
    patience: user.patience,
    turns: reactions.length,
    durationMs: Date.now() - startedAt,
    userSatisfied: lastReaction.satisfied,
    endedByUser: lastReaction.done,
    stopReason: lastReaction.done ? 'user-finished' : 'turn-limit',
    conversation: user.conversationHistory,
    reactions,
    modelMessages,
  };
};