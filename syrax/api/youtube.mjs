/**
 * Syrax /api/youtube?q= — Vercel serverless mirror of backend/main.py.
 * YouTube removed `listType=search` embeds, so we resolve search queries to
 * real video IDs server-side (scrape) — no YouTube API key needed.
 */
export const config = { maxDuration: 15 };

const YT_RESULTS_RE = /"videoRenderer":\{"videoId":"([\w-]{11})"/g;
// id + title (for the mini YouTube home grid in the panel)
const YT_ITEM_RE =
  /"videoRenderer":\{"videoId":"([\w-]{11})".*?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/gs;
const YT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const query = String(req.query.q ?? '').trim();
  if (!query) return res.status(400).json({ error: 'q is required' });

  try {
    const r = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
      { headers: YT_HEADERS, redirect: 'follow' },
    );
    const html = await r.text();

    // id + title pairs for the home grid
    const items = [];
    const seen = new Set();
    let m;
    YT_ITEM_RE.lastIndex = 0;
    while ((m = YT_ITEM_RE.exec(html)) !== null && items.length < 12) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      let title;
      try {
        title = JSON.parse(`"${m[2]}"`); // unescape \u / \" sequences
      } catch {
        title = m[2];
      }
      items.push({ id: m[1], title });
    }
    // fallback → bare ids
    if (items.length === 0) {
      YT_RESULTS_RE.lastIndex = 0;
      while ((m = YT_RESULTS_RE.exec(html)) !== null && items.length < 12) {
        if (seen.has(m[1])) continue;
        seen.add(m[1]);
        items.push({ id: m[1], title: 'Video' });
      }
    }
    if (items.length === 0) return res.status(502).json({ error: 'No YouTube results found' });
    return res.status(200).json({ query, ids: items.map((i) => i.id), results: items });
  } catch (e) {
    return res.status(502).json({ error: `YouTube unreachable: ${e.message}` });
  }
}
