import { normalizePlaceName, searchTokens } from "./search-text";

type SearchVariant = { query: string; tags: string[] };
// These are retrieval hints, not synonyms: results still have to match every
// original word. In particular, a swimming pool must not match "体育館".
const categories: Record<string, string[]> = {
  "体育館": ["leisure:sports_centre", "leisure:sports_hall", "leisure:stadium"],
  "アリーナ": ["leisure:stadium", "leisure:sports_centre"],
  "ホテル": ["tourism:hotel", "tourism:guest_house", "tourism:hostel"],
  "旅館": ["tourism:hotel", "tourism:guest_house"],
  "ホール": ["amenity:theatre", "amenity:community_centre", "amenity:events_venue"],
  "劇場": ["amenity:theatre"],
  "駅": ["railway:station"],
};

export function keywordVariants(query: string): SearchVariant[] {
  const tokens = searchTokens(query);
  if (tokens.length < 2) return [];
  const category = Object.entries(categories).find(([name]) => tokens.some(t => normalizePlaceName(t) === normalizePlaceName(name)));
  const meaningful = tokens.filter(t => !category || normalizePlaceName(t) !== normalizePlaceName(category[0]));
  // Prefer useful words over generic qualifiers, independently of word order.
  const anchors = [...meaningful].sort((a, b) => {
    const generic = (s: string) => /^(総合|市立|町立|中央|施設)$/.test(s) ? 1 : 0;
    return generic(a) - generic(b) || b.length - a.length || a.localeCompare(b, "ja");
  });
  const candidates: SearchVariant[] = [];
  if (category && meaningful.length) {
    candidates.push({ query: meaningful.join(" "), tags: category[1] });
    if (meaningful.length > 1) candidates.push({ query: anchors[0], tags: category[1] });
  }
  for (const token of anchors.slice(0, 2)) candidates.push({ query: token.replace(/駅$/, "") || token, tags: [] });
  candidates.push({ query: tokens.join(""), tags: [] });
  return candidates.filter((v, i, a) => a.findIndex(x => x.query === v.query && x.tags.join() === v.tags.join()) === i).slice(0, 4);
}
