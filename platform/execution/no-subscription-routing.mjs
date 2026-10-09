// A constrained route profile for VAOS installations that prohibit new SaaS subscriptions.
// This is a provider allow-list, NOT a proof that a provider has been commissioned or that
// its external free-tier usage will remain within quota. VAOS qualification still applies.
const ALLOWED_BY_CAPABILITY = Object.freeze({
  'workflow.orchestrate': Object.freeze(['activepieces']),
  'integration.saas': Object.freeze([]),
  'code.execute': Object.freeze(['windmill']),
  'document.sign': Object.freeze(['documenso']),
  'document.extract': Object.freeze([]),
  'data.replicate': Object.freeze([]),
});

export function createNoSubscriptionRoutingPolicy() {
  return Object.freeze({
    apply(capability, constraints = {}) {
      const configured = ALLOWED_BY_CAPABILITY[capability];
      if (!configured) return { ...constraints };
      const allowed = Array.isArray(constraints?.allowedProviderIds)
        ? configured.filter(id => constraints.allowedProviderIds.includes(id))
        : [...configured];
      const denied = Array.isArray(constraints?.deniedProviderIds) ? constraints.deniedProviderIds : [];
      const filtered = allowed.filter(id => !denied.includes(id));
      // Never trust arbitrary caller-preferred providers to widen the allow-list.
      const preferred = Array.isArray(constraints?.preferredProviderIds)
        ? [...constraints.preferredProviderIds.filter(id => filtered.includes(id)), ...filtered.filter(id => !constraints.preferredProviderIds.includes(id))]
        : filtered;
      return {
        ...(constraints && typeof constraints === 'object' && !Array.isArray(constraints) ? constraints : {}),
        allowedProviderIds: filtered,
        preferredProviderIds: preferred,
      };
    },
  });
}
