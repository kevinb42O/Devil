# Kosmische opening — voorstel

Status: geïmplementeerd; validatie en meetresultaten staan in `artifacts/cosmic-descent/README.md`. Bijgesteld naar een toegevoegde kosmische intro van voorlopig 30 seconden, gevolgd door de volledige huidige omgevingssequentie. Alleen de presentatie verandert. Dit plan gaat voor op de oorspronkelijke koppeling van omgevingshoofdstukken aan encounters in `DESCENT_PLAN.md`.

## Het gevoel

De arena begint als een verloren steen in de kosmos. Een brede, zachte band van de Melkweg geeft de ruimte schaal. Terwijl het gevecht al bezig is, stijgen ijle stoflagen langs de arena, verdwijnen de sterren achter een atmosferische sluier en komen we terecht in de huidige eerste omgeving. Daarna gaat de bestaande afdaling verder.

De speler voelt een enorme afstand zonder een snelle vlucht te zien. Dit is een gestileerde kosmische afdaling: geen astronomisch realistische reis, warp-effect of aparte introductiefilm. De arena en camera blijven bestuurbaar zoals vandaag.

## Voorgestelde tijdlijn

Alle tijden hieronder zijn de ongewijzigde survival-/replaytijd. De kosmische intro duurt voorlopig 30 seconden. Vanaf dat punt wordt de volledige bestaande omgevingssequentie 30 seconden later afgespeeld, zonder die te comprimeren.

| Nieuwe tijd | Omgeving | Bestaande omgevingstijd |
| --- | --- | --- |
| 0–10 s | Open kosmos: veel lege ruimte, een zachte Melkwegband en zwakke sterren. | Nog niet gestart |
| 10–21 s | IJle galactische stoflagen; het koude sterrenlicht blijft voelbaar. | Nog niet gestart |
| 21–30 s | Wolkengrens: sterren verdwijnen, licht wordt diffuser, nevel sluit aan op de huidige openingsmist. | Naderen van het openingsbeeld op 0 s |
| 30–69 s | De volledige huidige opening / Last Sky. | 0–39 s |
| 69–144 s | Cloud Grave. | 39–114 s |
| 144–259 s | Bruised Veil. | 114–229 s |
| 259–380 s | Furnace. | 229–350 s |
| 380–472 s | Cathedral Below. | 350–442 s |
| Vanaf 472 s | Unlit Depth. | Vanaf 442 s |

Dit verlengt de omgevingsroute met 30 seconden. Een run, vijandgolf of replay krijgt geen extra tijd. Bij een dood op 25 s eindigt de run nog steeds op 25 s, nu tijdens de kosmische intro. Een vijand die vandaag op 114 s verschijnt, verschijnt straks nog steeds op 114 s, terwijl de omgeving dan Cloud Grave toont.

De oude omgevingscurves worden als geheel verschoven, inclusief de huidige mist die tussen omgevingstijd 8 en 30 s uitademt en de hoofdstukblend tussen 21 en 39 s. Die gebeuren straks respectievelijk op survival-tijd 38–60 s en 51–69 s. De kosmische aankomst krijgt een eigen blend die op 30 s exact aansluit op de bestaande omgeving bij 0 s. Geen dubbele mistpiek of sprong in het licht op dat aansluitpunt.

## Harde grens: alleen de omgeving

- Vijandvolgorde, spawnticks, aantallen, posities, AI, moeilijkheid en gevechtsregels blijven exact behouden.
- Survival-tijd, simulatieticks, random seed en randomgenerator worden niet aangepast of door omgevingscode verbruikt.
- Geen wijziging aan spelerbeweging, wapens, projectielen, gems, botsingen, arenakrimp of fysieke vloerhoogte.
- Score-, HUD-, practice-, death- en replaytijden blijven de echte speltijd weergeven.
- Geen wijziging van replayformaten, rules versions, combat revisions, checkpoints of bestaande opnamebestanden voor deze visuele uitbreiding.
- De vroegere visuele koppeling van Furnace/Cathedral/Unlit Depth aan specifieke encounters vervalt door het opschuiven. We accepteren dat als gevolg van de langere omgevingsroute; encounters verplaatsen is geen oplossing.

## Bestaande replays

De huidige soloreplays slaan onder andere seed, startsetup, inputs en gameplayversie op. De speler reconstrueert daarmee de simulatie. Crew-replays gebruiken daarnaast checkpoints en geregistreerde gebeurtenissen. De omgeving wordt momenteel door de renderer uit `world.time` opgebouwd; een opgenomen run bevat geen video van de oude hemel.

Ontwerpkeuze: bestaande én nieuwe replays gebruiken dezelfde nieuwe omgevingsroute op dezelfde absolute speltijd. Een bestaande replay op 15 s toont dus kosmos; dezelfde replay op 80 s toont Cloud Grave, zonder wijzigingen aan acties of vijanden. De opname behoudt haar duur, uitkomst en ondersteunde gameplayversie. Er is geen migratie nodig en we voegen geen keuzemenu voor oude omgevingen toe.

Compatibiliteit is een acceptatie-eis, nog geen geteste claim over een implementatie. Controleer bij oplevering een bestaande solo- en crew-opname vóór en na de wijziging: dezelfde simulatiestatus op gekozen ticks, dezelfde uitkomst en dezelfde eventtiming. Gebruik ook bestaande ondersteunde oudere solo-versies. Importeer dezelfde bestanden zonder ze opnieuw op te slaan of te converteren. Test afspelen, pauze, seek vooruit/achteruit en opnieuw openen.

## Verdeling tussen hemel en volumetrische mist

**Bijgestelde visuele uitvoering.** De eerdere procedurele Melkwegband is vervangen door een gegenereerde panorama-textuur. Zwarte ruimte blijft zichtbaar bovenaan. De arena krijgt uitgesproken koude belichting, ook in de afzonderlijke shader voor het licht rond de speler. De volumetrische nevel vormt echte grote banken die van onder naar boven langs het platform bewegen.

**De hemel draagt de afstand.** Brede galactische lichtband, donkere stofstructuren en spaarzame sterren komen in de bestaande skyshader. De oriëntatie blijft aan de wereld gekoppeld bij rondkijken. Geen schermvullende foto die aan de camera kleeft. De hemel blijft de arena rondom omvatten, zonder harde donkere horizonstrook.

**De mist draagt de nabijheid.** De bestaande volumetrische pass krijgt een kosmische vorm: veel lege ruimte, ijle dichtheidsvelden en heel zwakke neutrale verstrooiing. De stofbeweging blijft monotoon omhoog bewegen, ook terwijl de bijdrage uitdooft; bewegingsafstand wordt nooit met het uitdoofgewicht vermenigvuldigd. Tijdens de aankomst vloeit die vorm over in de huidige lage mist. De huidige begrenzing tot een laag volume rond de arena moet voor deze modus aangepast worden; alleen de kleur veranderen maakt er nog geen galactische ruimte van.

Verre structuren blijven in de hemel, zodat het mistvolume geen afstanden van kilometers hoeft te bemonsteren. Er komen geen sterrenpartikels door het speelveld. Het gevoel van dalen ontstaat door langzaam stijgende lagen met verschillende schijnbare snelheden, zonder herhalende herkenningspunten.

De menuhemel bevat al een nevel-/sterrenbehandeling die als technische referentie kan dienen. De spelopening krijgt een eigen rustige compositie, zonder de menumaan of twinkelende sterren over te nemen.

## Visuele grenzen

- Zwarte ruimte, met een smalle gedempte grijze Melkwegband en donkere stofbanen. De bovenste hemel blijft zwart; geen blauwe sluier over het hele zichtveld.
- Eén herkenbare brede band, met het duidelijkste detail schuin boven de speler. Op gevechtshoogte blijft het contrast laag, zonder zichtbare afsnijding.
- Sterren blijven zwak en spaarzaam; geen twinkeling, lichtstrepen, scherpe lichtpuntclusters of vormen die op gems en projectielen lijken. Schrap sterren eerst als ze in spelbeelden verwarring geven.
- Geen cameraduik, FOV-puls, screenshake, flits of plotselinge belichtingssprong bij de aankomst.
- Ruim vóór nabije vijanden blijft de mist transparant genoeg voor silhouetten, aanvalscues, vloer en arenarand. De kosmische modus krijgt vanaf het begin een vrije zone dicht bij de camera.
- Arena, hand en vijanden houden voldoende zachte invulling om leesbaar te blijven. Alleen de hemel donker maken is onvoldoende. Vijand- en projectielemissie behouden hun herkenbare kleuren.
- Hemel en kosmische mist mogen geen nieuwe brede bloeigloed veroorzaken. Controleer dit met de echte bloominstelling.
- Geen extra omgevingsaudio in de eerste versie; ruimtelijke vijandgeluiden houden voorrang.

## Lichtovergang: van sterrenlicht naar asgloed

Het licht op de vloertegels en de hand verbindt de twee werelden, ook wanneer de speler niet naar de hemel kijkt.

| Tijd | Lichtkarakter | Effect op vloer en hand |
| --- | --- | --- |
| 0–21 s | Een fractie koeler en gerichter dan de huidige opening. | Zwakke indigo accenten op naar de lichtbron gekeerde vlakken; steenreliëf en handvorm krijgen iets duidelijkere schaduwwerking. Geen glanzende materialen of felle neonrand. |
| 21–30 s | De wolkensluier verstrooit het licht steeds meer. | De gerichte bijdrage neemt af, de brede invulling neemt over en de koele tint vloeit naar de huidige asgrauwe opening. |
| Vanaf 30 s | Exact aansluiten op het bestaande lichtverloop bij omgevingstijd 0. | Daarna de huidige lichtontwikkeling volledig volgen, 30 seconden later. |

Gebruik één geleidelijke overgangsparameter voor tint, richtinggevoeligheid en diffuse invulling. Die volgt dezelfde aankomst als hemel en mist, met vloeiende eindsnelheden. Houd de waargenomen helderheid ongeveer gelijk: het verschil moet vooral in kleur en zachtheid zitten, zonder automatische belichtingspuls.

De huidige gedeelde materiaalshader heeft al normalengebaseerde richtinggevoeligheid en een invulterm. Maak die weging tijdens de intro afstelbaar; alleen een blauwere kleur instellen verandert de lichtzachtheid onvoldoende. Een iets smallere, zachte richtingsrespons kan het sterrenlicht suggereren zonder nieuwe schaduwpasses. Op vlakke tegels ontstaat dit vooral uit bestaande geometrie, textuur en mist; beloof geen nieuw microreliëf zonder normal maps.

Geen schermgebonden randlicht rond de hand: het accent volgt de materiaalnormalen en een vaste wereldrichting, ook bij rondkijken. Controleer de bestaande hand-renderroute zodat de overlayhand en arena dezelfde lichtovergang ervaren. Emissieve handdetails, gems, projectielen en herkenbare vijandgloed houden hun eigen karakter. De gerichte bijdrage verdwijnt ook met mist uit; reduced motion behoudt de lichtovergang.

## Technische uitwerking

1. **Gedeelde omgevingsmapping.** Voeg in de presentatiecode een pure evaluator toe die uit de echte tijd de kosmische gewichten en `environmentTime = max(0, time - 30)` afleidt. Voor 30 s wordt het bestaande openingsbeeld als aankomstdoel gebruikt; daarna wordt de bestaande evaluator op environmentTime toegepast. Dit is een afgeleide tijdwaarde, geen nieuwe lopende klok. Laat de huidige basistabellen intact.
2. **`src/descent.ts` en `src/sky.ts`.** Behoud de bestaande hoofdstukcurves en voeg de kosmische compositie via de gedeelde mapping toe. Verre band en stofmaskers blijven in dezelfde skyshader. Vermijd een tweede volledige sky en verschoven hoofdstukindices die de misttabel uit de pas laten lopen.
3. **`src/mist-state.ts` en `src/opening-mist.ts`.** Gebruik dezelfde mapping voor hoofdstukvorm, kleur en uitademcurve. Voeg de ijle kosmische volumestand en aankomst toe binnen het bestaande budget. Controleer hoogtebegrenzing, radiale begrenzing, depth clipping en vrije camerazone.
4. **Splits fase van bewegingstijd.** Laat alle omgevingsbeweging op 30 s aansluiten op het bestaande begin: ook ruisdrift, bankpuls en smoke/landmarkbeweging. Alleen de hoofdstukkleur verschuiven zou een ander beginbeeld opleveren. Kosmische drift heeft een eigen deterministische parameter. Gameplaygebonden lokale lichtbronnen blijven hun actuele posities uit de ongewijzigde simulatie gebruiken.
5. **`src/environment-lighting.ts` en `src/renderer.ts`.** Voeg de koude richtingsweging en diffuse aankomst toe aan de gedeelde materiaalbelichting. Laat bestaande omgevingslichten en eventuele scènefog dezelfde mapping volgen. Pas geen fysieke vloerfuncties of effect-/vijandklokken aan. Inventariseer alle omgevingsconsumenten om dubbele tijdverschuiving te voorkomen.
6. **Preview en controles.** Voeg de nieuwe tijdlijn toe aan `artifacts/descent/preview.html` en de bestaande descent-/mistcontroles. Label echte speltijd en afgeleide omgevingstijd duidelijk in ontwikkeltools. Werk na implementatie de gebruikersdocumentatie en het oudere afdalingplan bij.

De bestaande mistinstelling blijft werken: met mist uit moet de hemel de reis nog steeds begrijpelijk maken. Low quality behoudt band, aankomst en fase-identiteit met minder detail. Reduced motion bevriest ruimtelijke drift; zachte tijdgestuurde kleur-, licht- en faseovergangen blijven zichtbaar.

## Uitvoervolgorde

**A — Compositie en tijdmapping bewijzen.** Bouw eerst de mapping en kosmische hemel. Bekijk 0, 10, 21, 25, 30, 39, 51 en 69 s met echte vijanden. Vergelijk latere beelden op nieuwe tijd t + 30 met de oude omgeving op t, met identieke camera en gecontroleerde scènebelasting.

**B — Volume en licht als één aankomst.** Verbind kosmisch stof, wolkengrens en lage mist met de overgang van koel gericht licht naar diffuse asgloed. Bekijk de eerste 75 seconden op normale snelheid, inclusief zijwaarts bewegen en snel rondkijken. Neem afzonderlijke beelden van vloer en hand op 20, 24, 27 en 30 s. Controleer vooral dat de mist niet tweemaal aankomt.

**C — Compatibiliteit en budget.** Vergelijk bestaande replaybestanden vóór en na de wijziging, inclusief simulatiestatus en eindresultaat. Controleer Low/High, mist uit, reduced motion, pauze, restart, practice, death replay en multiplayer/spectators. In multiplayer blijft de gedeelde matchtijd leidend; respawn herstart de kosmos niet.

## Wanneer het geslaagd is

- De kosmische route voegt 30 seconden aan de omgevingssequentie toe; de volledige huidige opening begint op 30 s en de diepste fase op 472 s.
- Vijandsequentie en alle gameplaytiming zijn identiek. Bestaande replays blijven zonder conversie afspelen en behouden hun simulatie-uitkomst.
- De eerste 75 seconden vormen één vloeiende beweging, zonder zichtbare volumebox, harde horizon, camera-gebonden Melkwegband of sprong op 30 s.
- De overgang van koud gericht licht naar diffuse asgloed is zichtbaar op vloer en hand, terwijl aanvalscues, gems en arenarand duidelijk blijven.
- Rechtstreeks kiezen van een timestamp levert dezelfde omgeving op als doorspelen. Pauze bevriest drift; restart herstelt de kosmos. Practice op 114 s toont de nieuwe omgeving bij echte speltijd 114 s.
- Latere omgevingen komen overeen met hun bestaande vorm en duur, 30 seconden verschoven. Vergelijk met gecontroleerde scènes; live gevechten bevatten op die tijden andere vijanden.
- Bestaande replay-, descent- en misttests, de unit suite en productiebuild slagen. Pas uitsluitend visuele tijdverwachtingen aan waar het nieuwe ontwerp dat vraagt; gameplayverwachtingen blijven behouden.
- Meet de bestaande en nieuwe opening met identieke resolutie, kwaliteit, camerastand en vijandbelasting. Voorlopig budget: geen extra passes/render targets, maximaal 0,5 ms extra mediane GPU-tijd voor hemel en mist samen op de referentiemachine, en maximaal 5% slechtere p95-frametijd op de zwakkere testmachine. Dit zijn acceptatiedoelen, geen gemeten resultaten.
- Bij budgetoverschrijding eerst sterdetail en extra ruissamples vereenvoudigen. Behoud de grote band, de rustige beweging, het lichtkarakter en de aankomst.

## Eerste oplevering

Eén kosmische compositie, een subtiele volumetrische stofpassage, koel sterrenlicht dat overgaat in diffuse asgloed, en daarna de volledige bestaande omgevingsroute. Geen wijzigingen aan de vijandsequentie of replaygegevens. Eerst moet de overgang overtuigen tijdens het spelen.
