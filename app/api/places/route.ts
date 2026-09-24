import { coordinatePlace, distance, inHokkaido, inJapan, type Place } from "@/lib/geo";
import { matchingPresets, normalizePlaceName, exactPreset, canonicalPlace } from "@/lib/places";
import { matchesKeywords, keywordScore, searchTokens } from "@/lib/search-text";
import { keywordVariants } from "@/lib/keyword-search";
import { wikipediaPlaces, wikipediaSearchUrl } from "@/lib/wikipedia-places";

export const dynamic = "force-dynamic";
type Feature = { geometry?: { coordinates?: number[] }; properties?: Record<string, string | number> };
const cache = new Map<string, { at: number; places: Place[] }>();
const providerCache = new Map<string, { at: number; data: unknown }>();
const inFlight = new Map<string, Promise<unknown>>();
const retryAfter = new Map<string, number>();
let queue: Promise<void> = Promise.resolve();
let lastRequest = 0;
async function limitedFetch(url: string): Promise<unknown> {
  const host = new URL(url).hostname;
  const cached = providerCache.get(url);
  if (cached && Date.now() - cached.at < 30 * 60 * 1000) return cached.data;
  const pending = inFlight.get(url);
  if (pending) return pending;
  const task = queue.then(async () => {
    if (Date.now() < (retryAfter.get(host) || 0)) throw new Error("検索サービスが混雑しています。");
    const delay = Math.max(0, 1200 - (Date.now() - lastRequest));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    lastRequest = Date.now();
    const response = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "ja", "User-Agent": "HokkaidoDistance/1.1 (https://hokkaido-distance.chocozukushi.chatgpt.site)" }, signal: AbortSignal.timeout(12000) });
    const pause = () => {
      const header = response.headers.get("Retry-After");
      const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : 0;
      const until = header && !seconds ? Date.parse(header) : 0;
      retryAfter.set(host, Math.max(Date.now() + 60000, seconds ? Date.now() + seconds * 1000 : until || 0));
    };
    if (response.status === 429 || response.status === 503) pause();
    if (!response.ok) throw new Error("検索サービスに接続できませんでした。");
    const data: unknown = await response.json();
    if (host === "ja.wikipedia.org" && data && typeof data === "object" && "error" in data) {
      pause();
      throw new Error("Wikipediaの検索を利用できませんでした。");
    }
    if (providerCache.size >= 200) providerCache.delete(providerCache.keys().next().value!);
    providerCache.set(url, { at: Date.now(), data });
    return data;
  });
  queue = task.then(() => undefined, () => undefined);
  inFlight.set(url, task);
  try { return await task; } finally { inFlight.delete(url); }
}
function fromPhoton(feature: Feature, region: string): Place | null {
  const c = feature.geometry?.coordinates, p = feature.properties;
  if (!c || c.length < 2 || !p || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !inJapan(c[1], c[0])) return null;
  if (String(p.countrycode).toUpperCase() !== "JP") return null;
  if (p.osm_key === "highway" && p.osm_value !== "bus_stop") return null;
  const north = p.state === "北海道" || (!p.state && inHokkaido(c[1], c[0]));
  if (region === "hokkaido" && !north) return null;
  const kind: Record<string, string> = { hotel: "ホテル", hostel: "ホステル", guest_house: "宿泊施設", station: "駅", bus_stop: "バス停", stadium: "競技場", sports_centre: "スポーツ施設", sports_hall: "体育館", theatre: "劇場・ホール", city: "市の代表地点", town: "町の代表地点", village: "村の代表地点" };
  const address = [...new Set([p.state, p.city, p.district, p.locality, p.street, p.housenumber].filter(Boolean))].join(" ");
  return { id: `osm-${p.osm_type}-${p.osm_id}`, name: String(p.name || p.street || address), detail: `${address}${kind[String(p.osm_value)] ? " · " + kind[String(p.osm_value)] : ""}`, lat: c[1], lng: c[0], region: north ? "hokkaido" : "japan", source: "OpenStreetMap" };
}
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = (params.get("q") || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const region = params.get("region") === "hokkaido" ? "hokkaido" : "japan";
  if (q.length < 2 || q.length > 120) return Response.json({ error: "2〜120文字で場所を入力してください。" }, { status: 400 });
  const coordinate = coordinatePlace(q, region);
  if (coordinate) return Response.json({ places: [coordinate] });
  if (/^[\d.,、\s-]+$/.test(q)) return Response.json({ error: "日本国内の緯度・経度を、緯度,経度の順で入力してください。会場とホテルは北海道内を指定します。" }, { status: 400 });
  const tokens = searchTokens(q);
  // Keep token boundaries: "登別 体育館" is not the same query as "登別体育館".
  const key = `${region}:${tokens.map(normalizePlaceName).sort().join(" ")}`;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.at < 30 * 60 * 1000) return Response.json({ places: saved.places });
  const local = matchingPresets(q, region);
  // Known locations work immediately, even when the public provider is unavailable.
  const exact = exactPreset(q, local);
  if (exact) return Response.json({ places: [exact] });
  let places: Place[] = [...local];
  let succeeded = false;
  const photonQuery = q === "札幌ドーム" ? "大和ハウス プレミストドーム" : q.replace(/駅$/, "");
  const accept = (p: Place) => tokens.length < 2 || matchesKeywords(`${p.name} ${p.detail}`, q);
  async function searchPhoton(query: string, tags: string[]) {
    const search = new URL("https://photon.komoot.io/api/");
    search.searchParams.set("q", query);
    search.searchParams.set("limit", tokens.length > 1 ? "40" : "12");
    search.searchParams.set("bbox", region === "hokkaido" ? "139.3,41.35,146.3,45.65" : "122,24,146.3,45.65");
    for (const tag of tags) search.searchParams.append("osm_tag", tag);
    try {
      const data = await limitedFetch(search.href) as { features?: Feature[] };
      if (!Array.isArray(data.features)) throw new Error("Invalid geocoder response");
      succeeded = true;
      places.push(...data.features.map(f => fromPhoton(f, region)).filter((p): p is Place => !!p).map(canonicalPlace).filter(accept));
    } catch { /* Continue to bounded keyword and address fallbacks. */ }
  }
  await searchPhoton(photonQuery, q.endsWith("駅") ? ["railway:station"] : []);
  // One grouped request, only when the existing sources have no literal match.
  // This also handles Photon returning unrelated fuzzy matches instead of [].
  if (!places.some(p => matchesKeywords(`${p.name} ${p.detail}`, q))) {
    try {
      const data = await limitedFetch(wikipediaSearchUrl(q));
      const extra = wikipediaPlaces(data, q, region);
      succeeded = true;
      places.push(...extra);
    } catch { /* Keep Photon and the existing fallbacks usable independently. */ }
  }
  // At most four extra calls, on explicit search only; stop as soon as matching
  // candidates exist. The same provider URL is cached and coalesced above.
  if (!places.length) {
    for (const variant of keywordVariants(q)) {
      await searchPhoton(variant.query, variant.tags);
      if (places.length) break;
    }
  }
  if (!places.length) {
    const url = new URL("https://msearch.gsi.go.jp/address-search/AddressSearch");
    url.searchParams.set("q", q);
    try {
      const data = await limitedFetch(url.href);
      if (!Array.isArray(data)) throw new Error("Invalid address response");
      succeeded = true;
      for (const f of data as Feature[]) {
        const c = f.geometry?.coordinates, title = String(f.properties?.title || "");
        if (!c || !Number.isFinite(c[0]) || !Number.isFinite(c[1]) || !inJapan(c[1], c[0])) continue;
        const north = title.startsWith("北海道");
        if (region === "hokkaido" && !north) continue;
        if (tokens.length > 1 && !matchesKeywords(title, q)) continue;
        places.push({ id: `gsi-${c[1]}-${c[0]}`, name: title, detail: "住所の代表地点 · 施設の正確な位置とは限りません", lat: c[1], lng: c[0], region: north ? "hokkaido" : "japan", source: "国土地理院" });
      }
    } catch { /* Return an actionable service error if both services failed. */ }
  }
  const names = (p: Place) => [p.name, ...(p.aliases || [])].map(normalizePlaceName);
  const score = (p: Place) => Math.max(...[p.name, ...(p.aliases || [])].map(n => keywordScore(n, q)));
  places = places.sort((a, b) => score(b) - score(a))
    .filter((p, i, a) => a.findIndex(v => v.id === p.id || (names(v).some(n => names(p).includes(n)) && distance(v, p) < .2)) === i)
    .slice(0, 10);
  if (!succeeded && !places.length) return Response.json({ error: "場所の検索に接続できませんでした。もう一度検索するか、地図で位置を指定してください。" }, { status: 502 });
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), places });
  return Response.json({ places });
}
