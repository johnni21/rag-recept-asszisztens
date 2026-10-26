# Alkalmazásszintű evaluáció

## Módszer

A mérés 10 összetett, HTTP API-n keresztül végrehajtott
felhasználói folyamatot tartalmazott, folyamatonként két
beszélgetési körrel.

Minden eset saját, egyedi nevű tesztreceptet töltött fel,
feldolgozta azt, beszélgetést indított, majd ellenőrizte
a streamelt válasz és a mentett üzenetek egyezését,
a beszélgetés visszatöltését és a monitoringadatok mentését.

A futtató a végén törölte a saját tesztdokumentumait és
beszélgetéseit. A dokumentumtörlés után ellenőrizte a kapcsolódó
chunkok eltűnését is. A monitoringrekordok megmaradtak.

A tesztek az alkalmazás HTTP API-ját vizsgálják.
A böngészős felület működését külön, manuálisan ellenőriztük.

## Vizsgált folyamatok

| Teszt | Kiemelt ellenőrzés |
|---|---|
| app-01 | Feltöltés, feldolgozás, beszélgetés visszatöltése |
| app-02 | Azonos fájlnév ismételt feltöltésének elutasítása |
| app-03 | Nem támogatott fájltípus elutasítása |
| app-04 | Üres feltöltés elutasítása és TXT feldolgozása |
| app-05 | Elavult beszélgetésverzió elutasítása |
| app-06 | Hibás chatkérés elutasítása |
| app-07 | Nem létező beszélgetés kezelése |
| app-08 | Aktív és üres, inaktív beszélgetés elkülönítése |
| app-09 | Újrafeldolgozás duplikált chunkok nélkül |
| app-10 | Nem létező dokumentum és hiányzó kalóriaadat kezelése |

## Értékelés

A technikai ellenőrzéseket a program végezte.

A teljes kétkörös beszélgetést esetenként egyszer értékelte
a gpt-4.1-mini modell. A bíró a felhasználó célját,
a referencia-válaszokat és a ténylegesen visszakeresett
kontextusokat kapta meg.

Külön értékeltük:

- a válaszminőséget 0–3 skálán;
- a szimulált elégedettséget 0–3 skálán;
- a felhasználói cél teljesülését;
- a forrásokkal nem alátámasztott receptállításokat.

Egy eset akkor sikeres, ha a technikai ellenőrzések teljesülnek,
a cél megvalósul, mindkét pontszám legalább 2, és a bíró
nem jelez hallucinációt.

## Eredmények

| Mérőszám | Eredmény |
|---|---:|
| Tervezett folyamat | 10 |
| Technikailag sikeres folyamat | 10 |
| Bíróval értékelt beszélgetés | 10 |
| Összesített feltételek szerint sikeres folyamat | 10 |
| Befejezett beszélgetési kör | 20 |
| Futási hiba | 0 |
| Takarítási hiba | 0 |
| Átlagos válaszminőség | 3/3 |
| Átlagos szimulált elégedettség | 3/3 |
| Teljesült felhasználói cél | 10/10 |
| Bíró által jelzett hallucináció | 0 |

## Válaszidők

| Mérés | Átlag |
|---|---:|
| Első válaszszöveg a HTTP-tesztkliensen | 16,41 s |
| Teljes válaszstream a HTTP-tesztkliensen | 18,00 s |
| Teljes szerveroldali feldolgozás | 17,99 s |
| Felhasználói folyamat a bírói értékelés előtt | 36,53 s |

Az első szöveg ideje az első tényleges text-delta megérkezését
méri, nem a HTTP-fejléceket vagy a tool eseményeit.

A folyamat ideje tartalmazza az előkészítő API-műveleteket
és a két beszélgetési kört, de nem tartalmazza a bírói
értékelést és az utólagos takarítást.

A mérés lokális fejlesztői környezetben, szekvenciális futtatással
készült. Nem terheléses teszt és nem produkciós teljesítménymérés.

## Becsült költség

| Tétel | Becsült költség |
|---|---:|
| 20 chatkérés | 0,15780591 USD |
| 10 bírói értékelés | 0,01021000 USD |
| A fenti tételek összege | 0,16801591 USD |

Mind a 20 chatkéréshez és mind a 10 bírói értékeléshez
rendelkezésre állt költségbecslés.

A chatkérések költsége tartalmazza a keresési embeddinget,
a rerankingot és az asszisztens generálását.
A cache-ből olvasott input kedvezményes árral szerepel.

A dokumentumok feldolgozásakor létrehozott embeddingek
költsége nincs benne ezekben az összegekben.

Árazási verzió: openai-standard-usd-2026-10-22.
Az összegek tokenalapú becslések, nem számlaadatok.

## Manuális ellenőrzés

### app-09: mennyiségek felezése

Az első válasz 250 g csicseriborsót és 200 g főtt rizst adott meg.
A következő körben az asszisztens helyesen 125 g csicseriborsóra
és 100 g főtt rizsre felezte a teljes recept mennyiségeit.

A második kérdés nem ismételte meg a recept nevét.
Az asszisztens megfelelően követte a beszélgetés kontextusát.

### app-10: hiányzó adat

Az asszisztens nem becsült és nem talált ki kalóriaértéket:
világosan jelezte, hogy a dokumentum nem tartalmaz ilyen adatot.

A következő kérdésre helyesen megadta a 2 adagot és a
20 perces elkészítési időt, a megfelelő tesztfájlt megnevezve.

## Korlátok és tanulságok

A 10 folyamat ugyanannak a rövid, mesterséges receptmintának
egyedi nevű példányait használja. Ez kontrolláltan vizsgálja
az alkalmazás működését, de korlátozott tartalmi változatosságot ad.

Az elégedettség LLM által becsült, szimulált érték;
nem valódi felhasználói visszajelzés.

A bíró mindegyik beszélgetésre maximális pontszámot adott.
Két beszélgetés manuális ellenőrzése támogatta ezt az eredményt,
de nem igazolja automatikusan az összes válasz hibátlanságát.

A nulla jelzett hallucináció erre a tesztkészletre vonatkozik,
nem bizonyítja, hogy a rendszer általánosan hallucinációmentes.

A következő méréshez változatosabb recepteket, hosszabb
beszélgetéseket és több párhuzamosan aktív beszélgetést
lenne érdemes bevonni.

A jelenlegi eredmények alapján a vizsgált alkalmazásfolyamatok
működnek. A leginkább észrevehető felhasználói kompromisszum
a válasz kezdetéig eltelt, átlagosan 16,41 másodperc.