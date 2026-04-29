/**
 * dbSchema.js — Winkel Simpel
 *
 * Central database access layer. All Firestore and Storage operations
 * must go through the factories defined here. Direct Firestore calls
 * outside this file are not permitted.
 *
 * Language: English (field names, collection names, method names)
 * UI language: Dutch (handled in components, not here)
 */

import { db, storage } from './firebase';
import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from 'firebase/storage';

// ---------------------------------------------------------------------------
// Schema description
// ---------------------------------------------------------------------------
//
// organizations/{orgId}
//   members/{userId}
//   groups/{groupId}
//   products/{productId}
//   shoppingLists/{listId}
//     items/{itemId}
//
// All relations use document IDs — never names, titles or descriptions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// OrganizationFactory
// ---------------------------------------------------------------------------
export const OrganizationFactory = {
  /** Reference to the organizations collection */
  collection: () => collection(db, 'organizations'),

  /** Reference to a single organization document */
  doc: (orgId) => doc(db, 'organizations', orgId),

  /** Create a new organization */
  create: async ({ name, createdBy }) => {
    return addDoc(collection(db, 'organizations'), {
      name,
      createdBy,
      createdAt: serverTimestamp(),
    });
  },

  /** Get a single organization by ID */
  getById: (orgId) => getDoc(doc(db, 'organizations', orgId)),

  /** Get all organizations */
  getAll: () => getDocs(collection(db, 'organizations')),

  /** Update organization fields */
  update: (orgId, data) => updateDoc(doc(db, 'organizations', orgId), data),

  /** Delete an organization */
  delete: (orgId) => deleteDoc(doc(db, 'organizations', orgId)),
};

// ---------------------------------------------------------------------------
// MemberFactory
// ---------------------------------------------------------------------------
export const MemberFactory = {
  /** Reference to the members collection within an organization */
  collection: (orgId) => collection(db, 'organizations', orgId, 'members'),

  /** Reference to a single member document */
  doc: (orgId, userId) => doc(db, 'organizations', orgId, 'members', userId),

  /**
   * Create or overwrite a member document.
   * Uses the Firebase Auth UID as the document ID.
   * For shoppers, email is empty and qrToken is set.
   */
  set: async (orgId, userId, { role, firstName, lastName, email = '', qrToken = null, groupIds = [] }) => {
    const memberDoc = doc(db, 'organizations', orgId, 'members', userId);
    return updateDoc(memberDoc, {
      role,
      firstName,
      lastName,
      email,
      qrToken,
      groupIds,
      createdAt: serverTimestamp(),
    }).catch(() =>
      // Document does not exist yet — use setDoc
      import('firebase/firestore').then(({ setDoc }) =>
        setDoc(memberDoc, {
          role,
          firstName,
          lastName,
          email,
          qrToken,
          groupIds,
          createdAt: serverTimestamp(),
        })
      )
    );
  },

  /** Get a single member by ID */
  getById: (orgId, userId) =>
    getDoc(doc(db, 'organizations', orgId, 'members', userId)),

  /** Get all members of an organization */
  getAll: (orgId) =>
    getDocs(collection(db, 'organizations', orgId, 'members')),

  /** Get all members with a specific role */
  getByRole: (orgId, role) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'members'),
        where('role', '==', role)
      )
    ),

  /** Find a shopper by QR token */
  getByQrToken: (orgId, qrToken) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'members'),
        where('qrToken', '==', qrToken),
        where('role', '==', 'shopper')
      )
    ),

  /** Update member fields */
  update: (orgId, userId, data) =>
    updateDoc(doc(db, 'organizations', orgId, 'members', userId), data),

  /** Delete a member */
  delete: (orgId, userId) =>
    deleteDoc(doc(db, 'organizations', orgId, 'members', userId)),
};

// ---------------------------------------------------------------------------
// GroupFactory
// ---------------------------------------------------------------------------
export const GroupFactory = {
  /** Reference to the groups collection within an organization */
  collection: (orgId) => collection(db, 'organizations', orgId, 'groups'),

  /** Reference to a single group document */
  doc: (orgId, groupId) => doc(db, 'organizations', orgId, 'groups', groupId),

  /** Create a new group */
  create: async (orgId, { name, memberIds = [] }) => {
    return addDoc(collection(db, 'organizations', orgId, 'groups'), {
      name,
      memberIds,
      createdAt: serverTimestamp(),
    });
  },

  /** Get a single group by ID */
  getById: (orgId, groupId) =>
    getDoc(doc(db, 'organizations', orgId, 'groups', groupId)),

  /** Get all groups in an organization */
  getAll: (orgId) =>
    getDocs(collection(db, 'organizations', orgId, 'groups')),

  /** Update group fields (e.g. name or memberIds) */
  update: (orgId, groupId, data) =>
    updateDoc(doc(db, 'organizations', orgId, 'groups', groupId), data),

  /** Delete a group */
  delete: (orgId, groupId) =>
    deleteDoc(doc(db, 'organizations', orgId, 'groups', groupId)),
};

// ---------------------------------------------------------------------------
// ProductFactory
// ---------------------------------------------------------------------------
export const ProductFactory = {
  /** Reference to the products collection within an organization */
  collection: (orgId) => collection(db, 'organizations', orgId, 'products'),

  /** Reference to a single product document */
  doc: (orgId, productId) =>
    doc(db, 'organizations', orgId, 'products', productId),

  /** Create a new product */
  create: async (orgId, { name, imageUrl, unit = 'stuks', createdBy }) => {
    return addDoc(collection(db, 'organizations', orgId, 'products'), {
      name,
      imageUrl,
      unit,
      createdBy,
      createdAt: serverTimestamp(),
    });
  },

  /** Get a single product by ID */
  getById: (orgId, productId) =>
    getDoc(doc(db, 'organizations', orgId, 'products', productId)),

  /** Get all products in an organization, ordered by name */
  getAll: (orgId) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'products'),
        orderBy('name', 'asc')
      )
    ),

  /** Update product fields */
  update: (orgId, productId, data) =>
    updateDoc(doc(db, 'organizations', orgId, 'products', productId), data),

  /** Delete a product */
  delete: (orgId, productId) =>
    deleteDoc(doc(db, 'organizations', orgId, 'products', productId)),
};

// ---------------------------------------------------------------------------
// ShoppingListFactory
// ---------------------------------------------------------------------------
export const ShoppingListFactory = {
  /** Reference to the shoppingLists collection within an organization */
  collection: (orgId) =>
    collection(db, 'organizations', orgId, 'shoppingLists'),

  /** Reference to a single shopping list document */
  doc: (orgId, listId) =>
    doc(db, 'organizations', orgId, 'shoppingLists', listId),

  /**
   * Create a new shopping list.
   * assignedTo: { type: 'member' | 'group', id: string }
   */
  create: async (orgId, { title, assignedTo, createdBy }) => {
    return addDoc(
      collection(db, 'organizations', orgId, 'shoppingLists'),
      {
        title,
        assignedTo,
        status: 'draft',
        createdBy,
        createdAt: serverTimestamp(),
        completedAt: null,
      }
    );
  },

  /** Get a single shopping list by ID */
  getById: (orgId, listId) =>
    getDoc(doc(db, 'organizations', orgId, 'shoppingLists', listId)),

  /** Get all shopping lists in an organization */
  getAll: (orgId) =>
    getDocs(collection(db, 'organizations', orgId, 'shoppingLists')),

  /** Get the active shopping list for a specific member */
  getActiveForMember: (orgId, memberId) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'shoppingLists'),
        where('assignedTo.type', '==', 'member'),
        where('assignedTo.id', '==', memberId),
        where('status', '==', 'active')
      )
    ),

  /** Update shopping list fields (e.g. status) */
  update: (orgId, listId, data) =>
    updateDoc(
      doc(db, 'organizations', orgId, 'shoppingLists', listId),
      data
    ),

  /** Mark a shopping list as completed */
  complete: (orgId, listId) =>
    updateDoc(doc(db, 'organizations', orgId, 'shoppingLists', listId), {
      status: 'completed',
      completedAt: serverTimestamp(),
    }),

  /** Delete a shopping list (and all its items via batch) */
  delete: async (orgId, listId) => {
    const batch = writeBatch(db);
    const itemsSnap = await getDocs(
      collection(db, 'organizations', orgId, 'shoppingLists', listId, 'items')
    );
    itemsSnap.forEach((itemDoc) => batch.delete(itemDoc.ref));
    batch.delete(doc(db, 'organizations', orgId, 'shoppingLists', listId));
    return batch.commit();
  },
  /** Get the active shopping list for a specific group */
  getActiveForGroup: (orgId, groupId) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'shoppingLists'),
        where('assignedTo.type', '==', 'group'),
        where('assignedTo.id', '==', groupId),
        where('status', '==', 'active')
      )
    ),
  /** Activate a list and write a groupToken (used when assigned to a group) */
  activate: async (orgId, listId) => {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const groupToken = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    await updateDoc(doc(db, 'organizations', orgId, 'shoppingLists', listId), {
      status: 'active',
      groupToken,
    });
    return groupToken;
    },
  
};

// ---------------------------------------------------------------------------
// ListItemFactory
// ---------------------------------------------------------------------------
export const ListItemFactory = {
  /** Reference to the items collection within a shopping list */
  collection: (orgId, listId) =>
    collection(
      db,
      'organizations',
      orgId,
      'shoppingLists',
      listId,
      'items'
    ),

  /** Reference to a single item document */
  doc: (orgId, listId, itemId) =>
    doc(
      db,
      'organizations',
      orgId,
      'shoppingLists',
      listId,
      'items',
      itemId
    ),

  /**
   * Add an item to a shopping list.
   * Snapshots the product name and image at the time of creation,
   * so the list remains correct even if the product is later edited.
   */
  create: async (orgId, listId, { productId, productName, productImageUrl, quantity, order }) => {
    return addDoc(
      collection(db, 'organizations', orgId, 'shoppingLists', listId, 'items'),
      {
        productId,
        productName,       // snapshot
        productImageUrl,   // snapshot
        quantity,
        checked: false,
        order,
        createdAt: serverTimestamp(),
      }
    );
  },

  /** Get all items in a shopping list, ordered by their display order */
  getAll: (orgId, listId) =>
    getDocs(
      query(
        collection(
          db,
          'organizations',
          orgId,
          'shoppingLists',
          listId,
          'items'
        ),
        orderBy('order', 'asc')
      )
    ),

  /** Mark an item as checked (shopper took it) */
  check: (orgId, listId, itemId) =>
    updateDoc(
      doc(db, 'organizations', orgId, 'shoppingLists', listId, 'items', itemId),
      { checked: true }
    ),

  /** Uncheck an item */
  uncheck: (orgId, listId, itemId) =>
    updateDoc(
      doc(db, 'organizations', orgId, 'shoppingLists', listId, 'items', itemId),
      { checked: false }
    ),

  /** Update item fields (e.g. quantity or order) */
  update: (orgId, listId, itemId, data) =>
    updateDoc(
      doc(db, 'organizations', orgId, 'shoppingLists', listId, 'items', itemId),
      data
    ),

  /** Delete an item */
  delete: (orgId, listId, itemId) =>
    deleteDoc(
      doc(db, 'organizations', orgId, 'shoppingLists', listId, 'items', itemId)
    ),
};

// ---------------------------------------------------------------------------
// StorageFactory
// ---------------------------------------------------------------------------
export const StorageFactory = {
  /**
   * Upload a product image.
   * Returns the public download URL.
   */
  uploadProductImage: async (orgId, productId, file) => {
    const extension = file.name.split('.').pop();
    const storageRef = ref(
      storage,
      `organizations/${orgId}/products/${productId}/${Date.now()}.${extension}`
    );
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  },

  /**
   * Upload a reward image (shown on the completion screen).
   * Returns the public download URL.
   */
  uploadRewardImage: async (orgId, file) => {
    const extension = file.name.split('.').pop();
    const storageRef = ref(
      storage,
      `organizations/${orgId}/rewards/${Date.now()}.${extension}`
    );
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  },

  /**
   * Delete a file from Storage by its full URL.
   */
  deleteByUrl: async (url) => {
    const fileRef = ref(storage, url);
    return deleteObject(fileRef);
  },

  /**
   * Upload a store logo.
   * Returns the public download URL.
   */
  uploadStoreLogo: async (orgId, storeId, file) => {
    const extension = file.name.split('.').pop();
    const storageRef = ref(
      storage,
      `organizations/${orgId}/stores/${storeId}/${Date.now()}.${extension}`
    );
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  },
  
};

// ---------------------------------------------------------------------------
// CentralProductFactory — centrale productbibliotheek (root level)
// ---------------------------------------------------------------------------
export const CentralProductFactory = {
  collection: () => collection(db, 'products'),
  doc: (productId) => doc(db, 'products', productId),

  getAll: () =>
    getDocs(query(collection(db, 'products'), orderBy('name', 'asc'))),

  getByName: (name) =>
    getDocs(query(
      collection(db, 'products'),
      where('nameLower', '==', name.toLowerCase().trim())
    )),

  create: async ({ name, imageUrl, unit, approvedBy, sourceOrgId, sourceProductId }) =>
    addDoc(collection(db, 'products'), {
      name,
      nameLower: name.toLowerCase().trim(),
      imageUrl,
      unit,
      approvedBy,
      sourceOrgId,
      sourceProductId,
      approvedAt: serverTimestamp(),
    }),

  delete: (productId) => deleteDoc(doc(db, 'products', productId)),
};

// ---------------------------------------------------------------------------
// ProductSubmissionFactory — wachtrij voor admin review
// ---------------------------------------------------------------------------
export const ProductSubmissionFactory = {
  collection: () => collection(db, 'productSubmissions'),
  doc: (id) => doc(db, 'productSubmissions', id),

  create: async ({ name, imageUrl, unit, orgId, orgProductId }) =>
    addDoc(collection(db, 'productSubmissions'), {
      name,
      nameLower: name.toLowerCase().trim(),
      imageUrl,
      unit,
      orgId,
      orgProductId,
      status: 'pending',
      centralProductId: null,
      submittedAt: serverTimestamp(),
    }),

  getPending: () =>
    getDocs(query(
      collection(db, 'productSubmissions'),
      where('status', '==', 'pending'),
      orderBy('submittedAt', 'asc')
    )),

  getAll: () =>
    getDocs(query(
      collection(db, 'productSubmissions'),
      orderBy('submittedAt', 'desc')
    )),

  approve: (id, centralProductId) =>
    updateDoc(doc(db, 'productSubmissions', id), {
      status: 'approved',
      centralProductId,
      reviewedAt: serverTimestamp(),
    }),

  reject: (id) =>
    updateDoc(doc(db, 'productSubmissions', id), {
      status: 'rejected',
      reviewedAt: serverTimestamp(),
    }),

  getByOrgProduct: (orgProductId) =>
    getDocs(query(
      collection(db, 'productSubmissions'),
      where('orgProductId', '==', orgProductId)
    )),
};

// ---------------------------------------------------------------------------
// StoreFactory — winkelbibliotheek binnen een organisatie
// ---------------------------------------------------------------------------
export const StoreFactory = {
  /** Reference to the stores collection within an organization */
  collection: (orgId) => collection(db, 'organizations', orgId, 'stores'),

  /** Reference to a single store document */
  doc: (orgId, storeId) =>
    doc(db, 'organizations', orgId, 'stores', storeId),

  /**
   * Create a new store or chain.
   * For type 'chain', address fields are null.
   * For type 'store', address fields are required.
   */
  create: async (orgId, {
    name,
    type,
    logoUrl = '',
    street = null,
    houseNumber = null,
    postalCode = null,
    city = null,
    createdBy,
  }) => {
    return addDoc(collection(db, 'organizations', orgId, 'stores'), {
      name,
      nameLower: name.toLowerCase().trim(),
      type,
      logoUrl,
      street,
      houseNumber,
      postalCode,
      city,
      createdBy,
      createdAt: serverTimestamp(),
    });
  },

  /** Get a single store by ID */
  getById: (orgId, storeId) =>
    getDoc(doc(db, 'organizations', orgId, 'stores', storeId)),

  /** Get all stores in an organization, ordered by name */
  getAll: (orgId) =>
    getDocs(
      query(
        collection(db, 'organizations', orgId, 'stores'),
        orderBy('name', 'asc')
      )
    ),

  /** Update store fields */
  update: (orgId, storeId, data) =>
    updateDoc(doc(db, 'organizations', orgId, 'stores', storeId), data),

  /** Delete a store */
  delete: (orgId, storeId) =>
    deleteDoc(doc(db, 'organizations', orgId, 'stores', storeId)),
};

// ---------------------------------------------------------------------------
// CentralStoreFactory — centrale winkelbibliotheek (root level)
// ---------------------------------------------------------------------------
export const CentralStoreFactory = {
  collection: () => collection(db, 'stores'),
  doc: (storeId) => doc(db, 'stores', storeId),

  getAll: () =>
    getDocs(query(collection(db, 'stores'), orderBy('name', 'asc'))),

  getByName: (name) =>
    getDocs(
      query(
        collection(db, 'stores'),
        where('nameLower', '==', name.toLowerCase().trim())
      )
    ),

  create: async ({
    name,
    type,
    logoUrl,
    approvedBy,
    sourceOrgId,
    sourceStoreId,
  }) =>
    addDoc(collection(db, 'stores'), {
      name,
      nameLower: name.toLowerCase().trim(),
      type,
      logoUrl,
      approvedBy,
      sourceOrgId,
      sourceStoreId,
      approvedAt: serverTimestamp(),
    }),

  delete: (storeId) => deleteDoc(doc(db, 'stores', storeId)),
};

// ---------------------------------------------------------------------------
// StoreSubmissionFactory — wachtrij voor admin review
// ---------------------------------------------------------------------------
export const StoreSubmissionFactory = {
  collection: () => collection(db, 'storeSubmissions'),
  doc: (id) => doc(db, 'storeSubmissions', id),

  create: async ({ name, type, logoUrl, orgId, orgStoreId }) =>
    addDoc(collection(db, 'storeSubmissions'), {
      name,
      nameLower: name.toLowerCase().trim(),
      type,
      logoUrl,
      orgId,
      orgStoreId,
      status: 'pending',
      centralStoreId: null,
      submittedAt: serverTimestamp(),
    }),

  getPending: () =>
    getDocs(
      query(
        collection(db, 'storeSubmissions'),
        where('status', '==', 'pending'),
        orderBy('submittedAt', 'asc')
      )
    ),

  getAll: () =>
    getDocs(
      query(
        collection(db, 'storeSubmissions'),
        orderBy('submittedAt', 'desc')
      )
    ),

  approve: (id, centralStoreId) =>
    updateDoc(doc(db, 'storeSubmissions', id), {
      status: 'approved',
      centralStoreId,
      reviewedAt: serverTimestamp(),
    }),

  reject: (id) =>
    updateDoc(doc(db, 'storeSubmissions', id), {
      status: 'rejected',
      reviewedAt: serverTimestamp(),
    }),

  getByOrgStore: (orgStoreId) =>
    getDocs(
      query(
        collection(db, 'storeSubmissions'),
        where('orgStoreId', '==', orgStoreId)
      )
    ),
};
