// Cloudflare-only entrypoint. Node.js unit tests continue to import cloudflare-worker.mjs.
// Durable Object class exists in the same Worker bundle but never exposes HTTP endpoints.
export { default } from './cloudflare-worker.mjs';
export { WindmillAdmissionCoordinator } from '../../platform/execution/windmill-admission-object.mjs';
