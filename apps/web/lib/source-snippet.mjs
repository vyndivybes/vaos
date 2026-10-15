// Preserve the selected match in bounded, display-only source evidence.
export function sourceSnippet(text, index, limit) {
 const start=Math.max(0,index-Math.floor(limit/3));
 return text.slice(start,start+limit);
}
