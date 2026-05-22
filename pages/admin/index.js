/**
 * pages/admin/index.js — Winkel Simpel
 *
 * App admin dashboard met tabs:
 * - Organisaties: overzicht + stats per org + detail-sheet
 * - Centrale bibliotheek: productsubmissions reviewen + top bijdragers
 * - Winkels: store submissions
 * - Accounts: reset gebruikers
 */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { withRoleGuard, signOut, ROLES } from '../../lib/auth';
import {
  OrganizationFactory,
  MemberFactory,
  ShoppingListFactory,
  ProductFactory,
  CentralProductFactory,
  ProductSubmissionFactory,
  CategoryFactory,
  CentralCategoryFactory,
  CentralStoreFactory,
  StoreSubmissionFactory,
  StorageFactory,
} from '../../lib/dbSchema';

function AdminDashboard({ claims }) {
  const router = useRouter();
  const [tab, setTab] = useState('orgs');

  async function handleSignOut() {
    await signOut();
    router.replace('/login');
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Winkel Simpel</h1>
          <p style={styles.subtitle}>Beheerderspaneel</p>
        </div>
        <button style={styles.signOutButton} onClick={handleSignOut}>Afmelden</button>
      </div>

      <div style={styles.tabs}>
        {['orgs', 'library', 'stores', 'accounts'].map(t => (
          <button key={t}
            style={{ ...styles.tab, ...(tab === t ? styles.tabActive : {}) }}
            onClick={() => setTab(t)}>
            {{ orgs: 'Organisaties', library: 'Centrale bibliotheek', stores: 'Winkels', accounts: 'Accounts' }[t]}
          </button>
        ))}
      </div>

      {tab === 'orgs'     && <OrgsTab claims={claims} router={router} />}
      {tab === 'library'  && <LibraryTab claims={claims} />}
      {tab === 'stores'   && <StoresTab claims={claims} />}
      {tab === 'accounts' && <AccountsTab claims={claims} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgsTab — overzicht met snelstats + detail-sheet
// ---------------------------------------------------------------------------
function OrgsTab({ claims, router }) {
  const [organizations, setOrganizations] = useState([]);
  const [orgStats, setOrgStats]           = useState({}); // { [orgId]: { guides, shoppers } }
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [detailOrg, setDetailOrg]         = useState(null); // org object or null

  useEffect(() => { loadOrganizations(); }, []);

  async function loadOrganizations() {
    setLoading(true);
    try {
      const snap = await OrganizationFactory.getAll();
      const orgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setOrganizations(orgs);

      // Laad member-tellingen parallel voor alle orgs
      const statsEntries = await Promise.all(
        orgs.map(async org => {
          const membersSnap = await MemberFactory.getAll(org.id);
          const members = membersSnap.docs.map(d => d.data());
          return [org.id, {
            guides:   members.filter(m => m.role === 'guide' || m.role === 'org_admin').length,
            shoppers: members.filter(m => m.role === 'shopper').length,
          }];
        })
      );
      setOrgStats(Object.fromEntries(statsEntries));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteOrg(org) {
    if (!confirm(`Organisatie "${org.name}" verwijderen?`)) return;
    await OrganizationFactory.delete(org.id);
    setOrganizations(prev => prev.filter(o => o.id !== org.id));
  }

  const totalGuides   = Object.values(orgStats).reduce((s, v) => s + v.guides, 0);
  const totalShoppers = Object.values(orgStats).reduce((s, v) => s + v.shoppers, 0);

  return (
    <>
      {/* Stat-balk */}
      <div style={styles.statsBar}>
        <StatPill value={organizations.length} label="organisaties" />
        <StatPill value={totalGuides}          label="begeleiders"  />
        <StatPill value={totalShoppers}        label="shoppers"     />
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
              stats={orgStats[org.id]}
              onManage={() => router.push(`/admin/users?org=${org.id}&name=${encodeURIComponent(org.name)}`)}
              onDetail={() => setDetailOrg(org)}
              onDelete={() => handleDeleteOrg(org)} />
          ))}
        </div>
      )}

      {showForm && (
        <NewOrgForm claims={claims}
          onSave={async () => { setShowForm(false); await loadOrganizations(); }}
          onClose={() => setShowForm(false)} />
      )}

      {detailOrg && (
        <OrgDetailSheet org={detailOrg} onClose={() => setDetailOrg(null)} />
      )}
    </>
  );
}

function StatPill({ value, label }) {
  return (
    <div style={styles.statItem}>
      <span style={styles.statValue}>{value}</span>
      <span style={styles.statLabel}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgCard — compact kaart met snelstats
// ---------------------------------------------------------------------------
function OrgCard({ org, stats, onManage, onDetail, onDelete }) {
  const createdDate = org.createdAt?.seconds
    ? new Date(org.createdAt.seconds * 1000).toLocaleDateString('nl-BE') : '';

  return (
    <div style={styles.card}>
      <div style={styles.cardAvatar}>{org.name?.[0]?.toUpperCase() || '?'}</div>

      <div style={{ ...styles.cardBody, cursor: 'pointer' }} onClick={onDetail}>
        <p style={styles.cardName}>{org.name}</p>
        {createdDate && <p style={styles.cardSub}>Aangemaakt op {createdDate}</p>}
        {stats && (
          <div style={styles.cardStatRow}>
            <span style={styles.cardStatChip}>👤 {stats.guides} begeleid.</span>
            <span style={styles.cardStatChip}>🛒 {stats.shoppers} shoppers</span>
          </div>
        )}
      </div>

      <div style={styles.cardActions}>
        <button style={styles.manageButton} onClick={onManage}>Leden</button>
        <button style={styles.detailButton} onClick={onDetail}>Stats</button>
        <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OrgDetailSheet — slide-up modal met uitgebreide stats
// ---------------------------------------------------------------------------
function OrgDetailSheet({ org, onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [org.id]);

  async function loadStats() {
    setLoading(true);
    try {
      const [membersSnap, listsSnap, productsSnap, submissionsSnap] = await Promise.all([
        MemberFactory.getAll(org.id),
        ShoppingListFactory.getAll(org.id),
        ProductFactory.getAll(org.id),
        ProductSubmissionFactory.getByOrgProduct('__all__').catch(() => null), // fallback below
      ]);

      const members  = membersSnap.docs.map(d => d.data());
      const lists    = listsSnap.docs.map(d => d.data());
      const products = productsSnap.docs.map(d => d.data());

      // Goedgekeurde submissions voor deze org via getAll + filter
      let approvedCount = 0;
      let pendingCount  = 0;
      try {
        const allSubmissions = await ProductSubmissionFactory.getAll();
        const orgSubs = allSubmissions.docs
          .map(d => d.data())
          .filter(s => s.orgId === org.id);
        approvedCount = orgSubs.filter(s => s.status === 'approved').length;
        pendingCount  = orgSubs.filter(s => s.status === 'pending').length;
      } catch { /* non-blocking */ }

      setStats({
        guides:        members.filter(m => m.role === 'guide' || m.role === 'org_admin').length,
        shoppers:      members.filter(m => m.role === 'shopper').length,
        listsTotal:    lists.length,
        listsActive:   lists.filter(l => l.status === 'active').length,
        listsDraft:    lists.filter(l => l.status === 'draft').length,
        listsCompleted:lists.filter(l => l.status === 'completed').length,
        productsOwn:   products.length,
        productsCentral: products.filter(p => p.centralProductId).length,
        submissionsApproved: approvedCount,
        submissionsPending:  pendingCount,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{org.name}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <p style={{ color: '#aaa', textAlign: 'center', padding: '2rem' }}>Statistieken laden...</p>
        ) : stats && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

            {/* Gebruikers */}
            <StatSection title="👥 Gebruikers">
              <StatRow label="Begeleiders / org-admins" value={stats.guides} />
              <StatRow label="Shoppers" value={stats.shoppers} />
            </StatSection>

            {/* Lijstjes */}
            <StatSection title="🛒 Boodschappenlijstjes">
              <StatRow label="Totaal aangemaakt" value={stats.listsTotal} highlight />
              <StatRow label="Actief" value={stats.listsActive} color="#4CAF50" />
              <StatRow label="Concept" value={stats.listsDraft} color="#FF9800" />
              <StatRow label="Afgerond" value={stats.listsCompleted} color="#9E9E9E" />
            </StatSection>

            {/* Producten */}
            <StatSection title="📦 Productbibliotheek">
              <StatRow label="Eigen producten" value={stats.productsOwn} highlight />
              <StatRow label="Gekoppeld aan centrale bibliotheek" value={stats.productsCentral} color="#1565C0" />
              <StatRow label="Goedgekeurd in centrale bibliotheek" value={stats.submissionsApproved} color="#2E7D32" />
              {stats.submissionsPending > 0 && (
                <StatRow label="In wachtrij (pending)" value={stats.submissionsPending} color="#E65100" />
              )}
            </StatSection>

            {/* Bijdrage-score */}
            <div style={styles.contributionBox}>
              <p style={styles.contributionLabel}>🏆 Bijdragescore centrale bibliotheek</p>
              <p style={styles.contributionScore}>{stats.submissionsApproved}</p>
              <p style={styles.contributionSub}>goedgekeurde producten</p>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

function StatSection({ title, children }) {
  return (
    <div style={styles.statSection}>
      <p style={styles.statSectionTitle}>{title}</p>
      <div style={styles.statRows}>{children}</div>
    </div>
  );
}

function StatRow({ label, value, highlight, color }) {
  return (
    <div style={styles.statRow}>
      <span style={styles.statRowLabel}>{label}</span>
      <span style={{
        ...styles.statRowValue,
        ...(highlight ? styles.statRowValueHighlight : {}),
        ...(color ? { color } : {}),
      }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LibraryTab — met extra "Top bijdragers" sub-tab
// ---------------------------------------------------------------------------
function LibraryTab({ claims }) {
  const [pending, setPending]           = useState([]);
  const [central, setCentral]           = useState([]);
  const [centralCategories, setCentralCategories] = useState([]);
  const [orgs, setOrgs]                 = useState({});
  const [loading, setLoading]           = useState(true);
  const [section, setSection]           = useState('pending');
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingProduct, setEditingProduct]   = useState(null);

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
      setPending(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0)));
      setCentral(centralSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCentralCategories(centralCatSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const orgMap = {};
      orgsSnap.docs.forEach(d => { orgMap[d.id] = d.data().name; });
      setOrgs(orgMap);
    } catch (err) {
      alert('Laden mislukt: ' + err.message);
    } finally { setLoading(false); }
  }

  async function handleApprove(submission, categoryDecision) {
    try {
      let centralCategoryId = null;
      if (categoryDecision === '__create__' && submission.orgCategoryId) {
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
            id: catRef.id, name: submission.orgCategoryName,
            iconUrl: submission.orgCategoryIconUrl || '', color: submission.orgCategoryColor || '#4CAF50',
          }].sort((a, b) => a.name.localeCompare(b.name)));
        }
        CategoryFactory.update(submission.orgId, submission.orgCategoryId, { centralCategoryId })
          .catch(err => console.warn('Could not link org category:', err.message));
      } else if (categoryDecision && categoryDecision !== '__none__') {
        centralCategoryId = categoryDecision;
      }

      const ref = await CentralProductFactory.create({
        name: submission.name, imageUrl: submission.imageUrl, unit: submission.unit,
        approvedBy: claims.uid, sourceOrgId: submission.orgId,
        sourceProductId: submission.orgProductId, centralCategoryId,
      });
      await ProductSubmissionFactory.approve(submission.id, ref.id);
      ProductFactory.update(submission.orgId, submission.orgProductId, { centralProductId: ref.id })
        .catch(err => console.warn('Could not link org product:', err.message));
      setPending(prev => prev.filter(p => p.id !== submission.id));
      setCentral(prev => [...prev, {
        id: ref.id, name: submission.name, imageUrl: submission.imageUrl,
        unit: submission.unit, centralCategoryId,
      }].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) { alert('Goedkeuren mislukt: ' + err.message); }
  }

  async function handleReject(submission) {
    if (!confirm(`"${submission.name}" weigeren?`)) return;
    await ProductSubmissionFactory.reject(submission.id);
    setPending(prev => prev.filter(p => p.id !== submission.id));
  }

  async function handleDeleteCentralCategory(category) {
    if (!confirm(`Categorie "${category.name}" verwijderen?`)) return;
    await CentralCategoryFactory.delete(category.id);
    setCentralCategories(prev => prev.filter(c => c.id !== category.id));
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
      <div style={styles.subTabs}>
        {[
          { id: 'pending',      label: `Wachtrij`, badge: pending.length },
          { id: 'approved',     label: `Producten (${central.length})` },
          { id: 'categories',   label: `Categorieën (${centralCategories.length})` },
          { id: 'contributors', label: '🏆 Top bijdragers' },
        ].map(t => (
          <button key={t.id}
            style={{ ...styles.subTab, ...(section === t.id ? styles.subTabActive : {}) }}
            onClick={() => setSection(t.id)}>
            {t.label}
            {t.badge > 0 && <span style={styles.badge}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {section === 'pending' && (
        pending.length === 0
          ? <div style={styles.centered}><p style={styles.hint}>Geen producten in de wachtrij. ✅</p></div>
          : <div style={styles.cardList}>
              {pending.map(sub => (
                <SubmissionCard key={sub.id} submission={sub}
                  orgName={orgs[sub.orgId] || sub.orgId}
                  centralCategories={centralCategories}
                  onApprove={cd => handleApprove(sub, cd)}
                  onReject={() => handleReject(sub)} />
              ))}
            </div>
      )}

      {section === 'approved' && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Centrale producten</p>
            <button style={styles.addButton} onClick={() => setEditingProduct(undefined)}>+ Nieuw</button>
          </div>
          {central.length === 0
            ? <div style={styles.centered}><p style={styles.hint}>Centrale bibliotheek is leeg.</p></div>
            : <div style={styles.cardList}>
                {central.map(p => (
                  <CentralProductCard key={p.id} product={p}
                    centralCategories={centralCategories}
                    onEdit={() => setEditingProduct(p)}
                    onDelete={() => handleDeleteCentral(p)} />
                ))}
              </div>
          }
        </>
      )}

      {section === 'categories' && (
        <>
          <div style={styles.sectionHeader}>
            <p style={styles.sectionTitle}>Centrale categorieën</p>
            <button style={styles.addButton} onClick={() => setEditingCategory(undefined)}>+ Nieuw</button>
          </div>
          {centralCategories.length === 0
            ? <div style={styles.centered}><p style={styles.hint}>Nog geen centrale categorieën.</p></div>
            : <div style={styles.cardList}>
                {centralCategories.map(c => (
                  <CentralCategoryCard key={c.id} category={c}
                    onEdit={() => setEditingCategory(c)}
                    onDelete={() => handleDeleteCentralCategory(c)} />
                ))}
              </div>
          }
        </>
      )}

      {section === 'contributors' && (
        <TopContributorsTab orgs={orgs} />
      )}

      {editingCategory !== null && (
        <CentralCategoryForm category={editingCategory}
          onSave={handleSaveCentralCategory}
          onClose={() => setEditingCategory(null)} />
      )}
      {editingProduct !== null && (
        <CentralProductForm product={editingProduct}
          centralCategories={centralCategories}
          onSave={handleSaveCentralProduct}
          onClose={() => setEditingProduct(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// TopContributorsTab — ranking van orgs op goedgekeurde submissions
// ---------------------------------------------------------------------------
function TopContributorsTab({ orgs }) {
  const [ranking, setRanking]   = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => { loadRanking(); }, []);

  async function loadRanking() {
    setLoading(true);
    try {
      const snap = await ProductSubmissionFactory.getAll();
      const allSubs = snap.docs.map(d => d.data());

      // Groepeer per orgId
      const counts = {};
      allSubs.forEach(s => {
        if (!counts[s.orgId]) counts[s.orgId] = { approved: 0, pending: 0, rejected: 0 };
        counts[s.orgId][s.status] = (counts[s.orgId][s.status] || 0) + 1;
      });

      const ranked = Object.entries(counts)
        .map(([orgId, c]) => ({ orgId, name: orgs[orgId] || orgId, ...c, total: c.approved + c.pending + c.rejected }))
        .sort((a, b) => b.approved - a.approved || b.total - a.total);

      setRanking(ranked);
    } finally { setLoading(false); }
  }

  const medals = ['🥇', '🥈', '🥉'];

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  if (ranking.length === 0) {
    return <div style={styles.centered}><p style={styles.hint}>Nog geen submissions.</p></div>;
  }

  return (
    <div>
      <p style={{ ...styles.sectionTitle, marginBottom: '1rem' }}>
        Ranking op basis van goedgekeurde producten in de centrale bibliotheek
      </p>

      {/* Podium — top 3 */}
      {ranking.length >= 1 && (
        <div style={rankStyles.podium}>
          {ranking.slice(0, 3).map((org, i) => (
            <div key={org.orgId} style={{ ...rankStyles.podiumItem, order: [1, 0, 2][i] }}>
              <div style={{ ...rankStyles.podiumBar, height: [80, 110, 60][i], backgroundColor: ['#FFD700', '#C0C0C0', '#CD7F32'][i] }}>
                <span style={rankStyles.podiumMedal}>{medals[i]}</span>
              </div>
              <p style={rankStyles.podiumName}>{org.name}</p>
              <p style={rankStyles.podiumScore}>{org.approved} ✓</p>
            </div>
          ))}
        </div>
      )}

      {/* Volledige lijst */}
      <div style={styles.cardList}>
        {ranking.map((org, i) => (
          <div key={org.orgId} style={rankStyles.rankCard}>
            <span style={{ ...rankStyles.rankNum, ...(i < 3 ? rankStyles.rankNumTop : {}) }}>
              {i < 3 ? medals[i] : `#${i + 1}`}
            </span>
            <div style={rankStyles.rankBody}>
              <p style={rankStyles.rankName}>{org.name}</p>
              <div style={rankStyles.rankChips}>
                <span style={{ ...rankStyles.rankChip, backgroundColor: '#E8F5E9', color: '#2E7D32' }}>
                  ✓ {org.approved} goedgekeurd
                </span>
                {org.pending > 0 && (
                  <span style={{ ...rankStyles.rankChip, backgroundColor: '#FFF3E0', color: '#E65100' }}>
                    ⏳ {org.pending} pending
                  </span>
                )}
                {org.rejected > 0 && (
                  <span style={{ ...rankStyles.rankChip, backgroundColor: '#FFEBEE', color: '#c62828' }}>
                    ✗ {org.rejected} geweigerd
                  </span>
                )}
              </div>
            </div>
            <div style={rankStyles.rankScore}>
              <span style={rankStyles.rankScoreNum}>{org.approved}</span>
              <span style={rankStyles.rankScoreLabel}>punten</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const rankStyles = {
  podium: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '0.75rem', marginBottom: '1.5rem', padding: '1rem 0' },
  podiumItem: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', flex: '0 0 90px' },
  podiumBar: { width: '72px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '0.4rem' },
  podiumMedal: { fontSize: '1.75rem' },
  podiumName: { fontSize: '0.75rem', fontWeight: '700', color: '#1a1a1a', margin: 0, textAlign: 'center', lineHeight: 1.2 },
  podiumScore: { fontSize: '0.85rem', fontWeight: '800', color: '#4CAF50', margin: 0 },
  rankCard: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem' },
  rankNum: { fontSize: '1rem', fontWeight: '700', color: '#aaa', width: '32px', textAlign: 'center', flexShrink: 0 },
  rankNumTop: { fontSize: '1.4rem' },
  rankBody: { flex: 1, minWidth: 0 },
  rankName: { fontSize: '0.95rem', fontWeight: '700', color: '#1a1a1a', margin: '0 0 0.3rem' },
  rankChips: { display: 'flex', gap: '0.35rem', flexWrap: 'wrap' },
  rankChip: { fontSize: '0.72rem', fontWeight: '700', padding: '0.1rem 0.5rem', borderRadius: '20px' },
  rankScore: { display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 },
  rankScoreNum: { fontSize: '1.5rem', fontWeight: '900', color: '#4CAF50', lineHeight: 1 },
  rankScoreLabel: { fontSize: '0.7rem', color: '#aaa', fontWeight: '600' },
};

// ---------------------------------------------------------------------------
// StoresTab (ongewijzigd)
// ---------------------------------------------------------------------------
function StoresTab({ claims }) {
  const [pending, setPending]   = useState([]);
  const [central, setCentral]   = useState([]);
  const [orgs, setOrgs]         = useState({});
  const [loading, setLoading]   = useState(true);
  const [section, setSection]   = useState('pending');

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [pendingSnap, centralSnap, orgsSnap] = await Promise.all([
        StoreSubmissionFactory.getPending(),
        CentralStoreFactory.getAll(),
        OrganizationFactory.getAll(),
      ]);
      setPending(pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.submittedAt?.seconds || 0) - (b.submittedAt?.seconds || 0)));
      setCentral(centralSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const orgMap = {};
      orgsSnap.docs.forEach(d => { orgMap[d.id] = d.data().name; });
      setOrgs(orgMap);
    } catch (err) { alert('Laden mislukt: ' + err.message); }
    finally { setLoading(false); }
  }

  async function handleApprove(submission) {
    try {
      const ref = await CentralStoreFactory.create({
        name: submission.name, type: submission.type, logoUrl: submission.logoUrl,
        approvedBy: claims.uid, sourceOrgId: submission.orgId, sourceStoreId: submission.orgStoreId,
      });
      await StoreSubmissionFactory.approve(submission.id, ref.id);
      setPending(prev => prev.filter(p => p.id !== submission.id));
      setCentral(prev => [...prev, { id: ref.id, name: submission.name, type: submission.type, logoUrl: submission.logoUrl }]
        .sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) { alert('Goedkeuren mislukt: ' + err.message); }
  }

  async function handleReject(submission) {
    if (!confirm(`"${submission.name}" weigeren?`)) return;
    await StoreSubmissionFactory.reject(submission.id);
    setPending(prev => prev.filter(p => p.id !== submission.id));
  }

  async function handleDeleteCentral(store) {
    if (!confirm(`"${store.name}" verwijderen?`)) return;
    await CentralStoreFactory.delete(store.id);
    setCentral(prev => prev.filter(s => s.id !== store.id));
  }

  if (loading) return <div style={styles.centered}><p style={styles.hint}>Laden...</p></div>;

  return (
    <>
      <div style={styles.subTabs}>
        {[
          { id: 'pending',  label: 'Wachtrij', badge: pending.length },
          { id: 'approved', label: `Centrale bibliotheek (${central.length})` },
        ].map(t => (
          <button key={t.id}
            style={{ ...styles.subTab, ...(section === t.id ? styles.subTabActive : {}) }}
            onClick={() => setSection(t.id)}>
            {t.label}
            {t.badge > 0 && <span style={styles.badge}>{t.badge}</span>}
          </button>
        ))}
      </div>

      {section === 'pending' && (
        pending.length === 0
          ? <div style={styles.centered}><p style={styles.hint}>Geen winkels in de wachtrij. ✅</p></div>
          : <div style={styles.cardList}>
              {pending.map(sub => (
                <StoreSubmissionCard key={sub.id} submission={sub}
                  orgName={orgs[sub.orgId] || sub.orgId}
                  onApprove={() => handleApprove(sub)}
                  onReject={() => handleReject(sub)} />
              ))}
            </div>
      )}

      {section === 'approved' && (
        central.length === 0
          ? <div style={styles.centered}><p style={styles.hint}>Centrale winkelbibliotheek is leeg.</p></div>
          : <div style={styles.cardList}>
              {central.map(s => (
                <CentralStoreCard key={s.id} store={s} onDelete={() => handleDeleteCentral(s)} />
              ))}
            </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// AccountsTab (ongewijzigd)
// ---------------------------------------------------------------------------
function AccountsTab({ claims }) {
  const [email, setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);

  async function handleReset(e) {
    e.preventDefault();
    if (!email.trim()) return;
    if (!confirm(`Gebruiker "${email.trim()}" terugzetten naar privé-status?`)) return;
    setLoading(true);
    setResult(null);
    try {
      const { auth } = await import('../../lib/firebase');
      const idToken = await auth.currentUser.getIdToken();
      const res = await fetch('/api/admin/reset-user-to-private', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ success: false, message: data.message || 'Er is een fout opgetreden.' });
      } else {
        setResult({ success: true, message: `Gebruiker teruggezet naar privé-status${data.restoredOrgId ? ' en privé-organisatie hersteld' : ''}.` });
        setEmail('');
      }
    } catch {
      setResult({ success: false, message: 'Er is een fout opgetreden.' });
    } finally { setLoading(false); }
  }

  return (
    <div>
      <div style={styles.sectionHeader}>
        <p style={styles.sectionTitle}>Account terugzetten naar privé</p>
      </div>
      <p style={{ fontSize: '0.875rem', color: '#888', marginBottom: '1rem', lineHeight: 1.5 }}>
        Gebruik dit wanneer een gebruiker onterecht aan een organisatie is gekoppeld.
      </p>
      <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '400px' }}>
        <div style={styles.field}>
          <label style={styles.label}>E-mailadres van de gebruiker</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)}
            style={styles.input} placeholder="gebruiker@voorbeeld.be" required />
        </div>
        {result && (
          <p style={{ fontSize: '0.875rem', margin: 0, padding: '0.6rem 0.875rem', borderRadius: '8px',
            backgroundColor: result.success ? '#E8F5E9' : '#FDECEA',
            color: result.success ? '#2E7D32' : '#C62828' }}>
            {result.message}
          </p>
        )}
        <button type="submit" disabled={loading}
          style={{ ...styles.addButton, alignSelf: 'flex-start', opacity: loading ? 0.6 : 1 }}>
          {loading ? 'Bezig...' : 'Terugzetten naar privé'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components (ongewijzigd t.o.v. origineel)
// ---------------------------------------------------------------------------

function StoreSubmissionCard({ submission, orgName, onApprove, onReject }) {
  const isChain = submission.type === 'chain';
  return (
    <div style={styles.submissionCard}>
      <div style={styles.submissionImage}>
        {submission.logoUrl
          ? <img src={submission.logoUrl} alt={submission.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
          : <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M9 22V12h6v10" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        }
      </div>
      <div style={styles.submissionBody}>
        <p style={styles.submissionName}>{submission.name}</p>
        <p style={styles.submissionMeta}>
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isChain ? '#2E7D32' : '#1565C0', backgroundColor: isChain ? '#E8F5E9' : '#E3F2FD', padding: '0.1rem 0.4rem', borderRadius: '20px' }}>
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

function CentralStoreCard({ store, onDelete }) {
  const isChain = store.type === 'chain';
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardAvatar, borderRadius: '8px', backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
        {store.logoUrl
          ? <img src={store.logoUrl} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} onError={e => e.target.style.display = 'none'} />
          : <span style={{ fontSize: '1.25rem' }}>🏪</span>}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{store.name}</p>
        <p style={styles.cardSub}>
          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: isChain ? '#2E7D32' : '#1565C0', backgroundColor: isChain ? '#E8F5E9' : '#E3F2FD', padding: '0.1rem 0.4rem', borderRadius: '20px' }}>
            {isChain ? 'Keten' : 'Winkel'}
          </span>
        </p>
      </div>
      <button style={styles.deleteSmallButton} onClick={onDelete}>🗑</button>
    </div>
  );
}

function SubmissionCard({ submission, orgName, onApprove, onReject, centralCategories }) {
  const hasCat = !!submission.orgCategoryId;
  const matchingCentralCat = hasCat && submission.orgCategoryName
    ? centralCategories.find(c =>
        c.id === submission.orgCategoryCentralId ||
        c.name.toLowerCase().trim() === submission.orgCategoryName.toLowerCase().trim()
      )
    : null;
  const catAlreadyCentral = !!matchingCentralCat;
  const [userCatAction, setUserCatAction] = useState('new');
  const [catSelectId, setCatSelectId]     = useState('');
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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
        <div style={styles.submissionImage}>
          {submission.imageUrl
            ? <img src={submission.imageUrl} alt={submission.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
            : <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4zM3 6h18M16 10a4 4 0 01-8 0" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={styles.submissionName}>{submission.name}</p>
          <p style={styles.submissionMeta}>{submission.unit} · ingediend door <strong>{orgName}</strong></p>
        </div>
      </div>

      {hasCat && (
        <div style={{ backgroundColor: '#fafafa', borderRadius: '8px', padding: '0.65rem 0.75rem', border: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            {submission.orgCategoryIconUrl && <img src={submission.orgCategoryIconUrl} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} referrerPolicy="no-referrer" />}
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1a1a1a' }}>{submission.orgCategoryName}</span>
            <span style={{ fontSize: '0.75rem', color: '#aaa' }}>— categorie van de organisatie</span>
          </div>
          {catAlreadyCentral
            ? <p style={{ fontSize: '0.78rem', color: '#2E7D32', margin: 0 }}>✓ Categorie is al beschikbaar in de centrale bibliotheek</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <p style={{ fontSize: '0.75rem', color: '#888', margin: '0 0 0.2rem', fontWeight: '600' }}>Categorie nog niet centraal — wat wil je doen?</p>
                {[
                  { val: 'new', label: 'Toevoegen aan centrale bibliotheek' },
                  { val: 'existing', label: 'Koppelen aan bestaande centrale categorie' },
                  { val: 'none', label: 'Geen centrale categorie toewijzen' },
                ].map(opt => (
                  <label key={opt.val} style={styles.radioLabel}>
                    <input type="radio" name={`cat-${submission.id}`}
                      checked={userCatAction === opt.val} onChange={() => setUserCatAction(opt.val)} />
                    {opt.label}
                  </label>
                ))}
                {userCatAction === 'existing' && (
                  <select value={catSelectId} onChange={e => setCatSelectId(e.target.value)}
                    style={{ fontSize: '0.82rem', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1.5px solid #ddd', marginLeft: '1.4rem', backgroundColor: '#fff' }}>
                    <option value="">— Kies een categorie —</option>
                    {centralCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
          }
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
        <button style={styles.rejectButton} onClick={onReject}>✗ Weigeren</button>
        <button style={styles.approveButton} onClick={() => onApprove(getResolvedCategoryDecision())}>✓ Goedkeuren</button>
      </div>
    </div>
  );
}

function CentralProductCard({ product, onEdit, onDelete, centralCategories }) {
  const category = centralCategories?.find(c => c.id === product.centralCategoryId);
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardAvatar, borderRadius: '8px', backgroundColor: '#f5f5f5', overflow: 'hidden' }}>
        {product.imageUrl
          ? <img src={product.imageUrl} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
          : <span style={{ fontSize: '1.25rem' }}>🛍️</span>}
      </div>
      <div style={styles.cardBody}>
        <p style={styles.cardName}>{product.name}</p>
        <p style={styles.cardSub}>{product.unit}</p>
        {category && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
            {category.iconUrl && <img src={category.iconUrl} alt="" style={{ width: 14, height: 14, objectFit: 'contain' }} referrerPolicy="no-referrer" />}
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

function CentralCategoryCard({ category, onEdit, onDelete }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardAvatar, borderRadius: '8px', backgroundColor: category.color || '#E8F5E9', overflow: 'hidden' }}>
        {category.iconUrl
          ? <img src={category.iconUrl} alt={category.name} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '6px' }} onError={e => e.target.style.display = 'none'} referrerPolicy="no-referrer" />
          : <span style={{ fontSize: '1.25rem' }}>🏷️</span>}
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

function CentralCategoryForm({ category, onSave, onClose }) {
  const [name, setName]         = useState(category?.name || '');
  const [iconUrl, setIconUrl]   = useState(category?.iconUrl || '');
  const [color, setColor]       = useState(category?.color || '#4CAF50');
  const [iconFile, setIconFile] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const previewUrl = iconFile ? URL.createObjectURL(iconFile) : iconUrl;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de categorie een naam.'); return; }
    setSaving(true);
    try { await onSave({ name: name.trim(), iconUrl: iconUrl.trim(), color, iconFile }); }
    catch (err) { setError('Opslaan mislukt: ' + err.message); setSaving(false); }
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
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={styles.input} required autoFocus />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Icoontje — URL</label>
            <input type="text" value={iconUrl} onChange={e => { setIconUrl(e.target.value); setIconFile(null); }} style={styles.input} placeholder="https://..." />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>of upload een afbeelding</label>
            <input type="file" accept="image/*" onChange={e => { setIconFile(e.target.files[0] || null); setIconUrl(''); }} style={{ fontSize: '0.875rem' }} />
          </div>
          {previewUrl && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', backgroundColor: '#f5f5f5', borderRadius: '8px' }}>
              <img src={previewUrl} alt="" referrerPolicy="no-referrer" style={{ width: 40, height: 40, objectFit: 'contain', borderRadius: '6px', backgroundColor: color }} />
              <span style={{ fontSize: '0.8rem', color: '#888' }}>Voorbeeld</span>
            </div>
          )}
          <div style={styles.field}>
            <label style={styles.label}>Kleur</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '44px', border: '1.5px solid #ddd', borderRadius: '8px', cursor: 'pointer', padding: '2px' }} />
              <span style={{ fontSize: '0.85rem', color: '#666' }}>{color}</span>
            </div>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving} style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </form>
      </div>
    </div>
  );
}

const UNITS = ['stuks', 'pak', 'fles', 'blik', 'zak', 'doos', 'pot', 'kg'];

function CentralProductForm({ product, centralCategories, onSave, onClose }) {
  const [name, setName]                       = useState(product?.name || '');
  const [imageUrl, setImageUrl]               = useState(product?.imageUrl || '');
  const [unit, setUnit]                       = useState(product?.unit || 'stuks');
  const [centralCategoryId, setCentralCategoryId] = useState(product?.centralCategoryId || '');
  const [imageFile, setImageFile]             = useState(null);
  const [imagePreview, setImagePreview]       = useState(product?.imageUrl || null);
  const [manualImageUrl, setManualImageUrl]   = useState('');
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState('');
  const fileInputRef = useRef();

  function handleImageChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Kies een afbeelding.'); return; }
    setImageFile(file); setImagePreview(URL.createObjectURL(file)); setImageUrl(''); setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef het product een naam.'); return; }
    setSaving(true);
    try { await onSave({ name: name.trim(), imageUrl, unit, centralCategoryId, imageFile }); }
    catch (err) { setError('Opslaan mislukt: ' + err.message); setSaving(false); }
  }

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h2 style={styles.modalTitle}>{product?.id ? 'Product bewerken' : 'Nieuw product'}</h2>
          <button style={styles.closeButton} onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.imageUploadArea} onClick={() => fileInputRef.current.click()}>
            {imagePreview
              ? <img src={imagePreview} alt="Voorvertoning" style={styles.imagePreview} onError={e => e.target.style.display = 'none'} referrerPolicy="no-referrer" />
              : <div style={styles.imagePlaceholder}><span style={{ fontSize: '2.5rem' }}>📷</span><span style={styles.imageUploadHint}>Tik om een foto te kiezen (optioneel)</span></div>}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Of plak een afbeelding-URL</label>
            <div style={styles.importRow}>
              <input type="url" value={manualImageUrl} onChange={e => setManualImageUrl(e.target.value)}
                style={{ ...styles.input, flex: 1, fontSize: '0.85rem' }} placeholder="https://..." />
              <button type="button" disabled={!manualImageUrl.trim()}
                style={{ ...styles.importButton, opacity: !manualImageUrl.trim() ? 0.6 : 1 }}
                onClick={() => { setImageUrl(manualImageUrl.trim()); setImagePreview(manualImageUrl.trim()); setImageFile(null); setManualImageUrl(''); }}>
                ↓ Gebruik
              </button>
            </div>
          </div>
          <div style={styles.field}>
            <label style={styles.label}>Naam</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={styles.input} required autoFocus />
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
              {centralCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {error && <p style={styles.errorText}>{error}</p>}
          <button type="submit" disabled={saving} style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
        </form>
      </div>
    </div>
  );
}

function NewOrgForm({ claims, onSave, onClose }) {
  const [name, setName]     = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Geef de organisatie een naam.'); return; }
    setSaving(true);
    try { await OrganizationFactory.create({ name: name.trim(), createdBy: claims.uid }); onSave(); }
    catch { setError('Aanmaken mislukt.'); setSaving(false); }
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
          <button type="submit" disabled={saving} style={{ ...styles.saveButton, opacity: saving ? 0.7 : 1 }}>
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
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '2px solid #eee', overflowX: 'auto', flexShrink: 0 },
  tab: { padding: '0.6rem 1rem', backgroundColor: 'transparent', border: 'none', borderBottom: '2px solid transparent', marginBottom: '-2px', fontSize: '0.95rem', fontWeight: '600', color: '#aaa', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  tabActive: { color: '#1a1a1a', borderBottomColor: '#4CAF50' },
  subTabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' },
  subTab: { padding: '0.5rem 0.875rem', backgroundColor: '#f0f0f0', border: 'none', borderRadius: '20px', fontSize: '0.85rem', fontWeight: '600', color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem' },
  subTabActive: { backgroundColor: '#1a1a1a', color: '#fff' },
  badge: { backgroundColor: '#ef5350', color: '#fff', borderRadius: '20px', padding: '0.1rem 0.45rem', fontSize: '0.72rem', fontWeight: '700' },
  statsBar: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '2rem', flexWrap: 'wrap' },
  statItem: { display: 'flex', flexDirection: 'column', gap: '0.15rem' },
  statValue: { fontSize: '1.75rem', fontWeight: '800', color: '#1a1a1a', lineHeight: 1 },
  statLabel: { fontSize: '0.8rem', color: '#aaa', fontWeight: '500' },
  sectionHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' },
  sectionTitle: { fontSize: '0.8rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0 },
  addButton: { padding: '0.4rem 0.875rem', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' },
  cardList: { display: 'flex', flexDirection: 'column', gap: '0.6rem' },
  card: { backgroundColor: '#fff', borderRadius: '12px', border: '1.5px solid #eee', display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem' },
  cardAvatar: { width: '44px', height: '44px', borderRadius: '10px', backgroundColor: '#E8F5E9', color: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '1.1rem', flexShrink: 0 },
  cardBody: { flex: 1 },
  cardName: { fontSize: '1rem', fontWeight: '600', color: '#1a1a1a', margin: '0 0 0.15rem' },
  cardSub: { fontSize: '0.8rem', color: '#999', margin: 0 },
  cardStatRow: { display: 'flex', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap' },
  cardStatChip: { fontSize: '0.72rem', fontWeight: '600', color: '#555', backgroundColor: '#f5f5f5', padding: '0.15rem 0.5rem', borderRadius: '20px' },
  cardActions: { display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' },
  manageButton: { padding: '0.35rem 0.75rem', backgroundColor: '#E3F2FD', color: '#1565C0', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
  detailButton: { padding: '0.35rem 0.75rem', backgroundColor: '#E8F5E9', color: '#2E7D32', border: 'none', borderRadius: '6px', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' },
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
  // Modal
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
  centered: { display: 'flex', justifyContent: 'center', paddingTop: '3rem' },
  hint: { color: '#aaa', fontSize: '0.95rem', margin: 0 },
  imageUploadArea: { width: '100%', height: '180px', borderRadius: '12px', border: '2px dashed #ddd', backgroundColor: '#fafafa', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', overflow: 'hidden' },
  imagePreview: { width: '100%', height: '100%', objectFit: 'cover' },
  imagePlaceholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' },
  imageUploadHint: { fontSize: '0.85rem', color: '#aaa' },
  importRow: { display: 'flex', gap: '0.5rem', alignItems: 'center' },
  importButton: { padding: '0.75rem 0.875rem', backgroundColor: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 },
  // Stat detail sheet
  statSection: { display: 'flex', flexDirection: 'column', gap: '0' },
  statSectionTitle: { fontSize: '0.78rem', fontWeight: '700', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 0.5rem' },
  statRows: { backgroundColor: '#fafafa', borderRadius: '10px', overflow: 'hidden', border: '1px solid #eee' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', borderBottom: '1px solid #eee' },
  statRowLabel: { fontSize: '0.875rem', color: '#555' },
  statRowValue: { fontSize: '1rem', fontWeight: '700', color: '#1a1a1a' },
  statRowValueHighlight: { fontSize: '1.25rem', color: '#1a1a1a' },
  contributionBox: { backgroundColor: '#E8F5E9', borderRadius: '12px', padding: '1.25rem', textAlign: 'center', border: '1.5px solid #C8E6C9' },
  contributionLabel: { fontSize: '0.85rem', fontWeight: '700', color: '#2E7D32', margin: '0 0 0.5rem' },
  contributionScore: { fontSize: '3rem', fontWeight: '900', color: '#1B5E20', margin: 0, lineHeight: 1 },
  contributionSub: { fontSize: '0.8rem', color: '#4CAF50', margin: '0.25rem 0 0', fontWeight: '600' },
};
