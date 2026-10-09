import { resolveRoute } from "./router.mjs";
import { resolveLoginReturn } from "./lib/login-return.mjs";

const route = resolveRoute(window.location.pathname);
if (route.redirect && window.location.pathname !== route.redirect) {
  window.history.replaceState({}, "", route.redirect);
}

const art = document.querySelector("[data-parallax-art]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer = window.matchMedia("(hover: none) and (pointer: coarse)");

if (art && !reducedMotion.matches && !coarsePointer.matches) {
  window.addEventListener("pointermove", (event) => {
    const x = event.clientX / window.innerWidth - 0.5;
    const y = event.clientY / window.innerHeight - 0.5;
    art.style.transform = `perspective(1100px) translate3d(${x * 16}px, ${y * 12}px, 0) rotateY(${x * 3.5}deg) rotateX(${-y * 2.4}deg)`;
  }, { passive: true });
}

const form = document.querySelector("#login-form");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const rememberInput = document.querySelector("#remember");
const status = document.querySelector("#login-status");
const submitButton = document.querySelector("#submit-button");
const helpButton = document.querySelector("#access-help");

const rememberedEmail = localStorage.getItem("vaos_email");
if (rememberedEmail && emailInput) {
  emailInput.value = rememberedEmail;
  rememberInput.checked = true;
}

async function checkExistingSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (response.ok) {
      const result=await response.json();
      window.location.replace(resolveLoginReturn(window.location.search,result.email));
    }
  } catch {}
}

helpButton?.addEventListener("click", () => {
  status.dataset.state = "";
  status.textContent = "Development access is restricted to authorised VAOS test identities.";
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  status.textContent = "";
  status.dataset.state = "";

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitButton.disabled = true;
  status.textContent = "Authenticating…";

  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });

    if (!response.ok) {
      status.dataset.state = "error";
      status.textContent = "Invalid authorised development credential.";
      return;
    }

    if (rememberInput.checked) localStorage.setItem("vaos_email", emailInput.value.trim());
    else localStorage.removeItem("vaos_email");

    status.dataset.state = "success";
    status.textContent = "Authenticated. Opening VAOS…";
    window.location.replace(resolveLoginReturn(window.location.search,emailInput.value));
  } catch {
    status.dataset.state = "error";
    status.textContent = "Authentication service is unavailable.";
  } finally {
    submitButton.disabled = false;
  }
});

checkExistingSession();
