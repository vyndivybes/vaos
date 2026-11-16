import { SPATIAL_DATASETS, GRAPH_NODES } from '../spatial-command-model.mjs';

const KEY = 'vaos:last-spatial-view:v1';
const TTL = 30 * 60 * 1000;
const PAGE = '/spatial-command.html';
const datasets = new Map(SPATIAL_DATASETS.map(({ id, label }) => [id, label]));
const nodes = new Map(GRAPH_NODES.map(({ id, label }) => [id, label]));

function normalize(tab, selection) {
  if (tab === 'overview' && selection == null) return { tab, selection: null, label: 'Spatial Command overview', href: PAGE + '#overview' };
  if (tab === 'sheets' && datasets.has(selection)) return { tab, selection, label: datasets.get(selection) + ' sheet', href: PAGE + '#sheets=' + encodeURIComponent(selection) };
  if (tab === 'lineage' && nodes.has(selection)) return { tab, selection, label: nodes.get(selection) + ' in 3D Knowledge', href: PAGE + '#lineage=' + encodeURIComponent(selection) };
  return null;
}

export function createSpatialViewMemory({ storage, now = Date.now } = {}) {
  function clear() { try { storage?.removeItem(KEY); } catch { /* Storage is optional. */ } }
  function save(tab, selection = null) {
    const view = normalize(tab, selection);
    if (!view) return false;
    try {
      if (!storage) return false;
      storage.setItem(KEY, JSON.stringify({ tab, selection, at: now() }));
      return true;
    } catch { return false; }
  }
  function recall() {
    try {
      const raw = storage?.getItem(KEY);
      if (!raw || raw.length > 300) return null;
      const { tab, selection, at } = JSON.parse(raw) || {};
      const age = now() - at;
      const view = normalize(tab, selection);
      if (!Number.isSafeInteger(at) || age < 0 || age >= TTL || !view) { clear(); return null; }
      return view;
    } catch { clear(); return null; }
  }
  return { save, recall, clear };
}

export function currentSpatialMemory() {
  let storage;
  try { storage = globalThis.sessionStorage; } catch { /* Storage is optional. */ }
  return createSpatialViewMemory({ storage });
}

export function spatialViewFromHash(hash) {
  if (typeof hash !== 'string' || hash.length > 120) return null;
  const [tab, selection] = hash.replace(/^#/, '').split('=');
  try { return normalize(tab, selection === undefined ? null : decodeURIComponent(selection)); }
  catch { return null; }
}

export function isSpatialRecall(value) {
  return typeof value === 'string' && /^(?:where (?:did i leave off|was i)|what (?:was i (?:looking at|viewing)|(?:is|was) my last (?:view|spatial view|spatial command view|sheet|graph node))|show (?:me )?(?:my |the )?last (?:view|spatial view|spatial command view|sheet|graph node))[?.! ]*$/i.test(value.trim());
}
