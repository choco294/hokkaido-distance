import data from "./presets.json";
import type { Place } from "./geo";

export type OriginStation = Place & { city: string; group: string };
// Photon / OpenStreetMap station representative points, checked 2026-09-18.
// Each city has one convenient major station, not every station in the city.
const station = (city: string, name: string, group: string, prefecture: string, osmId: number, lat: number, lng: number): OriginStation => ({
  id: `osm-N-${osmId}`, city, name, group, detail: `${prefecture} ${city} · 駅の代表地点`,
  lat, lng, region: "japan", source: "OpenStreetMap",
});
const preset = (p: Place, city: string, group: string): OriginStation => ({ ...p, city, group, detail: `${p.detail} · 駅の代表地点` });

export const designatedStations: OriginStation[] = [
  preset(data.sapporo as Place, "札幌市", "北海道・東北"),
  station("仙台市", "仙台駅", "北海道・東北", "宮城県", 3570916502, 38.2603516, 140.8823921),
  station("さいたま市", "大宮駅", "関東", "埼玉県", 264211486, 35.9063773, 139.6243335),
  station("千葉市", "千葉駅", "関東", "千葉県", 2559434100, 35.6137344, 140.1125333),
  station("横浜市", "横浜駅", "関東", "神奈川県", 263274999, 35.4662066, 139.6231953),
  station("川崎市", "川崎駅", "関東", "神奈川県", 3547330604, 35.5314039, 139.6968929),
  station("相模原市", "相模原駅", "関東", "神奈川県", 1135519820, 35.5814551, 139.37074),
  station("新潟市", "新潟駅", "中部", "新潟県", 4087367885, 37.9122444, 139.0613294),
  station("静岡市", "静岡駅", "中部", "静岡県", 3999393706, 34.9715372, 138.3883294),
  station("浜松市", "浜松駅", "中部", "静岡県", 3999193759, 34.7040059, 137.7348139),
  preset(data.nagoya as Place, "名古屋市", "中部"),
  station("京都市", "京都駅", "関西", "京都府", 267316272, 34.9853497, 135.758766),
  preset(data.osaka as Place, "大阪市", "関西"),
  station("堺市", "堺東駅", "関西", "大阪府", 8183023142, 34.5755127, 135.4849582),
  station("神戸市", "三ノ宮駅", "関西", "兵庫県", 3999683422, 34.6948605, 135.1950871),
  station("岡山市", "岡山駅", "中国・九州", "岡山県", 11435050207, 34.6654089, 133.917825),
  station("広島市", "広島駅", "中国・九州", "広島県", 6624627173, 34.3985139, 132.4753527),
  station("北九州市", "小倉駅", "中国・九州", "福岡県", 11724845346, 33.8872865, 130.8832221),
  station("福岡市", "博多駅", "中国・九州", "福岡県", 3637038754, 33.5900436, 130.4203556),
  station("熊本市", "熊本駅", "中国・九州", "熊本県", 3667500999, 32.7903174, 130.6889738),
];
export const originStations = [...designatedStations, preset(data.tokyo as Place, "東京都区部", "東京（政令指定都市以外）")];
