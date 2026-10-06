import { createDevelopmentRuntime } from '../../../platform/runtime/development-runtime.mjs';

let runtime;

export function getDevelopmentRuntime() {
  if (!runtime) runtime = createDevelopmentRuntime();
  return runtime;
}

export function resetDevelopmentRuntimeForTest() {
  runtime = undefined;
}
