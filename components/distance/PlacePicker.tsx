"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Crosshair, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { coordinatePlace, type Place } from "@/lib/geo";
import { matchesKeywords } from "@/lib/search-text";

export default function PlacePicker({ id, label, letter, value, onChange, presets, region, placeholder, onPick, picking }: {
  id: string; label: string; letter: string; value: Place | null; onChange: (p: Place | null) => void;
  presets: Place[]; region: "hokkaido" | "japan"; placeholder: string; onPick: () => void; picking: boolean;
}) {
  const [query, setQuery] = useState(value?.name || "");
  const [remote, setRemote] = useState<Place[]>([]);
  const [searched, setSearched] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const active = useRef<AbortController | null>(null);
  const revision = useRef(0);
  useEffect(() => { if (value) { setQuery(value.name); setError(""); } }, [value]);
  useEffect(() => () => active.current?.abort(), []);
  const local = presets.filter(p => !query || query === value?.name || matchesKeywords(`${p.name} ${p.detail}`, query));
  const items = [...local, ...remote.filter(p => !local.some(l => l.id === p.id))];
  function select(p: Place | null) { if (!p) return; revision.current++; active.current?.abort(); setLoading(false); onChange(p); setQuery(p.name); setError(""); setOpen(false); }
  async function search() {
    if (query.trim().length < 2) { setError("2文字以上の施設名・住所を入力してください。"); return; }
    const coordinate = coordinatePlace(query, region);
    if (coordinate) { select(coordinate); return; }
    input.current?.focus({ preventScroll: true });
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    const current = ++revision.current;
    setLoading(true); setError(""); setSearched(false);
    try {
      const response = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}&region=${region}`, { signal: controller.signal });
      const data = await response.json() as { places?: Place[]; error?: string };
      if (!response.ok) throw new Error(data.error || "検索できませんでした。");
      if (!Array.isArray(data.places)) throw new Error("検索結果を取得できませんでした。もう一度検索してください。");
      if (current !== revision.current) return;
      setRemote(data.places); setSearched(true); input.current?.focus({ preventScroll: true }); setOpen(true);
      if (!data.places.length && !local.length) setError("見つかりませんでした。市区町村を含む住所か、地図で位置を指定してください。");
    } catch (err) { if (current === revision.current && !controller.signal.aborted) setError(err instanceof Error ? err.message : "検索できませんでした。"); }
    finally { if (current === revision.current) setLoading(false); }
  }
  return <div className={`place-field field-${letter.toLowerCase()}`}>
    <label htmlFor={id}><span className="letter">{letter}</span>{label}</label>
    <Combobox items={items} value={value} onValueChange={select} inputValue={query} filter={null}
      itemToStringLabel={(p: Place) => p.name} itemToStringValue={(p: Place) => p.id} isItemEqualToValue={(a: Place, b: Place) => a.id === b.id}
      open={open} onOpenChange={setOpen}
      onInputValueChange={(text, details) => { if (details.reason === "input-change") { revision.current++; active.current?.abort(); setLoading(false); setQuery(text); setRemote([]); setSearched(false); setError(""); onChange(null); } }}>
      <div className="search-row">
        <ComboboxInput ref={input} id={id} className="place-input" placeholder={placeholder} showTrigger={true} autoComplete="off" aria-describedby={`${id}-help`}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing && (!open || items.length === 0)) { e.preventDefault(); void search(); } }} />
        <Button type="button" variant="outline" className="search-button" onMouseDown={e => e.preventDefault()} onClick={search} disabled={loading} aria-label={`${label}を検索`}>
          {loading ? <LoaderCircle className="spin" /> : <Search />}
        </Button>
      </div>
      <ComboboxContent className="place-popup"><ComboboxEmpty>{loading ? "検索中…" : searched ? "候補がありません" : "検索ボタンで場所を探す"}</ComboboxEmpty><ComboboxList>{(p: Place) => <ComboboxItem key={p.id} value={p} className="place-option"><span><strong>{p.name}</strong><small>{p.detail}</small></span></ComboboxItem>}</ComboboxList></ComboboxContent>
    </Combobox>
    <div id={`${id}-help`} className="field-help" aria-live="polite">
      {loading ? <span>候補を探しています…（複数語の検索は少し時間がかかります）</span> : error ? <span className="field-error">{error}</span> : value ? <span className="selected-place"><Check size={13} />{value.detail}</span> : <span>空白で区切って検索できます</span>}
    </div>
    {value?.source === "Wikipedia" && value.sourceUrl && <a className="field-help" href={value.sourceUrl} target="_blank" rel="noopener noreferrer">Wikipediaの出典を確認</a>}
    <button className={`map-pick-link ${picking ? "active" : ""}`} type="button" onClick={onPick}><Crosshair size={14} />{picking ? "地図で指定をやめる" : "地図で指定"}</button>
  </div>;
}
