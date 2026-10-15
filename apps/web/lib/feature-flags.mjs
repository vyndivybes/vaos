// Bounded non-secret configuration bundle for Cloudflare Workers.
// Legacy bindings take precedence during the staged migration.
const NAMES = new Set([
  'VAOS_FEDERATED_KNOWLEDGE_CONTROL',
  'VAOS_LANGGRAPH_CONTROL',
  'VAOS_PRODUCTION_OBSERVER_CONTROL',
  'VAOS_SLACK_AGENT_CONTROL',
]);

export function featureControl(env, name) {
  if (!NAMES.has(name)) return undefined;
  if (typeof env?.[name] === 'string') return env[name];
  const raw = env?.VAOS_FEATURE_FLAGS;
  if (typeof raw !== 'string' || raw.length > 4096) return undefined;
  try {
    const flags = JSON.parse(raw);
    if (flags === null || typeof flags !== 'object' || Array.isArray(flags)) return undefined;
    const value = Object.hasOwn(flags, name) ? flags[name] : undefined;
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}
