# Reflexió

## Mit tanultam?

A receptasszisztens válaszainak részletességét vizsgáltam
három szimulált felhasználóval: türelmetlen kezdővel,
türelmes kezdővel és tapasztalt szakáccsal.

Arra számítottam, hogy az alapértelmezetten tömör válaszokat
kérő prompt nem lesz megfelelő a részletes magyarázatot
igénylő kezdőnek. A baseline azonban már jól alkalmazkodott
a felhasználók kéréseihez.

Mindkét promptváltozat 3/3 átlagpontot kapott.
A módosítással ezért nem mutattam ki javulást.

## Mi működött?

A szimuláció ugyanazt az asszisztenskonfigurációt használta,
mint a webes chat. A beszélgetésekben megmaradtak az előzmények
és a keresőtool eredményei is.

Minden beszélgetést elmentettem, és a judge csak a végén,
egyetlen hívással értékelt. A mentett eredmények újrafuttatáskor
betölthetők, így nem szükséges ugyanazokat újra legenerálni.

Az indoklások és a kézi átnézés segítettek megérteni
a pontszámok mögötti viselkedést.

## Mi nem működött jól?

A szimulált user néha elégedettnek jelölte magát,
de tovább kérdezett. Előfordult, hogy már megválaszolt
információra kérdezett rá újra.

A módosított promptnál a türelmetlen kezdő a négykörös
korlátig sem jelölte magát elégedettnek, miközben a judge
megfelelőnek ítélte a részletességet és teljesítettnek a célt.

Ezért a szimulált elégedettséget nem tekintem önmagában
megbízható bizonyítéknak a prompt minőségére.

## Trade-offok és korlátok

A rövid válasz könnyen áttekinthető, de több pontosító
kérdést igényelhet. A részletes válasz segíthet a kezdőnek,
de szükségtelen magyarázatokat is tartalmazhat.

A baseline maximális pontszáma plafonhatást okozott:
a skála már nem tudott további javulást jelezni.

Változatonként csak három beszélgetést futtattam.
Azonos personákat és kezdőkérdéseket használtam,
de a további kérdések eltértek. Ez korlátozza
az eredmények közvetlen összehasonlíthatóságát.

A szimulátor és a judge ugyanazt a modellt használta,
külön hívásokban. Az eredményeiket kézi ellenőrzéssel
is kiegészítettem.

A vizsgálat a részletességre irányult;
a receptek tényszerű helyességét nem igazolta.

## Mit csinálnék másképp?

Először próbabeszélgetéssel ellenőrizném, hogy a szimulált
user megfelelően lezárja-e a beszélgetést, amikor eléri a célját.

Olyan teszteseteket is választanék, amelyekben a felhasználó
beszélgetés közben változtat a kért részletességen.

Nagyobb költségkerettel megismételném a méréseket,
és több beszélgetést ellenőriznék kézzel.