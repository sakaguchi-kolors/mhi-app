export function facetOptions(arr: string[], sel: string): string[] {
  const s = [...new Set(arr)].sort();
  return sel !== 'all' && !s.includes(sel) ? [...s, sel] : s;
}
