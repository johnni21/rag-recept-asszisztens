import { desc } from 'drizzle-orm';
import Link from 'next/link';

import { db } from '@/lib/db';
import { chatMetrics } from '@/lib/db/schema/chat-metrics';

export const dynamic = 'force-dynamic';

const SAMPLE_LIMIT = 100;

const formatNumber = (value: number) =>
  value.toLocaleString('hu-HU');

const formatSeconds = (value: number | null) =>
  value === null
    ? '–'
    : `${(value / 1000).toLocaleString('hu-HU', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} s`;

const formatCost = (value: number) =>
  `${value.toLocaleString('hu-HU', {
    minimumFractionDigits: 6,
    maximumFractionDigits: 10,
  })} USD`;

const mean = (values: Array<number | null>) => {
  const known = values.filter(
    (value): value is number => value !== null,
  );

  return known.length === 0
    ? null
    : known.reduce((sum, value) => sum + value, 0) /
        known.length;
};

const outcomeLabels = {
  saved: 'Mentve',
  'not-saved': 'Nem mentett válasz',
  'save-failed': 'Beszélgetésmentési hiba',
};

export default async function MonitoringPage() {
  const rows = await db
    .select()
    .from(chatMetrics)
    .orderBy(desc(chatMetrics.createdAt), desc(chatMetrics.id))
    .limit(SAMPLE_LIMIT);

  const events = rows.flatMap(row => row.usage);

  const inputTokens = events.reduce(
    (sum, event) => sum + (event.inputTokens ?? 0),
    0,
  );

  const outputTokens = events.reduce(
    (sum, event) => sum + (event.outputTokens ?? 0),
    0,
  );

  const incompleteUsageEvents = events.filter(
    event =>
      event.inputTokens === null ||
      event.outputTokens === null,
  ).length;

  const pricedRows = rows.filter(
    row => row.estimatedCostUsd !== null,
  );

  const estimatedCost = pricedRows.reduce(
    (sum, row) => sum + Number(row.estimatedCostUsd),
    0,
  );

  const firstTextCount = rows.filter(
    row => row.firstTextMs !== null,
  ).length;

  const savedCount = rows.filter(
    row => row.outcome === 'saved',
  ).length;

  const stageNames = {
    embedding: 'Keresési embedding',
    reranking: 'Reranking',
    assistant: 'Válaszgenerálás',
  };

  const stages = (
    ['embedding', 'reranking', 'assistant'] as const
  ).map(stage => {
    const stageEvents = events.filter(
      event => event.stage === stage,
    );

    return {
      name: stageNames[stage],
      count: stageEvents.length,
      inputTokens: stageEvents.reduce(
        (sum, event) => sum + (event.inputTokens ?? 0),
        0,
      ),
      outputTokens: stageEvents.reduce(
        (sum, event) => sum + (event.outputTokens ?? 0),
        0,
      ),
    };
  });

  const cards = [
    {
      label: 'Rögzített chatkérések',
      value: formatNumber(rows.length),
      detail: `${savedCount} válasz és beszélgetés sikeresen mentve`,
    },
    {
      label: 'Átlagos első szövegrész',
      value: formatSeconds(
        mean(rows.map(row => row.firstTextMs)),
      ),
      detail: `Szerveroldali mérés, ${firstTextCount} kérésből`,
    },
    {
      label: 'Átlagos teljes feldolgozás',
      value: formatSeconds(
        mean(rows.map(row => row.totalMs)),
      ),
      detail: 'A beszélgetés mentésével együtt',
    },
    {
      label: 'Becsült modellköltség',
      value:
        pricedRows.length === 0
          ? '–'
          : formatCost(estimatedCost),
      detail: `${pricedRows.length} / ${rows.length} kéréshez van költségbecslés`,
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-sm text-amber-800 underline"
            >
              Vissza a receptasszisztenshez
            </Link>

            <h1 className="mt-3 text-3xl font-bold text-zinc-900">
              Monitoring
            </h1>

            <p className="mt-2 text-sm text-zinc-600">
              A legutóbbi legfeljebb {SAMPLE_LIMIT} rögzített
              chatkérés adatai. Az oldal kézi frissítéssel
              tölti be az új méréseket.
            </p>
          </div>

          <form action="/monitoring" method="get">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
            >
              Frissítés
            </button>
          </form>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(card => (
            <div
              key={card.label}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <h2 className="text-sm text-zinc-600">
                {card.label}
              </h2>

              <p className="mt-3 break-words text-2xl font-semibold">
                {card.value}
              </p>

              <p className="mt-2 text-xs text-zinc-500">
                {card.detail}
              </p>
            </div>
          ))}
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">
            Tokenhasználat
          </h2>

          <p className="mt-2 text-sm text-zinc-600">
            Ismert input: {formatNumber(inputTokens)} token.
            Ismert output: {formatNumber(outputTokens)} token.
            Hiányos használati adat: {incompleteUsageEvents}{' '}
            mérési esemény.
          </p>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b text-zinc-600">
                <tr>
                  <th className="p-3">Folyamat</th>
                  <th className="p-3">Mérési esemény</th>
                  <th className="p-3">Ismert input token</th>
                  <th className="p-3">Ismert output token</th>
                </tr>
              </thead>
              <tbody>
                {stages.map(stage => (
                  <tr key={stage.name} className="border-b">
                    <td className="p-3">{stage.name}</td>
                    <td className="p-3">{stage.count}</td>
                    <td className="p-3">
                      {formatNumber(stage.inputTokens)}
                    </td>
                    <td className="p-3">
                      {formatNumber(stage.outputTokens)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold">
            Legutóbbi kérések
          </h2>

          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Még nincs rögzített chatkérés.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b text-zinc-600">
                  <tr>
                    <th className="p-3">Időpont</th>
                    <th className="p-3">Állapot</th>
                    <th className="p-3">Első szöveg</th>
                    <th className="p-3">Generálás</th>
                    <th className="p-3">Teljes idő</th>
                    <th className="p-3">Becsült költség</th>
                  </tr>
                </thead>

                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className="border-b">
                      <td className="whitespace-nowrap p-3">
                        {row.createdAt.toLocaleString('hu-HU', {
                          timeZone: 'Europe/Budapest',
                        })}
                        <span className="mt-1 block text-xs text-zinc-500">
                          {row.messageId}
                        </span>
                      </td>

                      <td className="p-3">
                        {outcomeLabels[row.outcome]}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {formatSeconds(row.firstTextMs)}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {formatSeconds(row.generationMs)}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {formatSeconds(row.totalMs)}
                      </td>

                      <td className="whitespace-nowrap p-3">
                        {row.estimatedCostUsd === null
                          ? '–'
                          : formatCost(
                              Number(row.estimatedCostUsd),
                            )}
                        {row.pricingVersion && (
                          <span className="mt-1 block text-xs text-zinc-500">
                            {row.pricingVersion}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-xs leading-5 text-zinc-500">
          A generálási idő tartalmazza a keresést és a
          rerankingot is; az időket nem adjuk össze.
          Az első szövegrész ideje szerveroldali adat,
          a böngésző hálózati késleltetését nem méri.
          A költség a rögzített modellhasználat becslése;
          a dokumentumfeldolgozás és a külön futtatott
          evaluációk költségét ez az oldal nem tartalmazza.
          A hiányzó költségadatot kötőjel jelöli.
        </p>
      </div>
    </main>
  );
}