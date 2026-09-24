export function normalizePlaceName(value: string): string {
  return value.normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・･ー−－-]/g, "");
}

export function searchTokens(query: string): string[] {
  return [...new Set(query.normalize("NFKC").trim().split(/\s+/).filter(Boolean))];
}

// AND search: word order does not matter, and a word may occur in the address.
export function matchesKeywords(text: string, query: string): boolean {
  const normalized = normalizePlaceName(text);
  const tokens = searchTokens(query).map(normalizePlaceName).filter(Boolean);
  return tokens.length > 0 && tokens.every(token => normalized.includes(token));
}

export function keywordScore(name: string, query: string): number {
  const n = normalizePlaceName(name), q = normalizePlaceName(query);
  if (n === q) return 100;
  return (n.includes(q) ? 40 : 0) + searchTokens(query).filter(t => n.includes(normalizePlaceName(t))).length * 10;
}
