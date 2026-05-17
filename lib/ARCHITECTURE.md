# Winkel Simpel — ARCHITECTURE.md

## Firestore datastructuur

Alle relaties tussen documenten zijn gebaseerd op ID, nooit op naam of beschrijving.

---

### Organisatie-niveau (subcollecties onder `organizations/{orgId}`)

```
organizations/{orgId}
  Fields:
    name: string
    createdAt: timestamp
    createdBy: string (userId)
    isPrivate: boolean (true voor privé-organisaties aangemaakt via zelfregistratie)

  members/{userId}
    Fields:
      role: 'app_admin' | 'guide' | 'org_admin' | 'shopper'
      firstName: string
      lastName: string
      email: string (leeg voor shoppers)
      qrToken: string | null (alleen voor shoppers)
      groupIds: string[]
      createdAt: timestamp

  groups/{groupId}
    Fields:
      name: string
      memberIds: string[] (verwijst naar members/{userId})
      createdAt: timestamp

  categories/{categoryId}
    Fields:
      name: string
      iconUrl: string (Firebase Storage URL of ARASAAC URL)
      arasaacId: number | null (ARASAAC pictogram-ID)
      color: string (hex, bijv. '#4CAF50')
      createdBy: string (userId)
      createdAt: timestamp
      centralCategoryId?: string  — aanwezig als deze categorie gekoppeld is aan een centrale categorie

  products/{productId}
    Fields:
      name: string
      imageUrl: string (Firebase Storage URL of externe URL)
      unit: string ('stuks' | 'pak' | 'fles' | 'blik' | 'zak' | 'doos' | 'pot' | 'kg')
      categoryId: string | null (verwijst naar categories/{categoryId} binnen dezelfde org)
      createdBy: string (userId)
      createdAt: timestamp
      centralProductId?: string  — aanwezig als dit product gekoppeld is aan een centraal product

  stores/{storeId}
    Fields:
      name: string
      nameLower: string (voor zoeken, lowercase + trim)
      type: 'chain' | 'store'
      logoUrl: string
      street: string | null      (enkel voor type='store')
      houseNumber: string | null (enkel voor type='store')
      postalCode: string | null  (enkel voor type='store')
      city: string | null        (enkel voor type='store')
      createdBy: string (userId)
      createdAt: timestamp

  shoppingLists/{listId}
    Fields:
      title: string
      assignedTo: { type: 'member' | 'group', id: string }
      status: 'draft' | 'active' | 'completed'
      groupToken: string | null  (aanwezig na activatie van een groepslijst)
      createdBy: string (userId)
      createdAt: timestamp
      completedAt: timestamp | null

    items/{itemId}
      Fields:
        productId: string
        productName: string      (snapshot op moment van aanmaken)
        productImageUrl: string  (snapshot)
        categoryId: string | null   (snapshot)
        categoryName: string | null (snapshot)
        categoryIconUrl: string | null (snapshot)
        quantity: number
        checked: boolean
        order: number (volgorde in het lijstje)
        createdAt: timestamp
```

---

### Platform-niveau (root-collecties)

```
categories/{centralCategoryId}
  Fields:
    name: string
    nameLower: string (voor zoeken, lowercase + trim)
    iconUrl: string
    color: string (hex)
    approvedBy: string (userId van app_admin)
    sourceOrgId: string (org die de categorie indiende)
    sourceCategoryId: string (org-categorie-ID waaruit deze is aangemaakt)
    approvedAt: timestamp

products/{centralProductId}
  Fields:
    name: string
    nameLower: string (voor zoeken, lowercase + trim)
    imageUrl: string
    unit: string
    centralCategoryId: string | null (verwijst naar categories/{centralCategoryId})
    approvedBy: string (userId van app_admin)
    sourceOrgId: string
    sourceProductId: string (org-product-ID waaruit dit is aangemaakt)
    approvedAt: timestamp

productSubmissions/{submissionId}
  Fields:
    name: string
    nameLower: string
    imageUrl: string
    unit: string
    orgId: string
    orgProductId: string
    orgCategoryId: string | null
    orgCategoryName: string | null      (snapshot van categorie op moment van indienen)
    orgCategoryIconUrl: string | null   (snapshot)
    orgCategoryColor: string | null     (snapshot)
    orgCategoryCentralId: string | null (centralCategoryId van de org-categorie, indien al gekoppeld)
    status: 'pending' | 'approved' | 'rejected'
    centralProductId: string | null     (ingevuld na goedkeuring)
    submittedAt: timestamp
    reviewedAt: timestamp | null

stores/{centralStoreId}
  Fields:
    name: string
    nameLower: string
    type: 'chain' | 'store'
    logoUrl: string
    approvedBy: string (userId van app_admin)
    sourceOrgId: string
    sourceStoreId: string
    approvedAt: timestamp

storeSubmissions/{submissionId}
  Fields:
    name: string
    nameLower: string
    type: 'chain' | 'store'
    logoUrl: string
    orgId: string
    orgStoreId: string
    status: 'pending' | 'approved' | 'rejected'
    centralStoreId: string | null (ingevuld na goedkeuring)
    submittedAt: timestamp
    reviewedAt: timestamp | null

accessRequests/{requestId}
  Fields:
    requestingUserId: string (uid van de aanvrager)
    requestingUserEmail: string
    requestingUserName: string
    targetOrgId: string (org waarvoor toegang aangevraagd wordt)
    targetOrgName: string (snapshot)
    status: 'pending' | 'approved' | 'rejected'
    createdAt: timestamp
    processedAt: timestamp | null
    processedBy: string | null (uid van de verwerker)
```

---

## Centrale bibliotheek — goedkeuringsflow

### Producten
1. Guide maakt product aan in org-bibliotheek → opgeslagen in `organizations/{orgId}/products`
2. Product wordt automatisch ingediend in `productSubmissions` (status: `pending`)
   - Inclusief snapshot van de categorie op moment van indienen
3. App-admin beoordeelt in het beheerderspaneel:
   - **Goedkeuren**: centraal product aangemaakt in `products/`, categorie-beslissing verwerkt (nieuw aanmaken, koppelen of overslaan), org-product krijgt `centralProductId`
   - **Weigeren**: status wordt `rejected`, org-product blijft ongewijzigd
4. Deduplicatie in de org-weergave: als een org-product `centralProductId` heeft, wordt het centrale product niet apart getoond

### Categorieën
- Categorieën worden ingediend als onderdeel van een product-submission (niet apart)
- Bij goedkeuring beslist de admin per categorie: toevoegen aan centrale bibliotheek, koppelen aan bestaande, of overslaan
- Na goedkeuring: org-categorie krijgt `centralCategoryId`, centrale categorie aangemaakt in `categories/`
- Deduplicatie: als een org-categorie `centralCategoryId` heeft, wordt de centrale categorie niet apart getoond
- Orgs kunnen centrale categorieën kopiëren naar hun eigen bibliotheek (kopie krijgt `centralCategoryId`)

### Winkels
- Zelfde patroon als producten, via `storeSubmissions` → `stores/`

---

## Firebase Storage structuur

```
organizations/{orgId}/products/{productId}/{timestamp}.{ext}    → productfoto's
organizations/{orgId}/rewards/{timestamp}.{ext}                 → beloningsafbeeldingen
organizations/{orgId}/categories/{categoryId}/{timestamp}.{ext} → categorie-iconen (eigen uploads)
organizations/{orgId}/stores/{storeId}/{timestamp}.{ext}        → winkellogo's
```

Externe afbeeldingen (ARASAAC-pictogrammen, geïmporteerde productfoto's) worden als URL opgeslagen in Firestore en niet gekopieerd naar Storage.

---

## Auth flow

### Guide / App admin / Org admin
1. Login via e-mail + wachtwoord (`/login`) of zelfregistratie via `/register`
2. Firebase Auth → Custom Claims bevatten `{ role, orgId, orgType }`
   - `orgType: 'organization'` voor begeleiders binnen een organisatie
   - `orgType: 'private'` voor stand-alone gebruikers (eenmansorganisatie)
3. Redirect naar `/guide` of `/admin` op basis van rol

### Shopper
1. Begeleider genereert QR-code via `/guide/qr/[shopperId]`
2. QR-code bevat: `https://app.url/scan?token={qrToken}`
3. Shopper scant QR → `/scan` valideert token tegen Firestore
4. Sessie wordt opgeslagen in localStorage (geen Firebase Auth sessie)
5. Redirect naar `/shop/[listId]` (actief lijstje van de shopper)

---

## dbSchema.js — factory-patroon

Alle DB-toegang verloopt via factories in `dbSchema.js`. Directe Firestore-aanroepen buiten dit bestand zijn niet toegestaan.

### Structuur van een factory
```js
export const OrganizationFactory = {
  collection: () => collection(db, 'organizations'),
  doc: (orgId) => doc(db, 'organizations', orgId),
  create: (data) => addDoc(collection(db, 'organizations'), { ...data, createdAt: serverTimestamp() }),
  getById: (orgId) => getDoc(doc(db, 'organizations', orgId)),
  // ...
}
```

### Beschikbare factories

| Factory | Collectie | Omschrijving |
|---------|-----------|--------------|
| `OrganizationFactory` | `organizations/` | Organisaties |
| `MemberFactory` | `organizations/{orgId}/members/` | Leden (guides, shoppers, org_admins) |
| `GroupFactory` | `organizations/{orgId}/groups/` | Groepen van shoppers |
| `CategoryFactory` | `organizations/{orgId}/categories/` | Org-specifieke categorieën |
| `ProductFactory` | `organizations/{orgId}/products/` | Org-specifieke producten |
| `StoreFactory` | `organizations/{orgId}/stores/` | Org-specifieke winkels/ketens |
| `ShoppingListFactory` | `organizations/{orgId}/shoppingLists/` | Boodschappenlijstjes |
| `ListItemFactory` | `organizations/{orgId}/shoppingLists/{listId}/items/` | Items in een lijstje |
| `StorageFactory` | Firebase Storage | Upload/delete van afbeeldingen |
| `CentralCategoryFactory` | `categories/` | Centrale categoriebibliotheek |
| `CentralProductFactory` | `products/` | Centrale productbibliotheek |
| `ProductSubmissionFactory` | `productSubmissions/` | Wachtrij voor productgoedkeuring |
| `CentralStoreFactory` | `stores/` | Centrale winkelbibliotheek |
| `StoreSubmissionFactory` | `storeSubmissions/` | Wachtrij voor winkelgoedkeuring |
| `AccessRequestFactory` | `accessRequests/` | Toegangsverzoeken van stand-alone gebruikers |

---

## Routing & toegangscontrole

| Route | Toegestaan voor |
|-------|-----------------|
| `/admin/*` | `app_admin` |
| `/guide/*` | `guide`, `org_admin` |
| `/shop/[listId]` | `shopper` (via QR-token sessie) |
| `/scan` | iedereen (openbaar, token-validatie intern) |
| `/login` | niet-ingelogde gebruikers |

Rolcontrole gebeurt in `lib/auth.js` via een `withRoleGuard(role, PageComponent)` HOC.

---

## Naamgeving conventies

| Type | Conventie | Voorbeeld |
|------|-----------|-----------|
| Firestore collections | camelCase | `shoppingLists`, `productSubmissions` |
| Firestore velden | camelCase | `createdAt`, `centralProductId` |
| JS variabelen/functies | camelCase | `getListById`, `submitToCentral` |
| React componenten | PascalCase | `ProductCard`, `SubmissionCard` |
| Pagina-bestanden | kebab-case of camelCase | `library.js`, `categories.js` |
| Factory-methoden | camelCase werkwoord | `create`, `getById`, `update`, `getPending` |

---

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
