# Baseline és módosított prompt összehasonlítása

| Persona | Baseline pont | Módosított pont | Baseline elégedett | Módosított elégedett |
|---|---:|---:|---|---|
| Türelmetlen kezdő | 3 | 3 | igen | nem |
| Türelmes kezdő | 3 | 3 | igen | igen |
| Tapasztalt szakács | 3 | 3 | igen | igen |

Mindkét változat átlagos részletességpontszáma 3/3.
A judge mindkét változatnál mindhárom felhasználói célt
teljesítettnek értékelte.

## Változtatás

A system prompt általános tömörségi szabályát lecseréltem
a felhasználó által kért részletességet követő szabályokra.
A modell, a keresési logika, a personák és az értékelő nem változott.

## Megfigyelések

A baseline már megfelelően követte a rövid és részletes válaszokra
vonatkozó kéréseket. A módosítás ezért nem eredményezett
pontszámbeli javulást.

A türelmes kezdő baseline-beszélgetését kézzel is átnéztem.
Az asszisztens részletes magyarázatokat adott, de a
„pontszerű nyomkodás” kifejezés további tisztázást igényelt.

A módosított változat türelmetlen kezdőjét is átnéztem.
Az asszisztens tartotta az öt rövid lépést, és tömören válaszolt.
A user további kérdéseket generált, részben már megadott
információkról, majd elérte a körkorlátot.

## Következtetés és korlátok

A kiválasztott aspektusban nem mutattam ki javulást vagy romlást.
A szimulált elégedettség 3/3-ról 2/3-ra csökkent,
de ebből önmagában nem következik, hogy a prompt rosszabb lett.

A maximális baseline-pontszám plafonhatást okozott:
a skála már nem tudott további javulást jelezni.

Változatonként csak három beszélgetést futtattam.
Azonos personákat és kezdőkérdéseket használtam,
de a generált következő kérdések eltértek.
A szimulátor és a judge ugyanazt a modellt használta,
külön hívásokban, ezért az értékelésük nem tekinthető
teljesen függetlennek.

Az eredményeket nem módosítottam, és nem futtattam újra
a méréseket kedvezőbb pontszám eléréséért.