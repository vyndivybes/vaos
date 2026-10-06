const LEGACY_PREFIXES = ["/house", "/range"];

function normalise(pathname) {
  if (!pathname || pathname === "/") return "/";
  const withSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export function resolveRoute(pathname) {
  const path = normalise(pathname);

  if (LEGACY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return { name: "login", redirect: "/login", reason: "legacy-route-retired" };
  }

  if (path === "/") {
    return { name: "login", redirect: "/login", reason: "root-entry" };
  }

  if (path === "/login") {
    return { name: "login", redirect: null, reason: null };
  }

  return { name: "login", redirect: "/login", reason: "unknown-route" };
}

export { LEGACY_PREFIXES };
