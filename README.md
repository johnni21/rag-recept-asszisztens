# RAG receptasszisztens – zárófeladat

Magyar nyelvű receptasszisztens, amely feltöltött Markdown és
szöveges dokumentumokból keres információt, és forrásokra
támaszkodó, streamelt válaszokat ad.

A projekt tartalmaz dokumentumkezelést, tartós beszélgetéseket,
LLM-alapú rerankingot, háromszintű evaluációt és monitoringoldalt.

## Gyors áttekintés

| Terület | Megoldás |
|---|---|
| Webalkalmazás | Next.js 14, React 18, TypeScript |
| AI-integráció | Vercel AI SDK 5 |
| Válaszgenerálás | OpenAI gpt-5 |
| Embedding | text-embedding-3-small, 1536 dimenzió |
| Vektoradatbázis | PostgreSQL 16 + pgvector |
| Reranking | gpt-4.1-mini |
| Adatbázis-kezelés | Drizzle ORM, migrációk |
| Futtatás | Docker Compose |
| Retrieval evaluáció | 20 teszteset |
| Prompt evaluáció | 15 teszteset |
| Alkalmazásszintű evaluáció | 10 kétkörös folyamat |
| Monitoring | Tokenhasználat, becsült költség, válaszidők |

## Telepítés

Szükséges:

- Docker és Docker Compose;
- érvényes OpenAI API-kulcs a használt modellekhez.

```bash
git clone https://github.com/johnni21/rag-recept-asszisztens.git
cd rag-recept-asszisztens
cp .env.example .env
```

Az `.env` fájlban állítsd be a saját API-kulcsodat:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rag_starter
OPENAI_API_KEY=your_openai_api_key_here
```

A Compose a webapp konténer számára külön, a `postgres`
service-re mutató adatbázis-kapcsolatot állít be.
Az `.env` fájlt nem szabad verziókezelésbe tenni.

```bash
docker compose up -d --build
docker compose exec webapp pnpm db:migrate
docker compose exec webapp pnpm db:seed
```

A seed 85 receptet tartalmaz, és a már feldolgozott
dokumentumokat kihagyja. Az embeddingek létrehozása API-költséggel jár.

Megnyitható oldalak:

- [Receptasszisztens](http://localhost:3000)
- [Monitoring](http://localhost:3000/monitoring)

API-kulcs módosítása után:

```bash
docker compose up -d --force-recreate webapp
```

Leállítás:

```bash
docker compose down
```

Az adatbázis a Docker volume-ban megmarad.

## Használat

1. Tölts fel egy UTF-8 kódolású `.md` vagy `.txt` receptet.
2. Indítsd el a dokumentum feldolgozását.
3. Hozz létre vagy válassz ki egy beszélgetést.
4. Kérdezz magyarul a dokumentumokról.
5. A válasz alatti „Hogyan találtam meg?” részben megvizsgálhatod
   a keresőkérdést és a visszakapott forrásokat.

A maximális feltöltési méret 1 MB.
Üres fájl és már létező fájlnév nem tölthető fel.

A dokumentumok és a beszélgetések törölhetők.
A beszélgetések PostgreSQL-ben tárolódnak, ezért F5 után
visszatölthetők. A böngésző helyileg az aktív beszélgetés
azonosítóját jegyzi meg.

## Architektúra és RAG pipeline

A Next.js alkalmazás szolgálja ki a webes felületet és az API-t.
A dokumentumok, embeddingek, beszélgetések és mérési adatok
PostgreSQL-ben tárolódnak.

### Dokumentumfeldolgozás

1. A feltöltött dokumentum `uploaded` állapotba kerül.
2. A feldolgozás címsorok és sorhatárok alapján chunkokat készít.
3. Az embeddingmodell minden chunkhoz vektort generál.
4. A chunkok és vektorok tranzakcióban kerülnek az adatbázisba.
5. A dokumentum `processed` állapotba kerül és kereshetővé válik.

Újrafeldolgozáskor a korábbi chunkok lecserélődnek.
Dokumentumtörléskor az embeddingek is törlődnek.

### Chunking

Markdown esetén a recept címe és szakaszai megmaradnak.
Jellemző szakaszok: `info`, `ingredients`, `steps`, `notes`.

A chunk tartalmazza a fájlnevet, a recept címét,
a szakasz nevét és a szakasz szövegét.

Az alapértelmezett törzsméret legfeljebb 1000 karakter,
amelyhez hozzáadódik a metaadatokat tartalmazó fejléc.
A hosszabb szakaszok sorhatárok és szavak mentén tovább bomlanak.

A chunkméret konfigurálható. Az evaluáció 1000 és 500
karakteres beállítást hasonlít össze.

### Keresés és válaszgenerálás

1. A felhasználó magyar kérdést küld.
2. A chatmodell a `getInformation` toolhoz tömör angol
   keresőkifejezést készít, megőrizve a receptneveket.
3. A keresőkérdés embeddinget kap.
4. A pgvector cosine similarity alapján legfeljebb 12 jelöltet ad.
5. A minimális hasonlóságküszöb 0,45.
6. A reranker minden jelöltet 0–3 skálán értékel.
7. A legalább 2 pontot elérő jelöltek közül legfeljebb 4 marad.
8. A chatmodell a forrásokból magyar választ készít,
   és megnevezi a felhasznált fájlokat.
9. A válasz streamelve érkezik, majd a beszélgetés elmentődik.

A reranker pontszám szerinti rendezése után a hasonlóság
és a chunkazonosító biztosítja a további rendezést.

## System prompt

Az alapértelmezett prompt a `lib/ai/prompts.ts` fájlban található.
Az asszisztens konfigurációja: `lib/ai/assistant.ts`.

Fő szabályok:

- receptkérdésnél kereső tool használata;
- receptadatok alapozása a visszakeresett forrásokra;
- hiányzó információ egyértelmű jelzése;
- általános tanács megkülönböztetése a forrásból származó adatoktól;
- dokumentumtartalom kezelése adatként, nem utasításként;
- magyar válasz és forrásfájlnév megadása.

A chat nem írhat új tudást a dokumentumgyűjteménybe.

A 4. modul részletességet módosító promptja külön változatként
megmaradt; a jelenlegi asszisztens alapértelmezése a baseline prompt.

## Beszélgetéskezelés

A `conversations` tábla tárolja a címet, üzeneteket,
verziószámot és időbélyegeket.

A kliens az új felhasználói üzenetet és az ismert verziót küldi.
A szerver az adatbázisból tölti be az előzményeket.

Sikeres generálás után a teljes beszélgetés mentődik.
A verzióellenőrzés megakadályozza, hogy egy elavult kérés
felülírja a frissebb beszélgetést.

Fejlesztés közben JSONB kettős szerializálási hibát találtunk:
a mentés tömb helyett JSON-sztringet tárolt.
A javítást adatbázisos regressziós ellenőrzés védi.

## API

| Metódus | Útvonal | Funkció |
|---|---|---|
| POST | `/api/upload` | Dokumentum feltöltése, `file` formmező |
| POST | `/api/process` | Feldolgozás, `documentId` JSON-mező |
| GET | `/api/documents` | Dokumentumok listázása |
| DELETE | `/api/documents/:id` | Dokumentum és chunkok törlése |
| GET | `/api/conversations` | Beszélgetések listázása |
| POST | `/api/conversations` | Beszélgetés létrehozása |
| GET | `/api/conversations/:id` | Beszélgetés visszatöltése |
| DELETE | `/api/conversations/:id` | Beszélgetés törlése |
| POST | `/api/chat` | Streamelt válasz |

A chat bemenetének példája:

```json
{
  "conversationId": "existing-conversation-id",
  "revision": 0,
  "message": {
    "id": "unique-user-message-id",
    "role": "user",
    "parts": [
      {
        "type": "text",
        "text": "Mennyi burgonya kell az Aloo Matarhoz?"
      }
    ]
  }
}
```

A `revision` a beszélgetés aktuális verziója.
A válasz AI SDK UI message formátumú SSE-stream.

## Háromszintű evaluáció

### 1. Retrieval – 20 teszteset

Adathalmaz: `evaluation/datasets/retrieval.json`.

A tesztek előre rögzített angol keresőkifejezéseket és
elvárt fájl–szakasz párokat használnak.
Ez a mérés a retrievalt vizsgálja, a chatmodell fordítását nem.

A metrikák fájl–szakasz párok szerint deduplikált találatokon,
`k=4` mellett készülnek.

| Metrika | Vektoros keresés | Reranking után |
|---|---:|---:|
| Precision@4 | 0,25 | 0,25 |
| Recall@4 | 1,00 | 1,00 |
| MRR@4 | 0,975 | 1,00 |
| Visszaadott találatok pontossága | 0,275 | 0,6333 |
| Átlagosan visszaadott találatok | 3,7 | 1,8 |

Tesztenként egy releváns fájl–szakasz pár szerepel,
ezért a Precision@4 ebben a címkézésben legfeljebb 0,25 lehet.
A rögzített nevezőjű Precision@4 és a tényleges találatszámra
számolt pontosság külön metrika.

Átlagos keresési idő: 0,39 s.
Átlagos reranking: 2,21 s.
A kettő együtt: 2,60 s.

[Eredmények és elemzés](results/retrieval/2026-10-21T14-50-28-404Z/analysis.md)

### Chunkméret és embeddingmodell vizsgálata

A választott embeddingmodell retrievalteljesítményét ugyanazon
20 keresőkérdésen, két chunkmérettel vizsgáltuk.

| Törzsméret | Chunkok száma | Recall@4 | MRR@4 | Visszaadott találatok pontossága |
|---|---:|---:|---:|---:|
| 1000 karakter | 407 | 1,00 | 0,975 | 0,275 |
| 500 karakter | 498 | 1,00 | 0,950 | 0,3417 |

A mérés pontos, memóriában számolt cosine similarity keresést
használ, reranking nélkül. A korpusz a 85 receptfájl.

Az 1000 karakteres alapérték megmaradt:
kevesebb chunk mellett jobb MRR-t adott ebben a mérésben.
Az 500 karakteres változat pontosságát a szakasz szerinti
deduplikálás is befolyásolja.

Embeddinghasználat: 63 732 token, 614 egyedi szöveg.
A futtató fájlalapú embeddingcache-t használ.

Ez nem több embeddingmodell összehasonlítása:
a kiválasztott modell két chunkbeállítás melletti vizsgálata.

[Chunkingmérés összesítése](results/chunking/2026-10-21T15-09-27-236Z/summary.json)

### 2. Prompt – 15 teszteset

Az adathalmaz 12 megválaszolható és 3 hiányzó információt
vizsgáló kérdésből áll.

A valódi asszisztens válaszát és tényleges toolkontextusait
a gpt-4.1-mini bíró értékeli.

| Metrika | Eredmény |
|---|---:|
| Befejezett eset | 15/15 |
| Kontextusrelevancia | 3/3, 12 értékelt eset |
| Válaszhelyesség | 3/3 |
| Forrásokkal való alátámasztottság | 3/3 |
| Bíró által jelzett hallucináció | 0 |

Üres kontextusnál a relevancia `null`, és kimarad az átlagból.

A bíró három kontrollesettel is ellenőrzött:
helyes válasz, szándékosan hibás válasz és korrekt hiányjelzés.

A manuális ellenőrzés kommunikációs hibát is talált:
az asszisztens egy hiányzó kalóriaadatnál szükségtelenül
újrafeltöltést vagy fájlnévpontosítást javasolt,
amit a maximális bírói pontszám nem tükrözött.

[Promptmérés elemzése](results/prompt/2026-10-22T12-31-52-594Z/analysis.md)

### 3. Alkalmazás – 10 összetett folyamat

Folyamatonként saját ideiglenes recept és két beszélgetési kör.
A tesztek a valódi HTTP API-t, streamet és adatbázist használják.

Vizsgált területek:

- feltöltés, feldolgozás és újrafeldolgozás;
- duplikált, üres és nem támogatott feltöltés;
- többkörös válaszadás és visszatöltés;
- elavult verzió és hibás chatkérés;
- hiányzó dokumentum és beszélgetés;
- aktív és üres, inaktív beszélgetés elkülönítése;
- monitoringmentés;
- tesztadatok és kapcsolódó chunkok törlése.

| Metrika | Eredmény |
|---|---:|
| Technikailag sikeres folyamat | 10/10 |
| Befejezett beszélgetési kör | 20 |
| Válaszminőség | 3/3 |
| Szimulált elégedettség | 3/3 |
| Teljesült cél | 10/10 |
| Bíró által jelzett hallucináció | 0 |
| Átlagos első szöveg a HTTP-kliensen | 16,41 s |
| Átlagos teljes stream | 18,00 s |
| Chatkérések becsült költsége | 0,15780591 USD |
| Bírói értékelések becsült költsége | 0,01021000 USD |

A dokumentumfeldolgozás költsége nincs a fenti összegekben.

Az elégedettség LLM által becsült, szimulált érték.
A tesztek közös, rövid receptmintát használnak, ezért korlátozott
tartalmi változatosságot biztosítanak.
A nulla jelzett hallucináció nem bizonyít általános hibamentességet.

[Alkalmazásszintű mérés elemzése](results/application/2026-10-22T15-44-26-942Z/analysis.md)

## Evaluációk futtatása

Az alkalmazásnak és az adatbázisnak futnia kell.
A retrieval- és prompttesztekhez a recepteket előbb be kell seedelni.

```bash
docker compose exec webapp pnpm exec tsx evaluation/run-retrieval.ts
docker compose exec webapp pnpm exec tsx evaluation/run-chunking.ts
docker compose exec webapp pnpm exec tsx evaluation/check-prompt-judge.ts
docker compose exec webapp pnpm exec tsx evaluation/run-prompt.ts
docker compose exec webapp pnpm exec tsx evaluation/run-application.ts
```

Egyetlen alkalmazásteszt:

```bash
docker compose exec webapp pnpm exec tsx evaluation/run-application.ts app-01
```

A futtatások API-költséggel járnak.
Az új eredmények időbélyeges mappába kerülnek a `results/` alatt.
Az embeddingcache csökkentheti a chunkingmérés ismételt költségét.

Az alkalmazástesztek ideiglenes dokumentumokat és beszélgetéseket
hoznak létre, majd eltakarítják azokat.
A mérések monitoringrekordjai megmaradnak.

## Monitoring

Elérhető: [http://localhost:3000/monitoring](http://localhost:3000/monitoring)

Az oldal a legutóbbi legfeljebb 100 rögzített chatkérést mutatja.
Az adatok a Frissítés gombbal tölthetők újra.

Rögzített adatok:

- keresési embedding, reranking és asszisztens tokenhasználata;
- cache-ből olvasott input tokenek, ha rendelkezésre állnak;
- első szerveroldali szövegrész ideje;
- generálási idő;
- teljes feldolgozási idő a beszélgetés mentésével;
- mentési állapot;
- becsült modellköltség és árazási verzió.

Az asszisztens generálási ideje tartalmazza a toolhívások idejét,
ezért a részidőket nem szabad egyszerűen összeadni.

Az első szövegrész szerveroldali mérése nem tartalmazza
a böngésző hálózati késleltetését.
Az alkalmazástesztek külön HTTP-kliensoldali időket is mérnek.

A költség normál API-árakkal, cache-kedvezménnyel számolt becslés.
Ismeretlen modell vagy hiányzó költségadat esetén `null` marad.
Az árazás a `lib/monitoring/pricing.ts` fájlban verziózott.

A dashboard a chatkérések rögzített használatát összesíti.
A dokumentumfeldolgozás és a külön evaluációs bírók költsége
nem része a dashboard összegének.

A monitoring nem számlázási rendszer:
az API által nem jelentett használatot és a sikertelen próbálkozások
teljes költségét nem tudja garantáltan rekonstruálni.

## API-hívás nélküli ellenőrzések

Futó PostgreSQL szükséges, modellhívás nem történik:

```bash
docker compose exec webapp pnpm exec tsx evaluation/check-conversation-storage.ts
docker compose exec webapp pnpm exec tsx evaluation/check-monitoring-storage.ts
```

Ezek ellenőrzik a JSONB tárolást, a visszaolvasást,
a verzióütközést és a költségszámítást.

## Kódellenőrzés és build

```bash
docker compose exec webapp pnpm exec tsc --noEmit
docker compose exec webapp pnpm lint
git diff --check
docker compose config --quiet
```

A build idejére állítsd le a fejlesztői webappot,
mert a két folyamat ugyanazt a `.next` könyvtárat használná:

```bash
docker compose stop webapp
docker compose run --rm --no-deps webapp pnpm build
docker compose up -d webapp
```

## Fontos fájlok

| Fájl vagy mappa | Szerep |
|---|---|
| `lib/ai/chunking.ts` | Dokumentumdarabolás |
| `lib/ai/embedding.ts` | Embedding és vektoros keresés |
| `lib/ai/reranking.ts` | Jelöltek LLM-alapú újrarendezése |
| `lib/ai/assistant.ts` | Modell és kereső tool |
| `lib/ai/prompts.ts` | System promptok |
| `lib/chat/` | Beszélgetések mentése és kliensműveletek |
| `lib/monitoring/` | Tokenadatok, költségszámítás és mentés |
| `lib/db/schema/` | Adatbázissémák |
| `lib/db/migrations/` | Verziózott migrációk |
| `evaluation/` | Adathalmazok, futtatók és bírók |
| `results/` | Mentett konfigurációk, válaszok és eredmények |
| `app/monitoring/page.tsx` | Monitoringoldal |
| `scripts/seed-recipes.ts` | Újrafuttatható receptbetöltés |

## Adatforrás

A kiinduló korpusz Jeff Thompson 85 Markdown-receptje:

https://github.com/jeffThompson/Recipes

A forrásgyűjtemény MIT licencének másolata:
[data/RECIPES_LICENSE.txt](data/RECIPES_LICENSE.txt).

Az alkalmazástesztek ettől elkülönülő, mesterséges
receptmintát használnak.

## Korlátok és további lehetőségek

- Nincs felhasználói bejelentkezés vagy felhasználónkénti elkülönítés.
- A dokumentumfeldolgozás HTTP-kérésen belül történik.
- Csak UTF-8 `.md` és `.txt` dokumentum támogatott.
- A receptek angol nyelvűek; a keresőkérdést a modell fordítja.
- A válaszidő függ a modellhívásoktól és a rerankingtól.
- A mérések kis, célzott tesztkészleteken készültek.
- A bírói pontszámokat manuális ellenőrzés egészíti ki.
- Az árak változásakor az árazási konfiguráció frissítendő.

További fejlesztési irány a változatosabb evaluációs adathalmaz,
a párhuzamos felhasználói folyamatok vizsgálata, a hibrid keresés
és a háttérben végzett dokumentumfeldolgozás.

## Korábbi modulok

A korábbi dokumentáció történeti állapotot őriz:
[README.previous-modules.md](README.previous-modules.md).

A 4. modul összehasonlítása és reflexiója:

- [Eredmények összehasonlítása](results/comparison.md)
- [Reflexió](reflection.md)

Korábbi videók:

- [3. modul – receptasszisztens](https://www.loom.com/share/d925ee6f7ab74891b2cdcba2e238bc29)
- [4. modul – multi-turn evaluáció](https://www.loom.com/share/2464f30ab7be4dc79c9a1611110c7055)

## Zárófeladat videók

## Zárófeladat videók

- [Technikai bemutató – Loom](https://www.loom.com/share/60d10ed51f664c5ab9dfeb14a16c06a9)
- [Felhasználói demó – Loom](https://www.loom.com/share/fe6eefbd94844673aff88f928571338d)
