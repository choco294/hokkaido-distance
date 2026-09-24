export type Place = {
  id: string; name: string; detail: string; lat: number; lng: number;
  region: "hokkaido" | "japan";
  source: "OpenStreetMap" | "国土地理院" | "施設公式サイト" | "Wikipedia" | "地図で指定" | "座標を入力";
  aliases?: string[];
  sourceUrl?: string;
};
export type Comparison = { venue: Place; hotel: Place; origin: Place };
export const EARTH_RADIUS_KM = 6371.0088;
const rad = (n: number) => n * Math.PI / 180;
const deg = (n: number) => n * 180 / Math.PI;
export function distance(a: Pick<Place,"lat"|"lng">, b: Pick<Place,"lat"|"lng">): number {
  const h = Math.sin(rad(b.lat-a.lat)/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lng-a.lng)/2)**2;
  return 2*EARTH_RADIUS_KM*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}
export function destination(a: Pick<Place,"lat"|"lng">, km: number, bearing: number): [number,number] {
  const d=km/EARTH_RADIUS_KM, p=rad(a.lat), t=rad(bearing);
  const latitude=Math.asin(Math.sin(p)*Math.cos(d)+Math.cos(p)*Math.sin(d)*Math.cos(t));
  const longitude=rad(a.lng)+Math.atan2(Math.sin(t)*Math.sin(d)*Math.cos(p),Math.cos(d)-Math.sin(p)*Math.sin(latitude));
  return [deg(latitude),((deg(longitude)+540)%360)-180];
}
export function ring(a: Pick<Place,"lat"|"lng">, km: number): [number,number][] {
  return Array.from({length:181},(_,i)=>destination(a,km,i*2));
}
export function formatDistance(km: number): string {
  return km.toLocaleString("ja-JP",{minimumFractionDigits:1,maximumFractionDigits:km>0&&km<0.1?3:1});
}
export function inHokkaido(lat: number,lng: number) {
  return lat>=41.35&&lat<=45.65&&lng>=139.3&&lng<=146.3 && !(lat<41.65&&lng>140.6);
}
export function inJapan(lat:number,lng:number) { return lat>=24&&lat<=45.65&&lng>=122&&lng<=146.3; }
export function coordinatePlace(value: string, region: "hokkaido"|"japan"): Place|null {
  const match=value.normalize("NFKC").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,、\s]\s*(-?\d+(?:\.\d+)?)$/);
  if(!match)return null;
  const lat=Number(match[1]),lng=Number(match[2]);
  if(!inJapan(lat,lng)||(region==="hokkaido"&&!inHokkaido(lat,lng)))return null;
  return {id:`coords-${lat}-${lng}`,name:`指定地点 ${lat.toFixed(4)}, ${lng.toFixed(4)}`,detail:"入力した緯度・経度",lat,lng,region:inHokkaido(lat,lng)?"hokkaido":"japan",source:"座標を入力"};
}
export function routeUrl(a: Place,b: Place) {
  return `https://www.google.com/maps/dir/?api=1&origin=${a.lat},${a.lng}&destination=${b.lat},${b.lng}&travelmode=transit`;
}
