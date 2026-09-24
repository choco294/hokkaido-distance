"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowRight, CircleHelp, ExternalLink, MapPin, MoveRight, Ruler, TrainFront, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import PlacePicker from "@/components/distance/PlacePicker";
import MapView from "@/components/distance/MapView";
import { type Place, type Comparison, distance, formatDistance, inHokkaido, inJapan, routeUrl } from "@/lib/geo";
import { venues, hotels, origins } from "@/lib/places";

type Field = "venue" | "hotel" | "origin";
const fieldNames: Record<Field, string> = { venue: "会場", hotel: "ホテル", origin: "比較の起点" };
type ModelTool = { name: string; description: string; title: string; inputSchema: object; annotations: { readOnlyHint: boolean; untrustedContentHint: boolean }; execute: (input: unknown) => unknown };

export default function Home() {
  const [draft, setDraft] = useState<Record<Field, Place | null>>({ venue: null, hotel: null, origin: null });
  const [result, setResult] = useState<Comparison | null>(null);
  const [pick, setPick] = useState<Field | null>(null);
  const [lastEdited, setLastEdited] = useState<Field | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const resultSection = useRef<HTMLElement>(null);
  const mapSection = useRef<HTMLDivElement>(null);
  const km = result ? distance(result.venue, result.hotel) : 0;
  const dirty = result ? (Object.keys(draft) as Field[]).some(k => !draft[k] || draft[k]?.id !== result[k].id) : Object.values(draft).some(Boolean);
  const valid = !!(draft.venue && draft.hotel && draft.origin);
  function update(field: Field, value: Place | null) { setDraft(s => ({ ...s, [field]: value })); setLastEdited(field); setMessage(""); setError(""); }
  const apply = useCallback((comparison: Comparison) => {
    if (!inHokkaido(comparison.venue.lat, comparison.venue.lng) || !inHokkaido(comparison.hotel.lat, comparison.hotel.lng)) throw new Error("会場とホテルは北海道内を選んでください。");
    if (!inJapan(comparison.origin.lat, comparison.origin.lng)) throw new Error("比較の起点は日本国内を選んでください。");
    setResult(comparison); setDraft(comparison); setPick(null); setLastEdited(null); setError("");
    const d = distance(comparison.venue, comparison.hotel);
    setMessage(`比較しました。直線距離は約${formatDistance(d)}kmです。`);
    return { distanceKm: Math.round(d * 1000) / 1000, method: "great-circle", venue: comparison.venue.name, hotel: comparison.hotel.name, origin: comparison.origin.name };
  }, []);
  function compare() {
    if (!draft.venue || !draft.hotel || !draft.origin) { setError("3つの場所を、検索候補または地図から選んでください。"); return; }
    try { apply({ venue: draft.venue, hotel: draft.hotel, origin: draft.origin }); if (window.innerWidth < 900) resultSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }
    catch (e) { setError(e instanceof Error ? e.message : "入力を確認してください。"); }
  }
  function togglePick(field: Field) {
    setPick(p => p === field ? null : field); setError("");
    if (pick !== field) requestAnimationFrame(() => document.getElementById(field === "origin" ? "japan-map" : "hokkaido-map")?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }
  function pickPoint(lat: number, lng: number) {
    if (!pick) return;
    if (!inJapan(lat, lng) || (pick !== "origin" && !inHokkaido(lat, lng))) { setError(pick === "origin" ? "日本国内を指定してください。" : "北海道内の位置を指定してください。"); return; }
    const p: Place = { id: `map-${lat.toFixed(7)}-${lng.toFixed(7)}`, name: `地図で指定した${fieldNames[pick]}`, detail: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, region: inHokkaido(lat, lng) ? "hokkaido" : "japan", source: "地図で指定" };
    update(pick, p); setPick(null); setMessage("位置を指定しました。「距離を比べる」で反映してください。");
  }
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: ModelTool, options: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const pointSchema = { type: "object", properties: { name: { type: "string", minLength: 1, maxLength: 100 }, lat: { type: "number", minimum: 24, maximum: 45.65 }, lng: { type: "number", minimum: 122, maximum: 146.3 } }, required: ["name", "lat", "lng"], additionalProperties: false };
    try { void Promise.resolve(context.registerTool({
      name: "compare_hokkaido_distance", title: "北海道の距離を比較", description: "Set a Hokkaido venue and hotel plus an origin in Japan, then update both maps with their straight-line distance. Coordinates must be known and verified by the caller.",
      inputSchema: { type: "object", properties: { venue: pointSchema, hotel: pointSchema, origin: pointSchema }, required: ["venue", "hotel", "origin"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        if (!input || typeof input !== "object") throw new Error("Three named coordinate points are required.");
        const record = input as Record<string, unknown>;
        const build = (field: Field): Place => {
          const value = record[field]; if (!value || typeof value !== "object") throw new Error(`Missing ${field}`);
          const p = value as Record<string, unknown>;
          if (typeof p.name !== "string" || !p.name.trim() || p.name.length > 100 || typeof p.lat !== "number" || typeof p.lng !== "number" || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) throw new Error(`Invalid ${field}`);
          return { id: `agent-${field}-${p.lat}-${p.lng}-${p.name}`, name: p.name.trim(), detail: `${p.lat}, ${p.lng}`, lat: p.lat, lng: p.lng, region: inHokkaido(p.lat, p.lng) ? "hokkaido" : "japan", source: "座標を入力" };
        };
        const comparison = { venue: build("venue"), hotel: build("hotel"), origin: build("origin") };
        let output: ReturnType<typeof apply> | undefined;
        flushSync(() => { output = apply(comparison); });
        return output;
      },
    }, { signal: lifecycle.signal })).catch(() => {}); } catch { /* Normal UI remains available in unsupported browsers. */ }
    return () => lifecycle.abort();
  }, [apply]);
  const picker = (field: Field, label: string, letter: string, presets: Place[], placeholder: string) => <PlacePicker id={field} label={label} letter={letter} value={draft[field]} onChange={value => update(field, value)} presets={presets} region={field === "origin" ? "japan" : "hokkaido"} placeholder={placeholder} onPick={() => togglePick(field)} picking={pick === field} />;

  return <main className="workspace">
    <header className="topbar"><a className="brand" href="#"><img src="/hokkaido-green.png" width={38} height={38} alt="" /><h1>北海道の距離感</h1></a><a className="help-link" href="#about"><CircleHelp size={17} /><span>距離の考え方</span></a></header>
    <div className="page-heading"><div><p className="eyebrow">北海道 <MoveRight size={16} /> いつもの街</p><h2>この距離、あなたの街なら？</h2></div><p>会場とホテルの距離を、<br className="desktop-break" />なじみのある場所に置き換えよう。</p></div>
    <div className="app-grid">
      <aside className="controls" aria-label="比較する場所の指定">
        <div className="control-title"><span className="step">01</span><h3>北海道の2地点</h3></div>
        <p className="search-notice">無料の地図・施設検索サービスを利用しています。施設が見つからない場合や、名称・位置の情報が古い場合があります。見つからないときは「地図で指定」をご利用ください。</p>
        {picker("venue", "ライブ会場", "A", venues, "会場名・住所を入力")}
        {picker("hotel", "ホテル・宿泊エリア", "B", hotels, "ホテル名・住所を入力")}
        <div className="control-divider" />
        <div className="control-title"><span className="step green">02</span><h3>なじみのある起点</h3></div>
        {picker("origin", "比較の起点", "C", origins, "駅名・住所を入力")}
        <Button className="compare-button" onClick={compare} disabled={!valid}>距離を比べる <ArrowRight size={19} /></Button>
        <p className="calculation-label"><Ruler size={14} />直線距離で比較します</p>
        {error && <p className="form-error" role="alert">{error}</p>}
      </aside>
      <section ref={resultSection} className="results" aria-label="距離の比較結果">
        {result ? <>
        <div className="result-top"><h3>同じ距離を、2つの地図で。</h3><span className="result-badge">{dirty ? "入力を変更中" : "比較結果"}</span></div>
        <div className="distance-summary">
          <div className="distance-number"><span>会場からホテルまでの直線距離</span><p><small>約</small><strong>{formatDistance(km)}</strong><b>km</b></p></div>
          <div className="summary-equals" aria-hidden="true">＝</div>
          <div className="translation"><span>あなたの街に置き換えると</span><p><strong>{result.origin.name}</strong>を中心に、<br />下の緑の円のふちまでの距離。</p></div>
        </div>
        {dirty && <div className="pending-banner"><span>地図は変更前の比較です。</span><Button onClick={compare} disabled={!valid} size="sm" variant="outline">変更を反映 <ArrowRight size={14} /></Button></div>}
        <div ref={mapSection} className="map-grid">
          <article id="hokkaido-map" className="map-card hokkaido-map"><div className="map-heading"><div><span className="map-label orange">北海道</span><h4>会場から、ホテルまで</h4></div><span className="map-index">A — B</span></div>
            <MapView type="hokkaido" comparison={result} pickMode={pick && pick !== "origin" ? fieldNames[pick] : null} onPick={pickPoint} draftPoint={lastEdited && lastEdited !== "origin" ? draft[lastEdited] : null} />
            <div className="map-caption"><p><span className="caption-letter venue">A</span><span>{result.venue.name}</span></p><p><span className="caption-letter hotel">B</span><span>{result.hotel.name}</span></p></div>
          </article>
          <article id="japan-map" className="map-card mainland-map"><div className="map-heading"><div><span className="map-label green">あなたの街</span><h4>{result.origin.name}を起点に</h4></div><span className="map-index">C</span></div>
            <MapView type="japan" comparison={result} pickMode={pick === "origin" ? fieldNames.origin : null} onPick={pickPoint} draftPoint={lastEdited === "origin" ? draft.origin : null} />
            <div className="map-caption"><p><span className="caption-letter origin">C</span><span>{result.origin.name}</span></p><p className="radius-caption"><span className="ring-key" /><span>円の半径 ＝ 北海道の2地点間の距離</span></p></div>
          </article>
        </div>
        {pick && <div className="pick-actions"><p><MapPin size={16} />{pick === "origin" ? "「あなたの街」" : "「北海道」"}の地図で位置を指定できます。</p><Button variant="ghost" size="sm" onClick={() => setPick(null)}><X size={15} />キャンセル</Button></div>}
        <div className="travel-note"><TrainFront size={21} /><div><h4>実際の移動は、経路と時刻も確認。</h4><p>道路の距離・所要時間は、この直線距離とは異なります。ライブ後の移動は終電・終バスも確認しましょう。</p></div><a href={routeUrl(result.venue, result.hotel)} target="_blank" rel="noopener noreferrer">Google マップで経路を見る <ExternalLink size={15} /></a></div>
        </> : <>
          {!pick && <Empty className="comparison-empty"><EmptyHeader><EmptyMedia variant="icon"><MapPin /></EmptyMedia><EmptyTitle>比較する場所を選んでください</EmptyTitle><EmptyDescription>会場・ホテル・比較の起点を指定し、「距離を比べる」を押すと結果を表示します。</EmptyDescription></EmptyHeader></Empty>}
          {pick && <article id={pick === "origin" ? "japan-map" : "hokkaido-map"} className="map-card"><div className="map-heading"><h4>{fieldNames[pick]}を地図で指定</h4><Button variant="ghost" size="sm" onClick={() => setPick(null)}><X size={15} />キャンセル</Button></div><MapView key={pick === "origin" ? "japan" : "hokkaido"} type={pick === "origin" ? "japan" : "hokkaido"} comparison={null} pickMode={fieldNames[pick]} onPick={pickPoint} draftPoint={draft[pick] || (pick === "hotel" ? draft.venue : null)} /></article>}
        </>}
        <p className="sr-only" role="status" aria-live="polite">{message}</p>
      </section>
    </div>
    {dirty && valid && <div className="mobile-apply-bar"><span>入力した場所で比較</span><Button onClick={compare}>{result ? "変更を反映" : "距離を比べる"} <ArrowRight size={16} /></Button></div>}
    <footer id="about" className="about"><details><summary><CircleHelp size={16} />距離の計算方法・出典</summary><div className="about-content">
      <p>表示するのは、地球の丸みを考慮した2地点間の最短距離（球面上の大円距離）の概算です。地球の平均半径を6,371.0088 kmとして、緯度・経度から計算しています。円のふちは、起点からこの距離にある場所を示します。移動経路や到達可能な範囲を表すものではありません。</p>
      <p>施設検索はOpenStreetMapの登録地点を使用し、一致する候補がない場合はWikipediaの名称・別名・座標でも探します。一部の施設は公式情報で名称・位置を補完しています。空白で区切ると、各キーワードを名前・住所・施設の種類と照合します。Wikipediaに記事や座標がない施設、検索元に未登録の名称・別名は見つからない場合があります。掲載情報が古い場合や、代表地点が出入口と異なる場合もあるため、位置は地図で確認・指定してください。地図での地域判定は概略の範囲によります。施設の営業・空室やイベントの開催を保証するものではありません。</p>
      <p>比較の起点の入力欄では、政令指定都市20市の主要駅を各1駅と東京駅を候補から選べます。駅の座標は代表地点で、改札や出入口の位置とは異なる場合があります。</p>
      <div className="source-links"><a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">背景地図：国土地理院（地理院タイル）<ExternalLink size={13} /></a><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">施設・駅の位置：© OpenStreetMap contributors<ExternalLink size={13} /></a><a href="https://github.com/komoot/photon" target="_blank" rel="noopener noreferrer">施設検索：Photon<ExternalLink size={13} /></a><a href="https://maps.gsi.go.jp/" target="_blank" rel="noopener noreferrer">住所検索：国土地理院<ExternalLink size={13} /></a><a href="https://www.siteitosi.jp/about/designated.html" target="_blank" rel="noopener noreferrer">都市の一覧：指定都市市長会<ExternalLink size={13} /></a></div>
      <p className="small-print">登録地点の取得日：2026年9月15〜18日。検索ボタンを押すと、入力した施設名・住所を位置検索サービスに送信します。複数キーワードは分けて照会する場合があります。外部地図・検索サービスへの通信が必要です。</p>
      <p className="small-print">名称・位置の補完：<a href="https://hoshinoresorts.com/ja/hotels/omo7asahikawa/" target="_blank" rel="noopener noreferrer">OMO7旭川 by 星野リゾート 公式サイト</a></p>
      <p className="small-print">追加の施設検索：Wikimedia FoundationのAPIを使用。名称・別名・座標：Wikipedia contributors（<a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>）。表記を整え、検索条件に合わせて抽出しています。選択した施設の出典リンクから元の記事・履歴を確認できます。必要に応じて検索語をWikipediaにも送信します。</p>
      {result && <div className="coordinate-table"><span>現在の比較に使った位置</span>{(["venue", "hotel", "origin"] as Field[]).map(k => <p key={k}><strong>{fieldNames[k]}：{result[k].name}</strong><span>{result[k].lat.toFixed(6)}, {result[k].lng.toFixed(6)} · {result[k].sourceUrl ? <a href={result[k].sourceUrl} target="_blank" rel="noopener noreferrer">{result[k].source}（出典）</a> : result[k].source}</span></p>)}</div>}
    </div></details><span className="footer-wordmark">北海道の距離感</span></footer>
  </main>;
}
