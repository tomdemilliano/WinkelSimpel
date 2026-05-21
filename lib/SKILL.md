# Winkel Simpel — SKILL.md

## Doel van de app
Winkel Simpel stelt mensen met een beperking in staat om zelfstandig boodschappen te doen met behulp van een visueel boodschappenlijstje. Begeleiders maken lijstjes aan vanuit een productbibliotheek en wijzen deze toe aan shoppers. Shoppers navigeren via een maximaal visuele interface.

## Tech stack
- **Framework**: Next.js (Pages Router)
- **Database**: Firebase Firestore
- **Auth**: Firebase Authentication
- **Storage**: Firebase Storage (productfoto's, beloningsafbeeldingen)
- **Hosting**: Vercel
- **Taal code**: English (variabelen, functies, comments, documentnamen, veldnamen)
- **Taal UI**: Nederlands

## Rollen
| Rol | Omschrijving |
|-----|--------------|
| `app_admin` | Beheert organisaties en gebruikers op platformniveau |
| `guide` | Begeleider binnen een organisatie: beheert producten, lijstjes, groepen |
| `shopper` | Persoon met beperking: gebruikt het visuele lijstje in de winkel |

## Authenticatie
- `app_admin` en `guide`: e-mail + wachtwoord via Firebase Auth
- `shopper`: QR-code scan → token-gebaseerde sessie (geen wachtwoord, geen lezen vereist)
- Rol wordt opgeslagen als Firebase Custom Claim én in Firestore

## UI-principes

### Shopperinterface (kritisch)
- Altijd volledig scherm, geen navigatiebalk
- Productfoto zo groot mogelijk (min. 60% van het scherm)
- Productnaam: groot lettertype (min. 2rem), eenvoudig, leesbaar
- Aantal: zeer groot en duidelijk weergegeven
- "Genomen"-knop: groot, contrastrijk, onderin het scherm
- Navigatie: swipe links/rechts of grote pijlknoppen
- Klaar-scherm: grote afbeelding + korte stimulerende tekst
- Geen afleidende elementen, geen kleine teksten

### Begeleidersinterface
- Standaard mobiel-vriendelijke UI
- Productbibliotheek met zoekfunctie en filtermogelijkheid
- Drag-and-drop of eenvoudige knoppen voor lijstje samenstellen
- QR-kaartje genereren en afdrukken per shopper

### Admin-interface
- Eenvoudige tabelweergave
- Organisaties, gebruikers en rollen beheren

## Regels voor nieuwe ontwikkeling
1. **Alle DB-toegang via `dbSchema.js`** — nooit rechtstreeks Firestore aanroepen buiten de factories
2. **Relaties altijd via ID** — nooit op naam, titel of beschrijving
3. **Engelstalige DB** — alle documentnamen, veldnamen, collection-namen in het Engels
4. **Nederlandstalige UI** — alle labels, knoppen, meldingen in het Nederlands
5. **Foto's in Firebase Storage** — nooit base64 in Firestore opslaan
6. **PWA-ready** — app moet installeerbaar zijn op smartphone
7. **Shopper-first** — bij twijfel over UX-keuze: kies de meest toegankelijke optie
8. **Firestore rules in de repo** — `firestore.rules` is de enige bron van waarheid voor beveiligingsregels. Bij elke nieuwe collectie of schrijfoperatie: regel toevoegen in `firestore.rules` én deployen via `firebase deploy --only firestore:rules`

## Bestandsstructuur
```
/pages
  index.js               → redirect op basis van rol
  login.js               → inlogpagina (guide/admin)
  register.js            → zelfregistratie (stand-alone gebruikers)
  scan.js                → QR-scan pagina (shopper)
  /admin
    index.js             → organisatiebeheer
    users.js             → gebruikersbeheer
  /guide
    index.js             → dashboard begeleider
    library.js           → productbibliotheek
    lists.js             → lijstjes overzicht
    list/[id].js         → lijstje detail & toewijzen
    groups.js            → groepen & leden
    request-access.js    → aansluiten bij een organisatie (stand-alone gebruikers)
    qr/[shopperId].js    → QR-kaartje afdrukken
  /shop
    [listId].js          → shopperinterface (volledig scherm)
/lib
  firebase.js            → Firebase initialisatie
  dbSchema.js            → alle factories & DB-beschrijving
  auth.js                → auth helpers & rol-check
/components
  shopper/               → componenten exclusief voor shopperinterface
  guide/                 → componenten voor begeleidersinterface
  admin/                 → componenten voor admininterface
  shared/                → gedeelde componenten
/public
  manifest.json          → PWA manifest
```
