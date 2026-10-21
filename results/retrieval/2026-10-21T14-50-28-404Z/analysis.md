# Retrieval-evaluáció: vektoros keresés és LLM-reranking

## Beállítások

- 20 teszteset, 9 receptből.
- Előre megadott angol keresőkérdések.
- Relevancia egysége: fájlnév + szakasz.
- Kérdésenként egy elvárt szakasz.
- Embedding: text-embedding-3-small.
- Hasonlósági küszöb: 0,45.
- Legfeljebb 12 jelölt, legfeljebb 4 végső találat.
- Reranker: gpt-4.1-mini, legalább 2 pontos találatok megtartása.

## Eredmények

Mind a 20 teszt lefutott, technikai hiba nélkül.

| Mutató | Vektoros keresés | Reranking után |
|---|---:|---:|
| Precision@4 | 0,25 | 0,25 |
| Recall@4 | 1,00 | 1,00 |
| MRR@4 | 0,975 | 1,00 |
| Visszaadott források átlagos precisionje | 0,275 | 0,633 |
| Visszaadott források átlagos száma | 3,7 | 1,8 |

## Idő és tokenhasználat

- Vektoros keresés átlagos ideje: 0,39 másodperc.
- Reranking átlagos ideje: 2,21 másodperc.
- Keresés és reranking együtt: átlagosan 2,60 másodperc.
- Reranking input tokenek: 27 179.
- Reranking output tokenek: 1 728.
- Reranking összes token: 28 907.

Az idők nem tartalmazzák a felhasználónak szánt válasz generálását.
Az embedding tokenhasználatát ez a mérés nem rögzítette.

## Értelmezés és korlátok

A vektoros keresés önmagában is megtalálta mind a 20 elvárt
szakaszt az első négy találatban. Reranking után minden elvárt
szakasz az első helyre került, és kevesebb további szakasz maradt.

Kérdésenként egy elvárt szakasz miatt a Precision@4 maximuma
ebben a készletben 0,25. A többi szakaszt nem jelöltük relevánsnak,
de lehet közöttük részben hasznos információ.

A tesztek konkrét receptneveket és előre megadott angol
keresőkérdéseket használnak. Nem mérik a magyar kérdések
fordítását, az általános ételajánlást vagy a találat nélküli eseteket.

A reranking előnye ebben a mérésben a sorrend és a kontextus
szűkítése volt, átlagosan 2,21 másodperc többletidővel.
A végső válaszminőség javulását külön evaluációval kell vizsgálni.
