import { resolveRoute } from "./router.mjs";

const route = resolveRoute(window.location.pathname);

if (route.redirect && window.location.pathname !== route.redirect) {
  window.history.replaceState({}, "", route.redirect);
}

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");

function initParallax() {
  if (reducedMotion.matches || coarsePointer.matches) return;

  const layers = [...document.querySelectorAll("[data-parallax]")];
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let frame = 0;

  const render = () => {
    currentX += (targetX - currentX) * 0.075;
    currentY += (targetY - currentY) * 0.075;

    for (const layer of layers) {
      const depth = Number(layer.dataset.depth || 0);
      const x = currentX * depth;
      const y = currentY * depth;
      layer.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }

    frame = window.requestAnimationFrame(render);
  };

  const updateTarget = (event) => {
    targetX = (event.clientX / window.innerWidth - 0.5) * 2;
    targetY = (event.clientY / window.innerHeight - 0.5) * 2;
  };

  window.addEventListener("pointermove", updateTarget, { passive: true });
  frame = window.requestAnimationFrame(render);

  window.addEventListener(
    "pagehide",
    () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", updateTarget);
    },
    { once: true },
  );
}

function initLoginForm() {
  const form = document.querySelector("#login-form");
  const status = document.querySelector("#login-status");

  form?.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    status.textContent =
      "Identity service is not connected yet. UI authentication gate is ready for platform integration.";
  });
}

initParallax();
initLoginForm();
