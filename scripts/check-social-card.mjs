import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const base = "https://hokkaido-distance.chocozukushi.chatgpt.site";
const get = path => execFileSync("curl", ["--fail", "--silent", "--show-error", "--max-time", "30", "-A", "Twitterbot/1.0", base + path], { maxBuffer: 3 * 1024 * 1024 });
for (const path of ["/", "/share"]) {
  const html = get(path).toString("utf8");
  const head = html.split("</head>")[0];
  const tags = [...head.matchAll(/<meta\s+[^>]*>/g)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [key, value.replaceAll("&amp;", "&")])));
  const meta = name => tags.filter(t => (t.name || t.property) === name).map(t => t.content);
  assert.deepEqual(meta("twitter:card"), ["summary_large_image"]);
  assert.deepEqual(meta("og:url").map(value => new URL(value).href), [base + path]);
  assert.deepEqual(meta("og:image"), [base + "/og.png?v=20260919-2"]);
  assert.deepEqual(meta("twitter:image"), meta("og:image"));
  assert(meta("og:title")[0].includes("北海道の距離感"));
  assert(meta("twitter:description")[0].includes("直線距離"));
  assert(!meta("robots").some(v => /noindex|noimageindex|none/.test(v)));
  assert(html.includes("会場名・住所を入力"), "Application is served without redirect/login");
  console.log("PASS: initial HTML head includes card metadata, public app:", path);
}
const image = get("/og.png?v=20260919-2");
assert.equal(image.subarray(1, 4).toString(), "PNG");
assert(image.length < 5 * 1024 * 1024);
assert(image.readUInt32BE(16) >= 600);
assert(image.readUInt32BE(20) >= 315);
assert.match(get("/robots.txt").toString(), /User-agent: Twitterbot\s+Allow: \//);
console.log("PASS: public image is a large PNG; robots explicitly allows Twitterbot");
console.log("This tests public HTTP delivery, not X's own fetch or card rendering.");
