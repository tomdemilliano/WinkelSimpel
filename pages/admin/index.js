/**
 * pages/admin/index.js — Winkel Simpel
 *
 * App admin dashboard met tabs:
 * - Organisaties: overzicht + aanmaken
 * - Centrale bibliotheek: productsubmissions reviewen + centrale producten beheren
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import { OrganizationFactory, CentralProductFactory, ProductSubmissionFactory, ProductFactory, CentralCategoryFactory, CategoryFactory, OrganizationFactory as OrgFactory, CentralStoreFactory, StoreSubmissionFactory, StorageFactory } from '../../lib/dbSchema';

function AdminDashboard({ claims }) {
  const router = useRouter();
  const [tab, setTab] = useState('orgs'); // 'orgs' | 'library'

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Beheerderspaneel</p>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut}>Afmelden</button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button style={{ ...styles.tab, ...(tab === 'orgs' ? styles.tabActive : {}) }} onClick={() => setTab('orgs')}>
          Organisaties
        </button>
        <button style={{ ...styles.tab, ...(tab === 'library' ? styles.tabActive : {}) }} onClick={() => setTab('library')}>
          Centrale bibliotheek
        </button>
        <button style={{ ...styles.tab, ...(tab === 'stores' ? styles.tabActive : {}) }} onClick={() => setTab('stores')}>
          Winkels
        </button>
      </div>

      {tab === 'orgs' && <OrgsTab claims={claims} router={router} />}
      {tab === 'library' && <LibraryTab claims={claims} />}
      {tab === 'stores' && <StoresTab claims={claims} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgsTab
// ---------------------------------------------------------------------------
function OrgsTab({ claims, router }) {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { loadOrganizations(); }, []);

  async function loadOrganizations() {
    setLoading(true);
    try {
      const snap = await OrganizationFactory.getAll();
      setOrganizations(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      );
    } finally { setLoading(false); }
  }

  async function handleDeleteOrg(org) {
    if (!confirm(`Organisatie "${org.name}" verwijderen?`)) return;
    await OrganizationFactory.delete(org.id);
    setOrganizations(prev => prev.filter(o => o.id !== org.id));
  }

  return (
    <>
      <div style={styles.statsBar}>
        <div style={styles.statItem}>
          <span style={styles.statValue}>{organizations.length}</span>
          <span style={styles.statLabel}>organisaties</span>
        </div>
      </div>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Organisaties</p>
        <button style={styles.addButton} onClick={() => setShowForm(true)}>+ Nieuw</button>
      </div>
      {loading ? (
        <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>
      ) : organizations.length === 0 ? (
        <div style={styles.centered}><p style={styles.hint}>Nog geen organisaties.</p></div>
      ) : (
        <div style={styles.cardList}>
          {organizations.map(org => (
            <OrgCard key={org.id} org={org}
              onManage={() => router.push(`/admin/users?org=${org.id}&name=${encodeURIComponent(org.name)}`)}
              onDelete={() => handleDeleteOrg(org)} />
          ))}
        </div>
      )}
      {showForm && (
        <NewOrgForm claims={claims}
          onSave={async () => { setShowForm(false); await loadOrganizations(); }}
          onClose={() => setShowForm(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// LibraryTab
// ---------------------------------------------------------------------------
function LibraryTab({ claims }) {
  const [pending, setPending] = useState([]);
  const [central, setCentral] = useState([]);
  const [centralCategories, setCentralCategories] = useState([]);
  const [orgs, setOrgs] = useState({});
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('pending'); // 'pending' | 'approved' | 'categories'
  const [editingCategory, setEditingCategory] = useState(null); // null = closed, undefined = new, object = edit
  const [editingProduct, setEditingProduct] = useState(null);   // null = closed, undefined = new, object = edit

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pendingSnap, centralSnap, centralCatSnap, orgsSnap] = await Promise.all([
        ProductSubmissionFactory.getPending(),
        CentralProductFactory.getAll(),
        CentralCategoryFactory.getAll(),
        OrganizationFactory.getAll(),
      ]);
      const pendingItems = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
      setPending(pendingItems);
      setCentral(centralSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCentralCategories(centralCatSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const orgMap = {};
      orgsSnap.docs.forEach(d => { orgMap[d.id] = d.data().name; });
      setOrgs(orgMap);
    } catch (err) {
      console.error('Failed to load library data:', err);
      alert('Laden mislukt: ' + err.message);
    } finally { setLoading(false); }
  }

  async function handleApprove(submission, categoryDecision) {
    try {
      // Verwerk categorie-beslissing
      let centralCategoryId = null;
      if (categoryDecision === '__create__' && submission.orgCategoryId) {
        // Controleer eerst of de categorie ondertussen al aangemaakt werd (bijv. door vorige goedkeuring)
        const alreadyExists = centralCategories.find(
          c => c.name.toLowerCase().trim() === submission.orgCategoryName?.toLowerCase().trim()
        );
        if (alreadyExists) {
          centralCategoryId = alreadyExists.id;
        } else {
          const catRef = await CentralCategoryFactory.create({
            name: submission.orgCategoryName,
            iconUrl: submission.orgCategoryIconUrl || '',
            color: submission.orgCategoryColor || '#4CAF50',
            approvedBy: claims.uid,
            sourceOrgId: submission.orgId,
            sourceCategoryId: submission.orgCategoryId,
          });
          centralCategoryId = catRef.id;
          setCentralCategories(prev => [...prev, {
            id: catRef.id,
            name: submission.orgCategoryName,
            iconUrl: submission.orgCategoryIconUrl || '',
            color: submission.orgCategoryColor || '#4CAF50',
          }].sort((a, b) => a.name.localeCompare(b.name)));
        }
        // Koppel org-categorie aan centrale categorie (non-blocking)
        CategoryFactory.update(submission.orgId, submission.orgCategoryId, { centralCategoryId })
          .catch(err => console.warn('Could not link org category:', err.message));
      } else if (categoryDecision && categoryDecision !== '__none__') {
        centralCategoryId = categoryDecision;
      }

      // Maak centraal product aan
      const ref = await CentralProductFactory.create({
        name: submission.name,
        imageUrl: submission.imageUrl,
        unit: submission.unit,
        approvedBy: claims.uid,
        sourceOrgId: submission.orgId,
        sourceProductId: submission.orgProductId,
        centralCategoryId,
      });
      // Update submission status
      await ProductSubmissionFactory.approve(submission.id, ref.id);
      // Koppel het originele org-product aan het centrale product (non-blocking)
      ProductFactory.update(submission.orgId, submission.orgProductId, { centralProductId: ref.id })
        .catch(err => console.warn('Could not link org product to central product:', err.message));
      setPending(prev => prev.filter(p => p.id !== submission.id));
      setCentral(prev => [...prev, {
        id: ref.id, name: submission.name, imageUrl: submission.imageUrl,
        unit: submission.unit, centralCategoryId,
      }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      alert('Goedkeuren mislukt: ' + err.message);
    }
  }

  async function handleDeleteCentralCategory(category) {
    if (!confirm(`Categorie "${category.name}" uit de centrale bibliotheek verwijderen?`)) return;
    await CentralCategoryFactory.delete(category.id);
    setCentralCategories(prev => prev.filter(c => c.id !== category.id));
  }

  async function handleReject(submission) {
    if (!confirm(`"${submission.name}" weigeren? Het product blijft beschikbaar in de bibliotheek van ${orgs[submission.orgId] || 'de organisatie'}.`)) return;
    await ProductSubmissionFactory.reject(submission.id);
    setPending(prev => prev.filter(p => p.id !== submission.id));
  }

  async function handleDeleteCentral(product) {
    if (!confirm(`"${product.name}" uit de centrale bibliotheek verwijderen?`)) return;
    await CentralProductFactory.delete(product.id);
    setCentral(prev => prev.filter(p => p.id !== product.id));
  }

  async function handleSaveCentralCategory({ name, iconUrl, color, iconFile }) {
    const isEdit = editingCategory && editingCategory.id;
    let finalIconUrl = iconUrl;
    if (isEdit) {
      if (iconFile) finalIconUrl = await StorageFactory.uploadCentralCategoryIcon(editingCategory.id, iconFile);
      await CentralCategoryFactory.update(editingCategory.id, { name, iconUrl: finalIconUrl, color });
      setCentralCategories(prev =>
        prev.map(c => c.id === editingCategory.id ? { ...c, name, iconUrl: finalIconUrl, color } : c)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      const ref = await CentralCategoryFactory.create({ name, iconUrl: '', color, approvedBy: claims.uid });
      if (iconFile) {
        finalIconUrl = await StorageFactory.uploadCentralCategoryIcon(ref.id, iconFile);
        await CentralCategoryFactory.update(ref.id, { iconUrl: finalIconUrl });
      }
      setCentralCategories(prev =>
        [...prev, { id: ref.id, name, iconUrl: finalIconUrl, color }]
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    setEditingCategory(null);
  }

  async function handleSaveCentralProduct({ name, imageUrl, unit, centralCategoryId, imageFile }) {
    const isEdit = editingProduct && editingProduct.id;
    let finalImageUrl = imageUrl;
    const catId = centralCategoryId || null;
    if (isEdit) {
      if (imageFile) finalImageUrl = await StorageFactory.uploadCentralProductImage(editingProduct.id, imageFile);
      await CentralProductFactory.update(editingProduct.id, { name, imageUrl: finalImageUrl, unit, centralCategoryId: catId });
      setCentral(prev =>
        prev.map(p => p.id === editingProduct.id ? { ...p, name, imageUrl: finalImageUrl, unit, centralCategoryId: catId } : p)
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    } else {
      const ref = await CentralProductFactory.create({ name, imageUrl: '', unit, approvedBy: claims.uid, centralCategoryId: catId });
      if (imageFile) {
        finalImageUrl = await StorageFactory.uploadCentralProductImage(ref.id, imageFile);
        await CentralProductFactory.update(ref.id, { imageUrl: finalImageUrl });
      }
      setCentral(prev =>
        [...prev, { id: ref.id, name, imageUrl: finalImageUrl, unit, centralCategoryId: catId }]
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    }
    setEditingProduct(null);
  }

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  return (
    <>
      {/* Sub-tabs */}
      <div style={styles.subTabs}>
        <button style={{ ...styles.subTab, ...(section === 'pending' ? styles.subTabActive : {}) }}
          onClick={() => setSection('pending')}>
          Wachtrij {pending.length > 0 && <span style={styles.badge}>{pending.length}</span>}
        </button>
        <button style={{ ...styles.subTab, ...(section === 'approved' ? styles.subTabActive : {}) }}
          onClick={() => setSection('approved')}>
          Producten ({central.length})
        </button>
        <button style={{ ...styles.subTab, ...(section === 'categories' ? styles.subTabActive : {}) }}
          onClick={() => setSection('categories')}>
          Categorieën ({centralCategories.length})
        </button>
      </div>

      {section === 'pending' && (
        <>
          {pending.length === 0 ? (
            <div style={styles.centered}><p style={styles.hint}>Geen producten in de wachtrij. ✅</p></div>
          ) : (
            <div style={styles.cardList}>
              {pending.map(sub => (
                <SubmissionCard key={sub.id} submission={sub}
                  orgName={orgs[sub.orgId] || sub.orgId}
                  centralCategories={centralCategories}
                  onApprove={(categoryDecision) => handleApprove(sub, categoryDecision)}
                  onReject={() => handleReject(sub)} />
              ))}
            </div>
          )}
        </>
      )}

      {section === 'approved' && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Centrale producten</p>
            <button style={styles.addButton} onClick={() => setEditingProduct(undefined)}>+ Nieuw</button>
          </div>
          {central.length === 0 ? (
            <div style={styles.centered}><p style={styles.hint}>Centrale bibliotheek is leeg.</p></div>
          ) : (
            <div style={styles.cardList}>
              {central.map(p => (
                <CentralProductCard key={p.id} product={p}
                  centralCategories={centralCategories}
                  onEdit={() => setEditingProduct(p)}
                  onDelete={() => handleDeleteCentral(p)} />
              ))}
            </div>
          )}
        </>
      )}

      {section === 'categories' && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Centrale categorieën</p>
            <button style={styles.addButton} onClick={() => setEditingCategory(undefined)}>+ Nieuw</button>
          </div>
          {centralCategories.length === 0 ? (
            <div style={styles.centered}><p style={styles.hint}>Nog geen centrale categorieën.</p></div>
          ) : (
            <div style={styles.cardList}>
              {centralCategories.map(c => (
                <CentralCategoryCard key={c.id} category={c}
                  onEdit={() => setEditingCategory(c)}
                  onDelete={() => handleDeleteCentralCategory(c)} />
              ))}
            </div>
          )}
        </>
      )}

      {editingCategory !== null && (
        <CentralCategoryForm
          category={editingCategory}
          onSave={handleSaveCentralCategory}
          onClose={() => setEditingCategory(null)} />
      )}
      {editingProduct !== null && (
        <CentralProductForm
          product={editingProduct}
          centralCategories={centralCategories}
          onSave={handleSaveCentralProduct}
          onClose={() => setEditingProduct(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// StoresTab
// ---------------------------------------------------------------------------
function StoresTab({ claims }) {
  const [pending, setPending] = useState([]);
  const [central, setCentral] = useState([]);
  const [orgs, setOrgs] = useState({});
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState('pending'); // 'pending' | 'approved'

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pendingSnap, centralSnap, orgsSnap] = await Promise.all([
        StoreSubmissionFactory.getPending(),
        CentralStoreFactory.getAll(),
        OrganizationFactory.getAll(),
      ]);
      const pendingItems = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0));
      setPending(pendingItems);
      setCentral(centralSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const orgMap = {};
      orgsSnap.docs.forEach(d => { orgMap[d.id] = d.data().name; });
      setOrgs(orgMap);
    } catch (err) {
      console.error('Failed to load stores data:', err);
      alert('Laden mislukt: ' + err.message);
    } finally { setLoading(false); }
  }

  async function handleApprove(submission) {
    try {
      const ref = await CentralStoreFactory.create({
        name: submission.name,
        type: submission.type,
        logoUrl: submission.logoUrl,
        approvedBy: claims.uid,
        sourceOrgId: submission.orgId,
        sourceStoreId: submission.orgStoreId,
      });
      await StoreSubmissionFactory.approve(submission.id, ref.id);
      setPending(prev => prev.filter(p => p.id !== submission.id));
      setCentral(prev => [...prev, {
        id: ref.id,
        name: submission.name,
        type: submission.type,
        logoUrl: submission.logoUrl,
      }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      alert('Goedkeuren mislukt: ' + err.message);
    }
  }

  async function handleReject(submission) {
    if (!confirm(`"${submission.name}" weigeren?`)) return;
    await StoreSubmissionFactory.reject(submission.id);
    setPending(prev => prev.filter(p => p.id !== submission.id));
  }

  async function handleDeleteCentral(store) {
    if (!confirm(`"${store.name}" uit de centrale bibliotheek verwijderen?`)) return;
    await CentralStoreFactory.delete(store.id);
    setCentral(prev => prev.filter(s => s.id !== store.id));
  }

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  return (
    <>
      {/* Sub-tabs */}
      <div style={styles.subTabs}>
        <button
          style={{ ...styles.subTab, ...(section === 'pending' ? styles.subTabActive : {}) }}
          onClick={() => setSection('pending')}
        >
          Wachtrij {pending.length > 0 && <span style={styles.badge}>{pending.length}</span>}
        </button>
        <button
          style={{ ...styles.subTab, ...(section === 'approved' ? styles.subTabActive : {}) }}
          onClick={() => setSection('approved')}
        >
          Centrale bibliotheek ({central.length})
        </button>
      </div>

      {section === 'pending' && (
        <>
          {pending.length === 0 ? (
            <div style={styles.centered}>
              <p style={styles.hint}>Geen winkels in de wachtrij. ✅</p>
            </div>
          ) : (
            <div style={styles.cardList}>
              {pending.map(sub => (
                <StoreSubmissionCard
                  key={sub.id}
                  submission={sub}
                  orgName={orgs[sub.orgId] || sub.orgId}
                  onApprove={() => handleApprove(sub)}
                  onReject={() => handleReject(sub)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {section === 'approved' && (
        <>
          {central.length === 0 ? (
            <div style={styles.centered}>
              <p style={styles.hint}>Centrale winkelbibliotheek is leeg.</p>
            </div>
          ) : (
            <div style={styles.cardList}>
              {central.map(s => (
                <CentralStoreCard
                  key={s.id}
                  store={s}
                  onDelete={() => handleDeleteCentral(s)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// StoreSubmissionCard
// ---------------------------------------------------------------------------
function StoreSubmissionCard({ submission, orgName, onApprove, onReject }) {
  const isChain = submission.type === 'chain';
  return (
    <div style={styles.submissionCard}>
      <div style={styles.submissionImage}>
        {submission.logoUrl ? (
          <img src={submission.logoUrl} alt={submission.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={e => e.target.style.display = 'none'} />
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M9 22V12h6v10" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
      <div style={styles.submissionBody}>
        <p style={styles.submissionName}>{submission.name}</p>
        <p style={styles.submissionMeta}>
          <span style={{
            fontSize: '0.72rem', fontWeight: '700',
            color: isChain ? '#2E7D32' : '#1565C0',
            backgroundColor: isChain ? '#E8F5E9' : '#E3F2FD',
            padding: '0.1rem 0.4rem', borderRadius: '20px',
          }}>
            {isChain ? 'Keten' : 'Winkel'}
          </span>
          {' '}· ingediend door <strong>{orgName}</strong>
        </p>
      </div>
      <div style={styles.submissionActions}>
        <button style={styles.approveButton} onClick={onApprove}>✓ Goedkeuren</button>
        <button style={styles.rejectButton} onClick={onReject}>✗ Weigeren</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CentralStoreCard
// ---------------------------------------------------------------------------
function CentralStoreCard({ store, onDelete }) {
  const isChain = store.type === 'chain';
  return (
    <div style={styles.card}>
      <div style={{
        ...styles.cardAvatar,
        borderRadius: '8px',
        backgroundColor: '#f5f5f5',
        overflow: 'hidden',
      }}>
        {store.logoUrl ? (
          <img src={store.logoUrl} alt={store.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onError={e => e.target.style.display = 'none'} />
        ) : (
          <span style={{ fontSize: '1.25rem' }}>🏪</span>
        )}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{store.name}</p>
        <p style={styles.cardSub}>
          <span style={{
            fontSize: '0.72rem', fontWeight: '700',
            color: isChain ? '#2E7D32' : '#1565C0',
            backgroundColor: isChain ? '#E8F5E9' : '#E3F2FD',
            padding: '0.1rem 0.4rem', borderRadius: '20px',
          }}>
            {isChain ? 'Keten' : 'Winkel'}
          </span>
        </p>
      </div>
      <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SubmissionCard
// ---------------------------------------------------------------------------
function SubmissionCard({ submission, orgName, onApprove, onReject, centralCategories }) {
  const hasCat = !!submission.orgCategoryId;

  // Berekend uit live centralCategories-state: detecteert ook categorieën die net werden aangemaakt
  const matchingCentralCat = hasCat && submission.orgCategoryName
    ? centralCategories.find(c =>
        c.id === submission.orgCategoryCentralId ||
        c.name.toLowerCase().trim() === submission.orgCategoryName.toLowerCase().trim()
      )
    : null;
  const catAlreadyCentral = !!matchingCentralCat;

  // Gebruikerskeuze (enkel relevant als !catAlreadyCentral)
  const [userCatAction, setUserCatAction] = useState('new');
  const [catSelectId, setCatSelectId] = useState('');

  // Effectieve actie: als de categorie al centraal staat, gebruik dat — anders de keuze van de gebruiker
  const catAction = catAlreadyCentral ? 'existing_auto' : (hasCat ? userCatAction : 'none');

  function getResolvedCategoryDecision() {
    if (!hasCat || catAction === 'none') return null;
    if (catAction === 'existing_auto') return matchingCentralCat.id;
    if (catAction === 'new') return '__create__';
    if (catAction === 'existing') return catSelectId || null;
    return null;
  }

  return (
    <div style={{ ...styles.submissionCard, flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
      {/* Product info row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div style={styles.submissionImage}>
          {submission.imageUrl ? (
            <img src={submission.imageUrl} alt={submission.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => e.target.style.display = 'none'} />
          ) : (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.submissionName}>{submission.name}</p>
          <p style={styles.submissionMeta}>{submission.unit} · ingediend door <strong>{orgName}</strong></p>
        </div>
      </div>

      {/* Category resolution */}
      {hasCat && (
        <div style={{ backgroundColor: '#fafafa', borderRadius: '8px', padding: '0.65rem 0.75rem', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            {submission.orgCategoryIconUrl && (
              <img src={submission.orgCategoryIconUrl} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} referrerPolicy="no-referrer" />
            )}
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1a1a1a' }}>
              {submission.orgCategoryName}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#aaa' }}>— categorie van de organisatie</span>
          </div>

          {catAlreadyCentral ? (
            <p style={{ fontSize: '0.78rem', color: '#2E7D32', margin: 0, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              ✓ Categorie is al beschikbaar in de centrale bibliotheek
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.2rem', fontWeight: '600' }}>
                Categorie nog niet centraal — wat wil je doen?
              </p>
              <label style={styles.radioLabel}>
                <input type="radio" name={`cat-${submission.id}`}
                  checked={userCatAction === 'new'} onChange={() => setUserCatAction('new')} />
                Toevoegen aan centrale bibliotheek
              </label>
              <label style={styles.radioLabel}>
                <input type="radio" name={`cat-${submission.id}`}
                  checked={userCatAction === 'existing'} onChange={() => setUserCatAction('existing')} />
                Koppelen aan bestaande centrale categorie
              </label>
              {userCatAction === 'existing' && (
                <select value={catSelectId} onChange={e => setCatSelectId(e.target.value)}
                  style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1.5px solid #ddd', marginLeft: '1.4rem', backgroundColor: '#fff' }}>
                  <option value="">— Kies een categorie —</option>
                  {centralCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              <label style={styles.radioLabel}>
                <input type="radio" name={`cat-${submission.id}`}
                  checked={userCatAction === 'none'} onChange={() => setUserCatAction('none')} />
                Geen centrale categorie toewijzen
              </label>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button style={styles.rejectButton} onClick={onReject}>✗ Weigeren</button>
        <button style={styles.approveButton} onClick={() => onApprove(getResolvedCategoryDecision())}>
          ✓ Goedkeuren
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CentralProductCard
// ---------------------------------------------------------------------------
function CentralProductCard({ product, onEdit, onDelete, centralCategories }) {
  const category = centralCategories?.find(c => c.id === product.centralCategoryId);
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardAvatar, borderRadius: '8px', backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => e.target.style.display = 'none'} />
        ) : (
          <span style={{ fontSize: '1.25rem' }}>🛍️</span>
        )}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{product.name}</p>
        <p style={styles.cardSub}>{product.unit}</p>
        {category && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
            {category.iconUrl && (
              <img src={category.iconUrl} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} referrerPolicy="no-referrer" />
            )}
            <span style={{ fontSize: '0.72rem', color: '#888' }}>{category.name}</span>
          </div>
        )}
      </div>
      <div style={styles.cardActions}>
        <button style={styles.manageButton} onClick={onEdit}>Bewerken</button>
        <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CentralCategoryCard
// ---------------------------------------------------------------------------
function CentralCategoryCard({ category, onEdit, onDelete }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardAvatar, borderRadius: '8px', backgroundColor: category.color || '#E8F5E9', overflow: 'hidden' }}>
        {category.iconUrl ? (
          <img src={category.iconUrl} alt={category.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }}
            onError={e => e.target.style.display = 'none'}
            referrerPolicy="no-referrer" />
        ) : (
          <span style={{ fontSize: '1.25rem' }}>🏷️</span>
        )}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{category.name}</p>
      </div>
      <div style={styles.cardActions}>
        <button style={styles.manageButton} onClick={onEdit}>Bewerken</button>
        <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CentralCategoryForm
// ---------------------------------------------------------------------------
function CentralCategoryForm({ category, onSave, onClose }) {
  const [name, setName] = useState(category?.name || '');
  const [iconUrl, setIconUrl] = useState(category?.iconUrl || '');
  const [color, setColor] = useState(category?.color || '#4CAF50');
  const [iconFile, setIconFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = iconFile ? URL.createObjectURL(iconFile) : iconUrl;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de categorie een naam.'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), iconUrl: iconUrl.trim(), color, iconFile });
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message);
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{category?.id ? 'Categorie bewerken' : 'Nieuwe categorie'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={styles.input} placeholder="bijv. Groenten & Fruit" required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Icoontje — URL (bijv. ARASAAC)</label>
            <input type="text" value={iconUrl}
              onChange={e => { setIconUrl(e.target.value); setIconFile(null); }}
              style={styles.input} placeholder="https://..." />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>of upload een afbeelding</label>
            <input type="file" accept="image/*"
              onChange={e => { setIconFile(e.target.files[0] || null); setIconUrl(''); }}
              style={{ fontSize: '0.875rem' }} />
          </div>
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <img src={previewUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '6px', backgroundColor: color }} />
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Voorbeeld</span>
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Kleur</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                style={{ width: '44px', height: '44px', border: '1.5px solid #ddd', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
              <span style={{ fontSize: '0.85rem', color: '#666' }}>{color}</span>
            </div>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CentralProductForm
// ---------------------------------------------------------------------------
const UNITS = ['stuks', 'pak', 'fles', 'blik', 'zak', 'doos', 'pot', 'kg'];

function CentralProductForm({ product, centralCategories, onSave, onClose }) {
  const [name, setName] = useState(product?.name || '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl || '');
  const [unit, setUnit] = useState(product?.unit || 'stuks');
  const [centralCategoryId, setCentralCategoryId] = useState(product?.centralCategoryId || '');
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const previewUrl = imageFile ? URL.createObjectURL(imageFile) : imageUrl;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef het product een naam.'); return; }
    setSaving(true);
    try {
      await onSave({ name: name.trim(), imageUrl: imageUrl.trim(), unit, centralCategoryId, imageFile });
    } catch (err) {
      setError('Opslaan mislukt: ' + err.message);
      setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{product?.id ? 'Product bewerken' : 'Nieuw product'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={styles.input} placeholder="bijv. Appels" required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Eenheid</label>
            <select value={unit} onChange={e => setUnit(e.target.value)} style={styles.input}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Categorie</label>
            <select value={centralCategoryId} onChange={e => setCentralCategoryId(e.target.value)} style={styles.input}>
              <option value="">— Geen categorie —</option>
              {centralCategories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Afbeelding — URL</label>
            <input type="text" value={imageUrl}
              onChange={e => { setImageUrl(e.target.value); setImageFile(null); }}
              style={styles.input} placeholder="https://..." />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>of upload een afbeelding</label>
            <input type="file" accept="image/*"
              onChange={e => { setImageFile(e.target.files[0] || null); setImageUrl(''); }}
              style={{ fontSize: '0.875rem' }} />
          </div>
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <img src={previewUrl} alt="" referrerPolicy="no-referrer"
                style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: '6px' }} />
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Voorbeeld</span>
            </div>
          )}
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgCard (ongewijzigd)
// ---------------------------------------------------------------------------
function OrgCard({ org, onManage, onDelete }) {
  const createdDate = org.createdAt?.seconds
    ? new Date(org.createdAt.seconds * 1000).toLocaleDateString('nl-BE') : '';
  return (
    <div style={styles.card}>
      <div style={styles.cardAvatar}>{org.name?.[0]?.toUpperCase() || '?'}</div>
      <div style={styles.cardBody} onClick={onManage}>
        <p style={styles.cardName}>{org.name}</p>
        {createdDate && <p style={styles.cardSub}>Aangemaakt op {createdDate}</p>}
      </div>
      <div style={styles.cardActions}>
        <button style={styles.manageButton} onClick={onManage}>Beheren</button>
        <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NewOrgForm (ongewijzigd)
// ---------------------------------------------------------------------------
function NewOrgForm({ claims, onSave, onClose }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de organisatie een naam.'); return; }
    setSaving(true);
    try {
      await OrganizationFactory.create({ name: name.trim(), createdBy: claims.uid });
      onSave();
    } catch (err) {
      setError('Aanmaken mislukt.'); setSaving(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>Nieuwe organisatie</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              style={styles.input} placeholder="bijv. De Regenboog vzw" required autoFocus />
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving}
            style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Aanmaken...' : 'Aanmaken'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default withRoleGuard(ROLES.APP_ADMIN, AdminDashboard);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = {
  page: { minHeight: '100vh', backgroundColor: '#f5f5f5', fontFamily: 'system-ui, sans-serif', padding: '1.5rem', maxWidth: '600px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' },
  title: { fontSize: '1.5rem', fontWeight: '700', color: '#1a1a1a', margin: '0 0 0.2rem' },
  subtitle: { fontSize: '0.875rem', color: '#888', margin: 0 },
  signOutButton: { padding: '0.5rem 1rem', backgroundColor: 'transparent', border: '1.5px solid #ddd', borderRadius: '8px', fontSize: '0.875rem', color: '#666', cursor: 'pointer' },
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #eee', paddingBottom: 0 },
  tab: { padding: '0.6rem 1rem', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: '-2px', fontSize: '0.95rem', fontWeight: '600', color: '#aaa', cursor: 'pointer' },
  tabActive: { color: '#1a1a1a', borderBottomColor: '#4CAF50' },
  subTabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' },
  subTab: { padding: '0.5rem 0.875rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  subTabActive: { backgroundColor: '#1a1a1a', color: '#fff' },
  badge: { backgroundColor: '#ef5350', color: '#fff', borderRadius: '20px', padding: '0.1rem 0.45rem', fontSize: '0.72rem', fontWeight: '700' },
  statsBar: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  statValue: { fontSize: '1.75rem', fontWeight: '800', color: '#1a1a1a', lineHeight: 1 },
  statLabel: { fontSize: '0.8rem', color: '#aaa', fontWeight: '500' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.8rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  addButton: { padding: '0.4rem 0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem' },
  cardAvatar: { width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#E8F5E9', color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', flexShrink: 0 },
  cardBody: { flex: 1, cursor: 'pointer' },
  cardName: { fontSize: '1rem', fontWeight: '600', color: '#1a1a1a', margin: '0 0 0.15rem' },
  cardSub: { fontSize: '0.8rem', color: '#999', margin: 0 },
  cardActions: { display: 'flex', gap: '0.4rem', alignItems: 'center' },
  manageButton: { padding: '0.35rem 0.75rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  deleteSmallButton: { padding: '0.35rem 0.5rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '6px', fontSize: '0.85rem', cursor: 'pointer' },
  // Submission card
  submissionCard: { backgroundColor: '#fff', borderRadius: '12px', border: '2px solid #FFF3E0', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem' },
  submissionImage: { width: '56px', height: '56px', borderRadius: '8px', backgroundColor: '#f5f5f5', flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  submissionBody: { flex: 1, minWidth: 0 },
  submissionName: { fontSize: '1rem', fontWeight: '700', color: '#1a1a1a', margin: '0 0 0.2rem' },
  submissionMeta: { fontSize: '0.78rem', color: '#888', margin: 0 },
  submissionActions: { display: 'flex', flexDirection: 'column', gap: '0.35rem', flexShrink: 0 },
  approveButton: { padding: '0.35rem 0.65rem', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  rejectButton: { padding: '0.35rem 0.65rem', backgroundColor: '#FFEBEE', color: '#c62828', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '700', cursor: 'pointer', whiteSpace: 'nowrap' },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#444', cursor: 'pointer' },
  centered: { display: 'flex', justifyContent: 'center', paddingTop: '3rem' },
  hint: { color: '#aaa', fontSize: '0.95rem', margin: 0 },
  modalOverlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 100 },
  modal: { backgroundColor: '#fff', borderRadius: '20px 20px 0 0', padding: '1.5rem', width: '100%', maxWidth: '600px', maxHeight: '92vh', overflowY: 'auto' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' },
  modalTitle: { fontSize: '1.1rem', fontWeight: '700', color: '#1a1a1a', margin: 0 },
  closeButton: { background: 'none', border: 'none', fontSize: '1.1rem', color: '#aaa', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  field: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.875rem', fontWeight: '600', color: '#444' },
  input: { padding: '0.75rem 1rem', borderRadius: '10px', border: '1.5px solid #ddd', fontSize: '1rem', backgroundColor: '#fff' },
  errorText: { color: '#c62828', fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.8rem', backgroundColor: '#FFEBEE', borderRadius: '8px' },
  saveButton: { padding: '0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', marginTop: '0.5rem' },
};
