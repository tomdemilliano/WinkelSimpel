/**
 * pages/api/import-product.js — Winkel Simpel
 *
 * Fetches product info (name + image) from a product URL.
 * Reads Open Graph meta tags which most webshops include.
 * Works for Delhaize, Colruyt, Albert Heijn, and most other shops.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Methode niet toegestaan.' });
  }

  const { url } = req.body;
  if (!url?.trim()) {
    return res.status(400).json({ message: 'URL is verplicht.' });
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(url.trim());
  } catch {
    return res.status(400).json({ message: 'Ongeldige URL.' });
  }

  try {
    const response = await fetch(parsedUrl.toString(), {
      headers: {
        // Pretend to be a browser to avoid bot blocking
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'nl-BE,nl;q=0.9',
      },
      // Timeout after 8 seconds
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return res.status(400).json({
        message: `Kon de pagina niet ophalen (status ${response.status}). Controleer de URL.`,
      });
    }

    const html = await response.text();

    // Extract Open Graph tags and other meta tags
    function getMeta(property) {
      // og:property or name= variants
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

    // Try multiple sources for the product name
    let name =
      getMeta('og:title') ||
      getMeta('twitter:title') ||
      getMeta('product:name') ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null;

    // Clean up common suffixes like "| Delhaize" or "- Webshop"
    if (name) {
      name = name
        .replace(/\s*[\|\-–]\s*(delhaize|colruyt|albert heijn|ah|carrefour|lidl|aldi|spar|proxy|okay|bio-planet|dreamland|brico|action|jumbo).*/i, '')
        .trim();
    }

    // Try multiple sources for the image
    const imageUrl =
      getMeta('og:image') ||
      getMeta('og:image:url') ||
      getMeta('twitter:image') ||
      getMeta('twitter:image:src') ||
      null;

    // Make relative image URLs absolute
    let absoluteImageUrl = imageUrl;
    if (imageUrl && !imageUrl.startsWith('http')) {
      absoluteImageUrl = `${parsedUrl.origin}${imageUrl.startsWith('/') ? '' : '/'}${imageUrl}`;
    }

    if (!name && !absoluteImageUrl) {
      return res.status(400).json({
        message: 'Kon geen productinfo vinden op deze pagina. Probeer een directe productpagina te gebruiken.',
      });
    }

    return res.status(200).json({
      name: name || '',
      imageUrl: absoluteImageUrl || '',
      source: parsedUrl.hostname,
    });

  } catch (err) {
    if (err.name === 'TimeoutError') {
      return res.status(408).json({ message: 'De pagina reageerde te traag. Probeer opnieuw.' });
    }
    console.error('import-product error:', err.message);
    return res.status(500).json({ message: `Fout bij ophalen: ${err.message}` });
  }
}
