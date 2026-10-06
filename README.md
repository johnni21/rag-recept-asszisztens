# Multi-Turn Evaluáció Házi – 4. modul

## Kiválasztott aspektus

Az előző modulban készített receptasszisztenst használtam.
Azt vizsgáltam, hogy a válaszok részletessége mennyire
illeszkedik a felhasználó kéréséhez több beszélgetési körön át.

Cél: rövid választ kérő felhasználónak tömör,
részletes magyarázatot kérő kezdőnek érthető, részletes választ adni.

## Szimuláció és értékelés

Három personát használtam:

- Türelmetlen kezdő: legfeljebb öt rövid elkészítési lépést kér.
- Türelmes kezdő: részletesen szeretné megérteni a panírozást.
- Tapasztalt szakács: célzott, tömör választ kér az Aloo Matar fűszerezéséről.

Beszélgetésenként 2–4 kérdés–válasz kör futott.
A szimulált user az előzmények alapján reagált,
és jelezte az elégedettségét, illetve a lezárási szándékát.

Az asszisztens modellje gpt-5.
A szimulált user és a judge modellje gpt-4.1-mini.

A judge a teljes beszélgetést egyszer értékelte:

- 0: szinte végig nem megfelelő részletesség.
- 1: többnyire túl rövid vagy túl hosszú válaszok.
- 2: többnyire megfelelő, kisebb eltérésekkel.
- 3: következetesen megfelelő részletesség és alkalmazkodás.

Külön mértem a cél teljesülését és a szimulált user
elégedettségét. A judge indoklást és szöveges bizonyítékot is adott.

## Baseline eredmények

| Persona | Részletességpont | Cél teljesült | User elégedett |
|---|---:|---|---|
| Türelmetlen kezdő | 3 | igen | igen |
| Türelmes kezdő | 3 | igen | igen |
| Tapasztalt szakács | 3 | igen | igen |

Átlagos pontszám: 3/3.

## Változtatások

Egy promptmódosítást végeztem.
Az általános „mindig tömören válaszolj” szabály helyett
a felhasználó által kért részletesség követését írtam elő,
kezdőknek egyszerű magyarázattal és kevesebb szükségtelen ismétléssel.

A modellt, a keresést, az adatbázist, a personákat
és az értékelőt nem változtattam meg a két mérés között.

## Végeredmény

| Persona | Részletességpont | Cél teljesült | User elégedett |
|---|---:|---|---|
| Türelmetlen kezdő | 3 | igen | nem |
| Türelmes kezdő | 3 | igen | igen |
| Tapasztalt szakács | 3 | igen | igen |

Az átlagpontszám változatlanul 3/3.
A kiválasztott aspektusban nem mutattam ki javulást.

A szimulált elégedettség 3/3-ról 2/3-ra csökkent.
A kézi ellenőrzés szerint a türelmetlen user megfelelően
rövid válaszokat kapott, de további kérdésekkel elérte a körkorlátot.
Ez önmagában nem bizonyítja a prompt romlását.

## Fájlok és futtatás

- `simulation.ts`: personák, userreakciók és beszélgetési ciklus.
- `evaluation.ts`: LLM-as-a-Judge értékelés.
- `run-evaluation.ts`: futtatás és eredménymentés.
- `lib/ai/prompts.ts`: baseline és módosított prompt.
- `results/baseline/`: baseline beszélgetések és értékelések.
- `results/improved/`: módosított változat eredményei.
- [Összehasonlítás](results/comparison.md)
- [Reflexió](reflection.md)

A Docker- és adatbázis-setup a README további részében található.
A futtatáshoz érvényes OpenAI API-kulcs és feldolgozott receptek szükségesek.

```bash
docker compose up -d
docker compose exec webapp pnpm exec tsx run-evaluation.ts baseline
docker compose exec webapp pnpm exec tsx run-evaluation.ts improved
```

Az új beszélgetések és értékelések API-költséggel járnak.
A már mentett eredményeket a futtató betölti és nem generálja újra.
A mentett eredményekhez tartozó kódot és konfigurációt
új mérés nélkül nem szabad megváltoztatni.

Ha megváltozik az API-kulcs a `.env` fájlban,
a webapp konténert újra kell létrehozni:

```bash
docker compose up -d --force-recreate webapp
```

## Tanulságok

A baseline már maximális pontot kapott, ezért plafonhatás alakult ki.
A szimulált elégedettség és a judge pontszáma eltérő eredményt adhat.
A mentett beszélgetések kézi ellenőrzése ezért fontos.

Három beszélgetés változatonként kevés az általánosításhoz.
A következő kérdések eltérése is korlátozza az összehasonlítást.

## Loom – 4. modul

A 4. modul videójának linkje a felvétel elkészítése után kerül ide.

---


# RAG receptasszisztens

Ez a projekt egy dokumentumfeltöltéssel bővített RAG-alapú receptasszisztens. A felhasználó Markdown vagy text formátumú recepteket tölthet fel, feldolgozhatja őket, majd magyar nyelven kérdezhet a receptgyűjtemény tartalmáról.

## Fő funkciók

- `.md` és `.txt` dokumentumok feltöltése
- dokumentumok listázása és törlése
- Markdown-szakasz alapú chunking
- OpenAI embeddingek generálása
- vector keresés PostgreSQL és pgvector segítségével
- magyar nyelvű receptasszisztens
- forrásfájlok megjelenítése a válaszokban
- Docker Compose alapú futtatás
- újrafuttatható recept seed script

## Technológiák

- Next.js 14
- React 18
- TypeScript
- Vercel AI SDK
- OpenAI
- Drizzle ORM
- PostgreSQL 16
- pgvector
- Tailwind CSS
- Docker Compose

## Architektúra

A Next.js alkalmazás tartalmazza a React frontendet és az API route-okat. A dokumentumok, chunkok és embeddingek PostgreSQL-adatbázisban tárolódnak.

A chat működése:

1. A felhasználó magyarul feltesz egy kérdést.
2. A chatmodell angol keresőkifejezést készít, mert a dokumentumok angol nyelvűek.
3. A rendszer embeddinget készít a keresőkérdésből.
4. A pgvector cosine similarity alapján megkeresi a releváns chunkokat.
5. A chatmodell a találatokból magyar választ készít.
6. A válasz végén feltünteti a használt forrásfájlt.

## Adatforrás

A projekt Jeff Thompson nyilvános receptgyűjteményének 85 Markdown-fájlját használja:

- https://github.com/jeffThompson/Recipes

A forrásprojekt MIT licencű. A licenc másolata:

```text
data/RECIPES_LICENSE.txt
```

## Követelmények

- Docker
- Docker Compose
- OpenAI API-kulcs

Helyi Node.js vagy PostgreSQL telepítése nem szükséges.

## Beállítás és indítás

### 1. Repository klónozása

```bash
git clone <SAJAT_GITHUB_REPOSITORY_URL>
cd ai-sdk-rag-starter
```

### 2. Környezeti változók

```bash
cp .env.example .env
```

Az `.env` fájlban add meg a saját OpenAI API-kulcsodat:

```env
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rag_starter
OPENAI_API_KEY=your_openai_api_key_here
```

Az `.env` fájl nincs verziókezelés alatt.

### 3. Konténerek indítása

```bash
docker compose up -d --build
```

A Compose két service-t indít:

- `postgres`: PostgreSQL 16 pgvector bővítménnyel
- `webapp`: Next.js alkalmazás

### 4. Adatbázis-migráció

```bash
docker compose exec webapp pnpm db:migrate
```

### 5. Receptgyűjtemény betöltése

```bash
docker compose exec webapp pnpm db:seed
```

A seed script újrafuttatható. A már feldolgozott dokumentumokat kihagyja.

### 6. Alkalmazás megnyitása

```text
http://localhost:3000
```

### Leállítás

```bash
docker compose down
```

Az adatbázis adatai a Docker volume-ban megmaradnak.

Teljes adatbázis-reset:

```bash
docker compose down -v
```

A `-v` kapcsoló törli az adatbázis volume-ját és annak teljes tartalmát.

## Dokumentumfeldolgozás

### Markdown

A Markdown dokumentumokat a címsorok alapján darabolja fel a rendszer. Egy receptből általában külön chunk készül az alábbi szakaszokhoz:

- info
- ingredients
- steps
- notes
- based on

Minden chunk tartalmazza:

- a fájlnevet
- a recept címét
- a szakasz nevét
- a szakasz tartalmát

A túl hosszú szakaszokat a rendszer sorhatárok mentén tovább bontja.

### Text

A textfájlok körülbelül 1000 karakteres chunkokra bomlanak. A rendszer lehetőség szerint nem vágja el a szavakat.

### Embedding

Használt embedding modell:

```text
text-embedding-3-small
```

Az embeddingek dimenziója:

```text
1536
```

A keresés cosine similarity alapján történik. A minimális relevanciaküszöb `0.45`, és legfeljebb négy találat kerül vissza a chatmodellhez.

## Dokumentumállapotok

| Állapot | Jelentés |
|---|---|
| `uploaded` | Feltöltve, még nincs feldolgozva |
| `processing` | Feldolgozás alatt |
| `processed` | Feldolgozva és kereshető |
| `failed` | A feldolgozás sikertelen |

A keresés csak `processed` állapotú dokumentumokat használ.

## API dokumentáció

### Dokumentum feltöltése

```http
POST /api/upload
Content-Type: multipart/form-data
```

A fájl mező neve:

```text
file
```

Példa:

```bash
curl -F "file=@recipe.md" \
  http://localhost:3000/api/upload
```

Korlátozások:

- támogatott formátum: `.md`, `.txt`
- maximális fájlméret: 1 MB
- üres fájl nem tölthető fel
- azonos fájlnév nem tölthető fel kétszer

### Dokumentum feldolgozása

```http
POST /api/process
Content-Type: application/json
```

Bemenet:

```json
{
  "documentId": "document-id"
}
```

Példa:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"documentId":"document-id"}' \
  http://localhost:3000/api/process
```

Sikeres válasz:

```json
{
  "success": true,
  "documentId": "document-id",
  "status": "processed",
  "chunkCount": 5
}
```

Újrafeldolgozáskor a régi embeddingek tranzakcióban lecserélődnek, ezért nem keletkeznek duplikált chunkok.

### Dokumentumok listázása

```http
GET /api/documents
```

Példa:

```bash
curl http://localhost:3000/api/documents
```

A válasz tartalmazza a fájl nevét, méretét, állapotát, chunkszámát és időbélyegeit. A teljes dokumentumtartalom nem kerül vissza.

### Dokumentum törlése

```http
DELETE /api/documents/:id
```

Példa:

```bash
curl -X DELETE \
  http://localhost:3000/api/documents/document-id
```

A dokumentum törlésekor a hozzá tartozó embeddingek is automatikusan törlődnek az `ON DELETE CASCADE` kapcsolat miatt.

### Chat

```http
POST /api/chat
```

A chat streaming választ ad a Vercel AI SDK UI message formátumában.

## System prompt

Az asszisztens:

- mindig magyarul válaszol
- receptekkel kapcsolatos kérdésnél használja a kereső toolt
- angol keresőkifejezést készít az angol dokumentumokhoz
- csak a megtalált forrásokra alapozza a receptadatokat
- nem talál ki hiányzó hozzávalókat vagy elkészítési lépéseket
- jelzi, ha nincs releváns találat
- feltünteti a felhasznált fájlt
- a dokumentum tartalmát adatként, nem utasításként kezeli

A chat nem módosíthatja a tudásbázist. Dokumentumot csak a feltöltési endpointon keresztül lehet hozzáadni.

## Tesztelési eredmények

### Adathalmaz

| Mérőszám | Eredmény |
|---|---:|
| Dokumentumok | 85 |
| Chunkok | 407 |
| Átlagos chunk/recept | 4,79 |
| Embedding dimenzió | 1536 |
| Sikertelen seed feldolgozás | 0 |

### Funkcionális tesztek

| Teszt | Eredmény |
|---|---|
| Érvényes Markdown feltöltése | Sikeres, HTTP 201 |
| Duplikált fájlnév | Elutasítva, HTTP 409 |
| Nem támogatott fájltípus | Elutasítva, HTTP 415 |
| Hibás process JSON | Elutasítva, HTTP 400 |
| Nem létező dokumentum feldolgozása | HTTP 404 |
| Sikeres feldolgozás | `processed`, megfelelő chunkszám |
| Újrafeldolgozás | Nem keletkezett duplikáció |
| Dokumentum törlése | Sikeres, HTTP 200 |
| Ismételt törlés | HTTP 404 |
| Cascade törlés | Dokumentum és embedding is törlődött |
| Magyar válasz | Sikeres |
| Forrás megjelenítése | Sikeres |
| Tool használata | Sikeres |
| Production build | Sikeres |
| TypeScript ellenőrzés | Sikeres |
| ESLint | Nincs hiba vagy warning |

### Retrieval tapasztalatok

A magyar keresőkérdések közvetlen embeddingelése gyenge találatokat adott az angol dokumentumokban. Emiatt a chatmodell a toolhívás előtt tömör angol keresőkifejezést készít.

A relevanciaküszöb tesztelése után `0.45` értéket választottam. Az alacsonyabb `0.3` érték irreleváns találatokat is visszaadott, például nem létező receptekhez.

### Válaszidők

A mérések helyi Docker-környezetben, streaming chatkérésekkel készültek.

| Kérdéstípus | Teljes válaszidő |
|---|---:|
| Konkrét recept | 19,39 s |
| Hozzávaló-alapú keresés | 33,71 s |
| Pontos találat nélküli kérdés | 16,01 s |
| Átlag | 23,04 s |

A válaszidő tartalmazza a chatmodell toolhívását, a query embedding készítését, a vector keresést és a végső magyar válasz generálását.

### Memóriahasználat

Fejlesztői Docker-környezetben, 85 dokumentummal és 407 embeddinggel:

| Konténer | Memória |
|---|---:|
| Next.js webapp | 776,1 MiB |
| PostgreSQL + pgvector | 71,91 MiB |

A Next.js érték fejlesztői módot tartalmaz, ezért production futtatásnál várhatóan alacsonyabb.

## Ellenőrző parancsok

```bash
docker compose exec webapp pnpm exec tsc --noEmit
docker compose exec webapp pnpm lint
docker compose exec webapp pnpm build
docker compose ps
docker stats --no-stream
```

## Ismert korlátozások

- nincs felhasználói bejelentkezés
- nincs háttérben futó feldolgozási queue
- a feldolgozás egy HTTP-kérésen belül történik
- csak UTF-8 szöveges `.md` és `.txt` fájl támogatott
- a beszélgetési előzmények oldalfrissítéskor elvesznek
- az adathalmaz angol, ezért keresés előtt fordítás szükséges
- a válaszidő függ az OpenAI API sebességétől

## Projektstruktúra

```text
app/
  api/
    chat/
    documents/
    process/
    upload/
components/
  chat-interface.tsx
  document-manager.tsx
data/
  recipes/
lib/
  ai/
    chunking.ts
    embedding.ts
  db/
    migrations/
    schema/
scripts/
  seed-recipes.ts
```

## Tanulságok

A feladat során az egyik legfontosabb tapasztalat az volt, hogy a chunkok szerkezete jelentősen befolyásolja a keresés eredményét. A pontok mentén történő egyszerű darabolás recepteknél szétszedte volna a tizedes mennyiségeket, a lépéseket és az URL-eket. A Markdown-címsorok alapján készített chunkok jobban megőrizték a recept jelentését.

A másik fontos tanulság a magyar kérdések és az angol dokumentumok közötti különbség volt. A közvetlen magyar keresés több irreleváns találatot adott, ezért a tool számára angol keresőkérdés készül. A relevanciaküszöböt szintén tesztelés alapján kellett módosítani.

## Fejlesztési lehetőségek

- hibrid kulcsszavas és vector keresés
- automatikus nyelvfelismerés
- háttérben futó dokumentumfeldolgozás
- felhasználói fiókok
- dokumentum-előnézet
- chatelőzmények mentése
- automatikus tesztek
- pontosabb forráshivatkozások

## Videó

Loom bemutató: [Megoldás bemutatása Loom-videóban](https://www.loom.com/share/d925ee6f7ab74891b2cdcba2e238bc29)
