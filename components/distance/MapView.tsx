"use client";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Maximize2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Comparison, type Place, distance, ring, formatDistance } from "@/lib/geo";

export default function MapView({ type, comparison, pickMode, onPick, draftPoint }: {
  type: "hokkaido" | "japan"; comparison: Comparison | null; pickMode: string | null;
  onPick: (lat: number, lng: number) => void; draftPoint: Place | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const library = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const fit = useRef<() => void>(() => {});
  const callback = useRef(onPick); callback.current = onPick;
  const mode = useRef(pickMode); mode.current = pickMode;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [tileError, setTileError] = useState(false);
  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    let tileTimer: ReturnType<typeof setTimeout> | undefined;
    import("leaflet").then(L => {
      if (stopped || !container.current) return;
      library.current = L;
      const instance = L.map(container.current, { zoomControl: false, scrollWheelZoom: false, zoomSnap: .25, minZoom: 4, maxZoom: 18 });
      map.current = instance;
      instance.setView(type === "hokkaido" ? [43.03, 141.7] : [35.68, 139.76], 9);
      L.control.zoom({ position: "bottomright", zoomInTitle: "拡大", zoomOutTitle: "縮小" }).addTo(instance);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(instance);
      const tiles = L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png", { minZoom: 2, maxZoom: 18, attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>', keepBuffer: 1 }).addTo(instance);
      let loaded = false;
      tiles.on("tileload", () => { loaded = true; if (!stopped) setTileError(false); });
      tileTimer = setTimeout(() => { if (!stopped && !loaded) setTileError(true); }, 12000);
      layer.current = L.layerGroup().addTo(instance);
      instance.on("click", (e: Leaflet.LeafletMouseEvent) => { if (mode.current) callback.current(e.latlng.lat, e.latlng.lng); });
      observer = new ResizeObserver(() => { instance.invalidateSize(); }); observer.observe(container.current);
      setReady(true);
    }).catch(() => { if (!stopped) setError("地図を読み込めませんでした。ページを再読み込みしてください。"); });
    return () => { stopped = true; observer?.disconnect(); if (tileTimer) clearTimeout(tileTimer); map.current?.remove(); map.current = null; layer.current = null; };
  }, [type]);
  useEffect(() => {
    const L = library.current, m = map.current, layers = layer.current;
    if (!ready || !L || !m || !layers) return;
    layers.clearLayers();
    if (!comparison) {
      const center: [number, number] = draftPoint ? [draftPoint.lat, draftPoint.lng] : type === "hokkaido" ? [43.3, 142.5] : [36.2, 137.5];
      if (draftPoint) L.circleMarker(center, { radius: 8, color: "#207a43", fillOpacity: .8 }).addTo(layers);
      fit.current = () => m.setView(center, draftPoint ? 12 : 6, { animate: false });
      fit.current();
      return;
    }

    const km = distance(comparison.venue, comparison.hotel);
    const center = type === "hokkaido" ? comparison.venue : comparison.origin;
    const color = type === "hokkaido" ? "#c7602c" : "#207a43";
    const points = ring(center, km);
    L.polygon(points, { color, weight: 2, opacity: .8, fillColor: color, fillOpacity: .07, dashArray: "7 6", interactive: false }).addTo(layers);
    const marker = (p: Place, letter: string, css: string) => {
      const tooltip = document.createElement("span"); tooltip.textContent = p.name;
      L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "place-marker", html: `<span class="pin ${css}">${letter}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }), title: p.name, keyboard: true })
        .bindTooltip(tooltip, { direction: "top", offset: [0, -18], permanent: false }).addTo(layers);
    };
    if (type === "hokkaido") {
      L.polyline([[comparison.venue.lat, comparison.venue.lng], [comparison.hotel.lat, comparison.hotel.lng]], { color, weight: 3, interactive: false }).addTo(layers);
      marker(comparison.venue, "A", "pin-venue"); marker(comparison.hotel, "B", "pin-hotel");
      const midpoint: [number, number] = [(comparison.venue.lat + comparison.hotel.lat) / 2, (comparison.venue.lng + comparison.hotel.lng) / 2];
      const content = document.createElement("span"); content.className = "line-distance"; content.textContent = `${formatDistance(km)} km`;
      L.tooltip({ permanent: true, direction: "center", className: "distance-tooltip", offset: [0, -17] }).setLatLng(midpoint).setContent(content).addTo(layers);
    } else marker(comparison.origin, "C", "pin-origin");
    if (draftPoint && draftPoint.id !== center.id && (type !== "hokkaido" || draftPoint.id !== comparison.hotel.id)) {
      const tip = document.createElement("span"); tip.textContent = "新しい指定位置（未反映）";
      L.circleMarker([draftPoint.lat, draftPoint.lng], { radius: 9, color: "#173d29", weight: 2, fillColor: "white", fillOpacity: 1, dashArray: "3 2" }).bindTooltip(tip).addTo(layers);
    }
    const bounds = L.latLngBounds(km < .02 ? ring(center, .05) : points);
    if (draftPoint) bounds.extend([draftPoint.lat, draftPoint.lng]);
    fit.current = () => m.fitBounds(bounds, { padding: [24, 26], maxZoom: 16, animate: false });
    fit.current();
  }, [ready, comparison, type, draftPoint]);
  useEffect(() => { if (map.current) map.current.getContainer().style.cursor = pickMode ? "crosshair" : ""; }, [pickMode, ready]);
  return <div className={`map-shell ${pickMode ? "picking" : ""}`}>
    <div ref={container} className="map-canvas" aria-label={type === "hokkaido" ? "北海道の会場とホテルの地図" : "比較の起点と同じ距離の円を示す地図"} />
    {!ready && <div className="map-loading"><MapPin /><span>{error || "地図を読み込み中…"}</span></div>}
    {tileError && <div className="tile-error" role="status">背景地図に接続できません。通信状況を確認して再読み込みしてください。</div>}
    {pickMode && <div className="pick-instruction" role="status"><MapPin size={16} />{pickMode}の位置を地図で押してください</div>}
    <Button type="button" variant="outline" className="map-fit" onClick={() => fit.current()} aria-label="比較範囲を全体表示"><Maximize2 size={16} /></Button>
  </div>;
}
