import { inHokkaido, inJapan, type Place } from "./geo";
import { matchesKeywords, searchTokens } from "./search-text";

type WikiPage = {
  pageid?: number; ns?: number; title?: string;
  pageprops?: Record<string, unknown>;
  redirects?: { title?: string; fragment?: string }[];
  coordinates?: { lat?: number; lon?: number; primary?: boolean | string; globe?: string }[];
};

export function wikipediaSearchUrl(query: string): string {
  const url = new URL("https://ja.wikipedia.org/w/api.php");
  // Search terms only, without accepting CirrusSearch query operators.
  const text = searchTokens(query).map(t => t.replace(/["\\|:(){}\[\]<>]/g, " ").trim()).filter(Boolean).join(" ");
  url.search = new URLSearchParams({
    action: "query", format: "json", formatversion: "2",
    generator: "search", gsrsearch: text, gsrnamespace: "0", gsrlimit: "12",
    prop: "coordinates|redirects|pageprops", coprimary: "primary", colimit: "max",
    rdnamespace: "0", rdlimit: "50", ppprop: "disambiguation",
  }).toString();
  return url.href;
}

export function wikipediaPlaces(data: unknown, query: string, region: string): Place[] {
  if (!data || typeof data !== "object" || "error" in data) throw new Error("Invalid Wikipedia response");
  const response = data as { batchcomplete?: boolean; query?: { pages?: WikiPage[] } };
  // A successful generator search with no hits has batchcomplete but no query.
  if (response.batchcomplete !== true && !Array.isArray(response.query?.pages)) throw new Error("Invalid Wikipedia response");
  return (response.query?.pages || []).flatMap(page => {
    if (!page || typeof page !== "object") return [];
    if (!Number.isSafeInteger(page.pageid) || page.pageid! <= 0 || page.ns !== 0 || typeof page.title !== "string" || !page.title.trim()) return [];
    if (page.pageprops && "disambiguation" in page.pageprops) return [];
    const coordinates = Array.isArray(page.coordinates) ? page.coordinates.filter(c => c && (c.primary === true || c.primary === "") && c.globe === "earth") : [];
    if (coordinates.length !== 1) return [];
    const { lat, lon } = coordinates[0];
    if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || !inJapan(lat, lon)) return [];
    const north = inHokkaido(lat, lon);
    if (region === "hokkaido" && !north) return [];
    const aliases = (Array.isArray(page.redirects) ? page.redirects : [])
      .filter(r => r && typeof r.title === "string" && !r.fragment).map(r => r.title!).slice(0, 50);
    // Article-body mentions are not sufficient evidence that this is the place.
    if (!matchesKeywords([page.title, ...aliases, north ? "北海道" : "日本"].join(" "), query)) return [];
    const matchedAliases = aliases.filter(name => matchesKeywords(name, query));
    return [{
      id: `wikipedia-ja-${page.pageid}`, name: page.title, lat, lng: lon,
      detail: `${north ? "北海道内" : "日本国内"}${matchedAliases.length ? " · 別名：" + matchedAliases.slice(0, 2).join("、") : ""} · Wikipedia掲載地点（位置は地図で確認）`,
      region: north ? "hokkaido" : "japan", source: "Wikipedia", aliases,
      sourceUrl: `https://ja.wikipedia.org/?curid=${page.pageid}`,
    } satisfies Place];
  });
}
