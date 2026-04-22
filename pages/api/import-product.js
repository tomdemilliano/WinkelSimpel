/**
 * pages/api/import-product.js — Winkel Simpel
 *
 * Haalt productinfo op via:
 * 1. Barcode → Open Food Facts API
 * 2. Delhaize URL → Delhaize product API (via productnummer uit URL)
 * 3. Andere URL → Open Graph meta tags
 */

// Haal productnummer op uit Delhaize URL
// bv. /p/F2010083100116000000 → F2010083100116000000
function extractDelhaizeProductId(url) {
  const match = url.match(/\/p\/([A-Z0-9]+)(?:[/?]|$)/);
  return match?.[1] || null;
}

// Open Food Facts barcode lookup
async function fetchByBarcode(barcode) {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`,
    {
      headers: { 'User-Agent': 'WinkelSimpel/1.0 (contact@example.com)' },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1) return null;
  const p = data.product;
  return {
    name: p.product_name_nl || p.product_name || p.product_name_en || '',
    imageUrl: p.image_front_url || p.image_url || '',
  };
}

// Delhaize product API
async function fetchDelhaize(productId) {
  // Delhaize heeft een interne API die productinfo teruggeeft
  const res = await fetch(
    `https://www.delhaize.be/api/products/${productId}`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'nl-BE',
        'x-dtpc': '1',
      },
      signal: AbortSignal.timeout(6000),
    }
  );
  if (!res.ok) return null;
  try {
    const data = await res.json();
    const name = data.name || data.productName || data.title || '';
    const imageUrl = data.mainImage?.url || data.image?.url || data.imageUrl || data.thumbnail || '';
    return { name, imageUrl };
  } catch { return null; }
}

// Open Graph scraping als fallback
async function fetchOpenGraph(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'nl-BE,nl;q=0.9',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return null;
  const html = await res.text();

  function getMeta(property) {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
      new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return null;
  }

  let name = getMeta('og:title') || getMeta('twitter:title') ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || '';

  // Verwijder webshop naam uit titel
  name = name.replace(/\s*[\|\-–]\s*(delhaize|colruyt|albert heijn|ah|carrefour|lidl|aldi|spar|jumbo).*/i, '').trim();

  const imageUrl = getMeta('og:image') || getMeta('twitter:image') || '';
  const parsedUrl = new URL(url);
  const absoluteImage = imageUrl && !imageUrl.startsWith('http')
    ? `${parsedUrl.origin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`
    : imageUrl;

  return { name, imageUrl: absoluteImage };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const { url, barcode } = req.body;

  try {
    // Route 1: barcode
    if (barcode?.trim()) {
      const result = await fetchByBarcode(barcode.trim().replace(/\D/g, ''));
      if (result?.name || result?.imageUrl) {
        return res.status(200).json(result);
      }
      return res.status(404).json({ message: 'Product niet gevonden in Open Food Facts. Probeer een andere barcode of voer de info handmatig in.' });
    }

    // Route 2: URL vereist
    if (!url?.trim()) {
      return res.status(400).json({ message: 'URL of barcode is verplicht.' });
    }

    let parsedUrl;
    try { parsedUrl = new URL(url.trim()); } catch {
      return res.status(400).json({ message: 'Ongeldige URL.' });
    }

    // Route 2a: Delhaize URL → probeer Delhaize API
    if (parsedUrl.hostname.includes('delhaize.be')) {
      const productId = extractDelhaizeProductId(parsedUrl.pathname);
      if (productId) {
        const result = await fetchDelhaize(productId).catch(() => null);
        if (result?.name || result?.imageUrl) {
          return res.status(200).json({ ...result, source: 'Delhaize' });
        }
      }
      // Fallback: open graph
      const og = await fetchOpenGraph(url.trim()).catch(() => null);
      if (og?.name || og?.imageUrl) {
        return res.status(200).json({ ...og, source: 'Delhaize' });
      }
      // Laatste kans: geef productnummer terug als naam
      if (productId) {
        return res.status(200).json({
          name: '',
          imageUrl: '',
          source: 'Delhaize',
          hint: 'Delhaize blokkeert automatisch ophalen. Vul de naam handmatig in en voeg een foto toe.',
        });
      }
    }

    // Route 2b: andere webshop → Open Graph
    const og = await fetchOpenGraph(url.trim()).catch(() => null);
    if (og?.name || og?.imageUrl) {
      return res.status(200).json({ ...og, source: parsedUrl.hostname });
    }

    return res.status(400).json({
      message: 'Kon geen productinfo vinden. Probeer de barcode of voer de info handmatig in.',
    });

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(408).json({ message: 'Tijdslimiet overschreden. Probeer opnieuw.' });
    }
    console.error('import-product error:', err.message);
    return res.status(500).json({ message: `Fout: ${err.message}` });
  }
}
