import { pathToFileURL } from 'node:url';

export function bandcampUrl(value) {
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !/^[a-z0-9-]+\.bandcamp\.com$/.test(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/(track|album)\/[a-z0-9-]+\/?$/.test(url.pathname)
  ) {
    throw new Error('Use a public HTTPS Bandcamp track or album URL.');
  }
  url.search = '';
  url.hash = '';
  return url.href;
}

function decodeAttribute(value = '') {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#(?:39|x27);/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function parseBandcamp(html, source) {
  const sourceUrl = bandcampUrl(source);
  const attribute = (name) =>
    decodeAttribute(html.match(new RegExp(`${name}="([^\\"]+)"`))?.[1]);
  const raw = attribute('data-tralbum');
  if (!raw)
    throw new Error(
      'No public release metadata found. The page may be unavailable.',
    );
  const data = JSON.parse(raw);
  const band = JSON.parse(attribute('data-band') || '{}');
  if (data.current?.private || data.current?.killed)
    throw new Error('Release is not publicly available.');
  const currency =
    attribute('data-band-currency') ||
    band.currency ||
    data.current?.currency ||
    null;
  const artwork = decodeAttribute(
    html.match(/<meta property="og:image"\s+content="([^"]+)"/)?.[1],
  );
  const albumId =
    data.current?.type === 'album' ? data.current.id : data.current?.album_id;
  const isTrack = data.current?.type === 'track';
  return {
    sourceUrl,
    checkedAt: new Date().toISOString(),
    artist: data.artist,
    release: data.current?.title,
    releaseDate: data.current?.release_date,
    albumId,
    artwork,
    currency,
    minimumPrice: data.current?.minimum_price ?? null,
    setPrice: data.current?.set_price ?? null,
    purchaseAvailable: /Buy Digital (Track|Album)/.test(html),
    priceKind: /<span[^>]+class="[^"]*buyItemNyp/.test(html)
      ? 'minimum'
      : 'fixed',
    tracks: (data.trackinfo || []).map((track) => ({
      title: track.title,
      artist: track.artist || data.artist,
      trackId: track.track_id || track.id,
      albumId,
      url: new URL(track.title_link, sourceUrl).href,
      seconds: track.duration,
      hasPreview: Boolean(
        track.file && Object.values(track.file).some(Boolean),
      ),
      isrc: isTrack ? data.current?.isrc : null,
      price: isTrack ? (data.current?.minimum_price ?? null) : null,
      currency,
      artwork,
    })),
  };
}

export async function resolveBandcamp(url) {
  const safeUrl = bandcampUrl(url);
  const response = await fetch(safeUrl, {
    signal: AbortSignal.timeout(25000),
    redirect: 'error',
    headers: { 'User-Agent': 'AgenticDJ/0.1 public-release-metadata' },
  });
  if (!response.ok)
    throw new Error(`Bandcamp returned HTTP ${response.status}`);
  return parseBandcamp(await response.text(), safeUrl);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  for (const url of process.argv.slice(2)) {
    try {
      console.log(JSON.stringify(await resolveBandcamp(url)));
    } catch (error) {
      console.error(JSON.stringify({ url, error: error.message }));
      process.exitCode = 1;
    }
  }
}
