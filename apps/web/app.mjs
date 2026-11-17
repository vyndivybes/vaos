import { resolveRoute } from './router.mjs';
import { startSceneParallax } from './scene-parallax.mjs';

const route = resolveRoute(window.location.pathname);
if (route.redirect && window.location.pathname !== route.redirect) {
  window.history.replaceState({}, '', route.redirect);
}

startSceneParallax(document.querySelector('#cinematic-scene'));

const form = document.querySelector('#login-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const rememberInput = document.querySelector('#remember');
const status = document.querySelector('#login-status');
const submitButton = document.querySelector('#submit-button');
const submitLabel = document.querySelector('#submit-label');
const helpButton = document.querySelector('#access-help');
const passwordToggle = document.querySelector('#password-toggle');

if (passwordToggle) {
  passwordToggle.hidden = false;
  passwordToggle.setAttribute('aria-label', 'Show password');
  passwordToggle.addEventListener('click', () => {
    const show = passwordInput.type === 'password';
    passwordInput.type = show ? 'text' : 'password';
    passwordToggle.textContent = show ? 'Hide' : 'Show';
    passwordToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
}

try {
  const rememberedEmail = localStorage.getItem('vaos_email');
  if (rememberedEmail && emailInput && rememberInput) {
    emailInput.value = rememberedEmail;
    rememberInput.checked = true;
  }
} catch { /* Remembered email is an optional, non-security feature. */ }

async function checkExistingSession() {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) window.location.replace('/workspace.html');
  } catch { /* Login form remains available when session check fails. */ }
}

helpButton?.addEventListener('click', () => {
  status.dataset.state = '';
  status.textContent = 'Use your assigned VYNDI credentials. Contact your workspace administrator if you need access.';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitButton.disabled) return;
  status.textContent = '';
  status.dataset.state = '';

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitButton.disabled = true;
  submitLabel.textContent = 'Signing in…';
  let signedIn = false;

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });

    if (!response.ok) {
      status.dataset.state = 'error';
      if (response.status === 401) status.textContent = 'The email or password is incorrect.';
      else if (response.status === 429) status.textContent = 'Too many attempts. Wait a moment before trying again.';
      else status.textContent = 'Sign-in is temporarily unavailable. Please try again.';
      return;
    }

    try {
      if (rememberInput.checked) localStorage.setItem('vaos_email', emailInput.value.trim());
      else localStorage.removeItem('vaos_email');
    } catch { /* Storage availability must not block a valid login. */ }

    status.dataset.state = 'success';
    status.textContent = 'Opening your workspace…';
    submitLabel.textContent = 'Opening workspace…';
    signedIn = true;
    window.location.replace('/workspace.html');
  } catch {
    status.dataset.state = 'error';
    status.textContent = 'Sign-in is temporarily unavailable. Please try again.';
  } finally {
    if (!signedIn) {
      submitButton.disabled = false;
      submitLabel.textContent = 'Sign in to workspace';
    }
  }
});

checkExistingSession();
