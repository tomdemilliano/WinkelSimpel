# Winkel Simpel — ARCHITECTURE.md

## Firestore datastructuur

Alle relaties tussen documenten zijn gebaseerd op ID, nooit op naam of beschrijving.

```
organizations/{orgId}
  Fields:
    name: string
    createdAt: timestamp
    createdBy: string (userId)

  subcollections:

  members/{userId}
    Fields:
      role: 'app_admin' | 'guide' | 'shopper'
      firstName: string
      lastName: string
      email: string (leeg voor shoppers)
      qrToken: string (alleen voor shoppers)
      groupIds: string[]
      createdAt: timestamp

  groups/{groupId}
    Fields:
      name: string
      memberIds: string[] (verwijst naar members/{userId})
      createdAt: timestamp

  products/{productId}
    Fields:
      name: string
      imageUrl: string (Firebase Storage URL)
      unit: string (bijv. 'stuks', 'pak', 'fles')
      createdBy: string (userId)
      createdAt: timestamp

  shoppingLists/{listId}
    Fields:
      title: string
      assignedTo: { type: 'member' | 'group', id: string }
      status: 'draft' | 'active' | 'completed'
      createdBy: string (userId)
      createdAt: timestamp
      completedAt: timestamp | null

    subcollections:

    items/{itemId}
      Fields:
        productId: string
        productName: string (snapshot op moment van aanmaken)
        productImageUrl: string (snapshot)
        quantity: number
        checked: boolean
        order: number (volgorde in het lijstje)
```

## Firebase Storage structuur

```
organizations/{orgId}/products/{productId}/{filename}   → productfoto's
organizations/{orgId}/rewards/{filename}                → beloningsafbeeldingen
```

## Auth flow

### Guide / App admin
1. Login via e-mail + wachtwoord (`/login`)
2. Firebase Auth → Custom Claims bevatten `{ role, orgId }`
3. Redirect naar `/guide` of `/admin` op basis van rol

### Shopper
1. Begeleider genereert QR-code via `/guide/qr/[shopperId]`
2. QR-code bevat: `https://app.url/scan?token={qrToken}`
3. Shopper scant QR → `/scan` valideert token tegen Firestore
4. Sessie wordt opgeslagen in localStorage (geen Firebase Auth sessie)
5. Redirect naar `/shop/[listId]` (actief lijstje van de shopper)

## dbSchema.js — factory-patroon

Alle DB-toegang verloopt via factories in `dbSchema.js`. Directe Firestore-aanroepen buiten dit bestand zijn niet toegestaan.

### Structuur van een factory
```js
// Voorbeeld
export const OrganizationFactory = {
  collection: () => collection(db, 'organizations'),
  doc: (orgId) => doc(db, 'organizations', orgId),
  create: (data) => addDoc(collection(db, 'organizations'), { ...data, createdAt: serverTimestamp() }),
  getById: (orgId) => getDoc(doc(db, 'organizations', orgId)),
  // ...
}
```

### Beschikbare factories
- `OrganizationFactory` — organisaties
- `MemberFactory` — leden binnen een organisatie
- `GroupFactory` — groepen binnen een organisatie
- `ProductFactory` — productbibliotheek
- `ShoppingListFactory` — boodschappenlijstjes
- `ListItemFactory` — items binnen een lijstje
- `StorageFactory` — hulpfuncties voor foto-uploads

## Routing & toegangscontrole

| Route | Toegestaan voor |
|-------|-----------------|
| `/admin/*` | `app_admin` |
| `/guide/*` | `guide` |
| `/shop/[listId]` | `shopper` (via QR-token sessie) |
| `/scan` | iedereen (openbaar, token-validatie intern) |
| `/login` | niet-ingelogde gebruikers |

Rolcontrole gebeurt in `lib/auth.js` via een `withRoleGuard(role, PageComponent)` HOC.

## PWA-configuratie

`/public/manifest.json`:
```json
{
  "name": "Winkel Simpel",
  "short_name": "Winkel",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#4CAF50",
  "icons": [...]
}
```

`next.config.js` voegt de nodige headers toe voor PWA-installatie.

## Naamgeving conventies

| Type | Conventie | Voorbeeld |
|------|-----------|-----------|
| Firestore collections | camelCase | `shoppingLists` |
| Firestore velden | camelCase | `createdAt`, `assignedTo` |
| JS variabelen/functies | camelCase | `getListById` |
| React componenten | PascalCase | `ProductCard` |
| Pagina-bestanden | kebab-case | `list-detail.js` |
| Factory-methoden | camelCase werkwoord | `create`, `getById`, `update` |
