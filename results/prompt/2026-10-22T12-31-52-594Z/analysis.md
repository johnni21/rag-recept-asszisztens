# Promptszintű evaluáció

## Módszer

15 single-turn esetet futtattam a webappal közös
asszisztensbeállításokkal: 12 megválaszolható kérdést és
3 hiányzó információra kérdező esetet.

Az asszisztens csak a kérdést kapta meg. A bíró a tényleges
tooleredményeket, a választ és az előre rögzített referenciaválaszt
értékelte. A bíró működését három kontrollesettel ellenőriztem,
köztük egy szándékosan hibás válasszal.

## Automatikus eredmények

- Sikeresen értékelt esetek: 15/15; technikai hiba: 0.
- Válaszhelyesség átlaga: 3/3.
- Forráshűség átlaga: 3/3.
- Kontextusrelevancia átlaga: 3/3, 12 értékelhető esetből.
- Üres kontextusú esetek: 3; ezek kimaradtak a relevanciaátlagból.
- A bíró által hallucinációként jelzett válaszok: 0/15.
- Minden esetben történt keresési toolhívás.
- Asszisztens átlagos futásideje: 23,23 másodperc.
- Bíró átlagos futásideje: 2,73 másodperc.

Az üres kontextushoz tartozó nyers helykitöltő pontszámot
a program nullra normalizálja. Ez nem nulla pontos találatként
kerül az átlagba.

## Kézi ellenőrzés

A prompt-05 válasza helyesen adott meg 30 perc hűtőben történő
sós vizes pácolást és 375 °F sütési olajhőmérsékletet.
A kiegészítő sütési idő és forgatás is szerepel a receptben.

A prompt-14 nem talált ki kalóriaadatot. Ugyanakkor feleslegesen
javasolta a fájlnév pontosítását vagy a recept feltöltését:
a dokumentum már elérhető volt, csak kalóriaadat nincs benne.
Ezt a kommunikációs hiányosságot a bíró maximális pontszámai
nem tükrözték.

Üres keresési eredmény önmagában nem bizonyítja, hogy a teljes
dokumentum nem tartalmaz egy adatot. A válaszban ezért a keresés
eredményének korlátait kell pontosan jelezni.

## Következtetés és korlátok

Az automatikus értékelés ebben a 15 esetben nem jelzett
hallucinációt. Ez nem bizonyít általános hibamentességet.
A kérdések kis, konkrét receptnevekre épülő készletet alkotnak,
és a referenciák részben a retrieval-tesztekből származnak.

Két esetet kézzel is ellenőriztem. A vizsgálat megmutatta,
hogy a helyesség és forráshűség mellett a felhasználónak adott
következő lépés hasznosságát is érdemes külön értékelni.
