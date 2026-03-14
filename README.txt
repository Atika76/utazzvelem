FuvarVelünk – frissített csomag

Mi változott:
- kapcsolati e-mail: cegweb26@gmail.com
- Facebook belépés gomb javítva:
  - ha a Facebook provider be van kapcsolva a Supabase-ben, átirányít a Facebook belépésre
  - ha nincs bekapcsolva, nem nyit hibás JSON oldalt, hanem érthető hibaüzenetet mutat
- Facebook-poszt kép generálás finomítva
- fizetés továbbra is közvetlenül a sofőrnek:
  - utalás a sofőrnek
  - készpénz a sofőrnek

Supabase:
- ha valódi Facebook belépést akarsz, a Facebook providert engedélyezni kell a Supabase-ben
- contact_email és admin_email: cegweb26@gmail.com


Stabil javítások:
- Kérdés a sofőrnek gomb a hirdetésekhez és a részletek oldalhoz
- Kapcsolat oldalon csak weboldal hibabejelentés marad
- Fuvar feladásánál bankszámlaszám mező
- Fizetési módok: Utalás a sofőrnek / Készpénz a sofőrnek


PUSH / ONESIGNAL:
ONESIGNAL_APP_ID=04a02749-13bd-4060-9559-f0808ee9f927
ONESIGNAL_API_KEY=OneSignal REST API Key
SITE_URL=https://fuvarvelunk.hu

A push ikon: assets/onesignal-push-icon.png


OneSignal fontos fájlok a gyökérben:
- OneSignalSDKWorker.js
- OneSignalSDKUpdaterWorker.js
Ezeket már beletettem a ZIP-be, ezért csak felül kell írni a GitHubon.
