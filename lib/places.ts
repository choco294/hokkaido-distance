import data from "./presets.json";
import type { Place } from "./geo";
import { normalizePlaceName, matchesKeywords } from "./search-text";
import { originStations } from "./origin-stations";
export { normalizePlaceName } from "./search-text";
export const places = data as Record<keyof typeof data, Place>;
export const venues = [places.escon, places.dome, places.makomanai, places.kitaeru];
export const hotels = [places.sapporo, places.otaru, places.asahikawa];
export const origins: Place[] = originStations;
export const allPresets = [...Object.values(places), ...origins].filter((p, i, a) => a.findIndex(v => v.id === p.id) === i);

const aliases: Record<string, string[]> = {
  [places.omo7asahikawa.id]: ["OMO7", "OMO7旭川", "OMO7 Asahikawa", "OMO7 Asahikawa by Hoshino Resorts", "おも7", "おも7旭川", "おもせぶん旭川", "旭川グランドホテル"],
  [places.grand.id]: ["札幌グランド", "さっぽろぐらんどほてる", "Sapporo Grand Hotel"],
  [places.escon.id]: ["エスコン", "エスコンフィールド", "ES CON", "ESCON", "ESCON FIELD HOKKAIDO"],
  [places.dome.id]: ["札幌ドーム", "プレミストドーム", "大和ハウスプレミストドーム"],
  [places.makomanai.id]: ["真駒内アイスアリーナ", "真駒内アリーナ", "セキスイハイムアイスアリーナ"],
  [places.kitaeru.id]: ["きたえーる", "北海きたえーる"],
};
// Keep verified names/coordinates when the provider returns an older record.
export function canonicalPlace(place: Place): Place {
  return allPresets.find(p => p.id === place.id) || place;
}
export function exactPreset(query: string, candidates: Place[]): Place | undefined {
  const q = normalizePlaceName(query);
  return candidates.find(p => [p.name, ...(aliases[p.id] || [])].some(n => normalizePlaceName(n) === q));
}
export function matchingPresets(query: string, region: string): Place[] {
  const q = normalizePlaceName(query);
  if (!q) return [];
  return allPresets.filter(p => {
    if (region === "hokkaido" && p.region !== "hokkaido") return false;
    const names = [p.name, ...(aliases[p.id] || [])].map(normalizePlaceName);
    const text = normalizePlaceName(`${p.name} ${p.detail} ${(aliases[p.id] || []).join(" ")}`);
    return names.some(n => n.includes(q)) || matchesKeywords(text, query);
  });
}
