const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const ts = require('typescript');
const wikiFixtures = require('./fixtures/wikipedia-places.json');
function loader(fetchFn, live = false) {
  const modules = new Map();
  let clock = Date.now();
  function load(file) {
    file = path.resolve(file);
    if (modules.has(file)) return modules.get(file);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    const module = { exports: {} }; modules.set(file, module.exports);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, URL, URLSearchParams, Request, Response, AbortSignal, setTimeout,
      Date: live ? Date : { now: () => clock += 2000, parse: Date.parse }, fetch: fetchFn,
      require: name => {
        const target = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
        return load(target.endsWith('.json') ? target : target + '.ts');
      },
    }, { filename: file });
    return module.exports;
  }
  return load;
}
const request = (q, region = 'hokkaido') => new Request('https://local/api/places?' + new URLSearchParams({ q, region }));
const gym = { geometry: { coordinates: [141.0797939, 42.3922181] }, properties: { osm_type: 'W', osm_id: 384498120, osm_key: 'leisure', osm_value: 'sports_centre', name: '登別市総合体育館', city: '登別市', state: '北海道', countrycode: 'JP' } };
const pool = { ...gym, properties: { ...gym.properties, osm_type: 'N', osm_id: 13754836366, name: '登別市民プール' } };
const oldOmo = { geometry: { coordinates: [142.3641664, 43.7701448] }, properties: { osm_type: 'W', osm_id: 141805631, osm_key: 'tourism', osm_value: 'hotel', name: '旭川グランドホテル', city: '旭川市', state: '北海道', countrycode: 'JP' } };
(async () => {
  const calls = [];
  const load = loader(async url => {
    const u = new URL(url); calls.push(u);
    if (u.hostname === 'ja.wikipedia.org') {
      const q = u.searchParams.get('gsrsearch');
      return Response.json(wikiFixtures[q] || (q === 'わくわくホリデーホール' ? wikiFixtures['カナモトホール'] : q === 'ルネッサンスサッポロホテル' ? wikiFixtures['プレミアホテル TSUBAKI'] : { batchcomplete: true }));
    }
    if (u.searchParams.get('q') === '旭川 ホテル') return Response.json({ features: [oldOmo] });
    if (u.searchParams.get('q') === '登別' && u.searchParams.getAll('osm_tag').includes('leisure:sports_centre')) return Response.json({ features: [pool, gym, gym] });
    if (u.searchParams.get('q') === '登別') return Response.json({ features: [pool, gym] });
    return Response.json(u.hostname === 'msearch.gsi.go.jp' ? [] : { features: [] });
  });
  const { GET } = load('app/api/places/route.ts');
  for (const q of ['エスコン', 'えすこんふぃーるど', 'ＥＳ ＣＯＮ', 'ESCON FIELD HOKKAIDO', '札幌ドーム', 'きたえーる', '真駒内アイスアリーナ', 'さっぽろぐらんどほてる']) {
    const response = await GET(request(q)); assert.equal(response.status, 200, q);
    assert.equal((await response.json()).places.length, 1, q);
  }
  assert.equal(calls.length, 0, 'Known aliases work offline');
  for (const q of ['OMO7', 'omo7', 'ＯＭＯ７', 'OMO7旭川', 'OMO7 旭川', 'OMO7旭川 by 星野リゾート', 'OMO7 Asahikawa', 'おも7旭川', 'オモセブン旭川', '旭川グランドホテル']) {
    const response = await GET(request(q)); assert.equal(response.status, 200, q);
    const { places: results } = await response.json();
    assert.equal(results.length, 1, q);
    assert.equal(results[0].name, 'OMO7旭川 by 星野リゾート', q);
    assert.equal(results[0].lat, 43.770468, 'Official location');
    assert.equal(results[0].lng, 142.364687, 'Official location');
    assert.equal(results[0].source, '施設公式サイト');
  }
  assert.equal(calls.length, 0, 'OMO aliases work without external provider calls');
  const corrected = await (await GET(request('旭川 ホテル'))).json();
  assert.equal(corrected.places.filter(p => p.id === 'osm-W-141805631').length, 1, 'Deduplicate older provider record');
  assert.equal(corrected.places[0].name, 'OMO7旭川 by 星野リゾート');
  const places = load('lib/places.ts');
  assert.equal(places.matchingPresets('OMO7 大阪', 'hokkaido').length, 0, 'Do not confuse another city');
  assert(places.matchingPresets('旭川 星野', 'hokkaido').some(p => p.id === 'osm-W-141805631'));
  assert.equal(places.hotels.some(p => /レースイ/.test(p.name)), false);
  assert.equal(places.allPresets.some(p => /レースイ/.test(p.name)), false);
  assert.equal(places.matchingPresets('東京駅', 'hokkaido').length, 0);
  const { designatedStations, originStations } = load('lib/origin-stations.ts');
  const { inJapan } = load('lib/geo.ts');
  assert.equal(designatedStations.length, 20);
  assert.equal(new Set(designatedStations.map(p => p.city)).size, 20);
  assert.equal(originStations.length, 21);
  assert(originStations.every(p => inJapan(p.lat, p.lng)));
  for (const q of ['登別　体育館', '体育館 登別', '登別 総合 体育館', '総合 体育館 登別', '登別 総合']) {
    const response = await GET(request(q)); assert.equal(response.status, 200);
    const { places } = await response.json(); assert.equal(places.length, 1, q);
    assert.equal(places[0].name, '登別市総合体育館', q);
  }
  const { places: compact } = await (await GET(request('登別体育館'))).json();
  assert.equal(compact.length, 0, 'No cache collision with whitespace-separated query');
  assert.equal((await GET(request('a'))).status, 400);
  const down = loader(async () => { throw new Error('offline'); });
  assert.equal((await down('app/api/places/route.ts').GET(request('未登録の施設xyz'))).status, 502);
  assert.equal((await down('app/api/places/route.ts').GET(request('エスコン'))).status, 200);
  const { matchesKeywords } = load('lib/search-text.ts');
  assert(matchesKeywords('登別市総合体育館 北海道', '体育館　登別'));
  assert(!matchesKeywords('登別市民プール 北海道 スポーツ施設', '登別 体育館'));
  const wiki = load('lib/wikipedia-places.ts');
  for (const [q, id] of [['カナモトホール', 1103977], ['北ガスアリーナ', 2868844], ['プレミアホテル TSUBAKI', 2779459], ['グランドメルキュール札幌', 3536051]]) {
    const found = wiki.wikipediaPlaces(wikiFixtures[q], q, 'hokkaido');
    assert.equal(found.length, 1, 'Exclude article-body mentions: ' + q);
    assert.equal(found[0].id, 'wikipedia-ja-' + id);
    assert.equal(found[0].sourceUrl, 'https://ja.wikipedia.org/?curid=' + id);
  }
  for (const [q, id] of [['わくわくホリデーホール', 1103977], ['ルネッサンスサッポロホテル', 2779459]]) {
    const response = await GET(request(q)); assert.equal(response.status, 200);
    const data = await response.json(); assert.equal(data.places.length, 1, q);
    assert.equal(data.places[0].id, 'wikipedia-ja-' + id);
    assert.equal(data.places[0].source, 'Wikipedia');
    assert(!places.allPresets.some(p => p.id === data.places[0].id), 'Not a per-facility preset');
  }
  const hall = wikiFixtures['カナモトホール'].query.pages.find(p => p.pageid === 1103977);
  const invalid = [null, { ...hall, pageprops: { disambiguation: '' } }, { ...hall, coordinates: [{ lat: 35, lon: 135, primary: true, globe: 'earth' }] }, { ...hall, coordinates: [{ lat: 43, lon: 141, primary: true, globe: 'moon' }] }, { ...hall, coordinates: [] }, { ...hall, coordinates: [{ lat: null, lon: 141, primary: true, globe: 'earth' }] }, { ...hall, title: '無関係な記事', redirects: [] }, { ...hall, coordinates: [...hall.coordinates, ...hall.coordinates] }];
  assert.equal(wiki.wikipediaPlaces({ batchcomplete: true, query: { pages: invalid } }, 'カナモトホール', 'hokkaido').length, 0);
  assert.throws(() => wiki.wikipediaPlaces({ error: { code: 'maxlag' } }, 'カナモトホール', 'hokkaido'));
  const dupe = loader(async url => {
    if (new URL(url).hostname === 'ja.wikipedia.org') return Response.json(wikiFixtures['カナモトホール']);
    return Response.json({ features: [{ ...gym, geometry: { coordinates: [141.35555556, 43.06222222] }, properties: { ...gym.properties, osm_id: 123, name: '札幌市民ホール' } }] });
  });
  const merged = await (await dupe('app/api/places/route.ts').GET(request('わくわくホリデーホール'))).json();
  assert.equal(merged.places.length, 1, 'Merge nearby same-name results across providers');
  assert.equal(merged.places[0].source, 'Wikipedia', 'Prefer the alias match over fuzzy results');
  const wikiOnly = loader(async url => {
    if (new URL(url).hostname === 'ja.wikipedia.org') return Response.json(wikiFixtures['カナモトホール']);
    throw new Error('Other provider offline');
  });
  assert.equal((await wikiOnly('app/api/places/route.ts').GET(request('わくわくホリデーホール'))).status, 200);
  let wikiCalls = 0;
  const throttled = loader(async url => {
    if (new URL(url).hostname === 'ja.wikipedia.org') { wikiCalls++; return new Response('', { status: 429, headers: { 'Retry-After': '120' } }); }
    return Response.json(new URL(url).hostname === 'msearch.gsi.go.jp' ? [] : { features: [] });
  });
  await throttled('app/api/places/route.ts').GET(request('未知の施設A'));
  await throttled('app/api/places/route.ts').GET(request('未知の施設B'));
  assert.equal(wikiCalls, 1, 'Respect Wikimedia Retry-After');
  console.log('PASS: aliases; removed preset; 20 cities + Tokyo; multiword AND, reversal, 3 words; deduplication; cache boundaries; validation; provider failure');
  console.log('PASS: Wikipedia real-response fixtures; automatic aliases; region/coordinate/ambiguity filters; cross-provider dedup; independent fallback; rate-limit backoff');
  if (process.env.LIVE_PLACE_SEARCH === '1') {
    const run = promisify(execFile);
    const live = loader(async url => {
      const u = new URL(url); console.log('LIVE provider:', u.hostname, u.searchParams.get('q') || u.searchParams.get('gsrsearch'), u.searchParams.getAll('osm_tag').join(','));
      const { stdout } = await run('curl', ['-sS', '--fail', '--max-time', '20', '-H', 'Accept: application/json', '-H', 'Accept-Language: ja', '-H', 'User-Agent: HokkaidoDistance/1.1 (https://hokkaido-distance.chocozukushi.chatgpt.site)', url], { maxBuffer: 2 * 1024 * 1024 });
      return new Response(stdout, { headers: { 'Content-Type': 'application/json' } });
    }, true);
    const get = live('app/api/places/route.ts').GET;
    const examples = process.env.LIVE_WIKIPEDIA_ONLY === '1' ? [] : ['登別　体育館', '体育館 登別', '登別 総合 体育館'];
    for (const q of examples) {
      const response = await get(request(q)); const data = await response.json();
      assert.equal(response.status, 200);
      assert(data.places.some(p => p.id === 'osm-W-384498120'), q);
      assert(!data.places.some(p => p.name === '登別市民プール'));
      console.log('LIVE PASS:', q, data.places.map(p => p.name).join(', '));
    }
    for (const [q, id] of [['わくわくホリデーホール', 'wikipedia-ja-1103977'], ['ルネッサンスサッポロホテル', 'wikipedia-ja-2779459']]) {
      const response = await get(request(q)); const data = await response.json();
      assert.equal(response.status, 200); assert(data.places.some(p => p.id === id), q);
      console.log('LIVE WIKIPEDIA PASS:', q, data.places.map(p => p.name).join(', '));
    }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
