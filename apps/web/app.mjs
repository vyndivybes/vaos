import { resolveRoute } from './router.mjs';
import { createCinematicController } from './login-cinematic.mjs';

const route = resolveRoute(window.location.pathname);
if (route.redirect && window.location.pathname !== route.redirect) {
  window.history.replaceState({}, '', route.redirect);
}

const cinematic = createCinematicController();
cinematic.start();

const form = document.querySelector('#login-form');
const emailInput = document.querySelector('#email');
const passwordInput = document.querySelector('#password');
const rememberInput = document.querySelector('#remember');
const status = document.querySelector('#login-status');
const submitButton = document.querySelector('#submit-button');
const helpButton = document.querySelector('#access-help');

try {
  const rememberedEmail = localStorage.getItem('vaos_email');
  if (rememberedEmail && emailInput && rememberInput) {
    emailInput.value = rememberedEmail;
    rememberInput.checked = true;
  }
} catch { /* Remembered email is an optional, non-security feature. */ }

async function checkExistingSession() {
  try {
    const response = await fetch('/api/session', { credentials: 'same-origin' });
    // Existing authorised sessions don't need to replay the login animation.
    if (response.ok) window.location.replace('/workspace.html');
  } catch { /* Login form remains available when session check fails. */ }
}

helpButton?.addEventListener('click', () => {
  status.dataset.state = '';
  status.textContent = 'Development access is restricted to authorised VAOS test identities.';
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  status.dataset.state = '';

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  submitButton.disabled = true;
  status.textContent = 'Authenticating…';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ email: emailInput.value.trim(), password: passwordInput.value }),
    });

    if (!response.ok) {
      status.dataset.state = 'error';
      status.textContent = 'Invalid authorised development credential.';
      return;
    }

    try {
      if (rememberInput.checked) localStorage.setItem('vaos_email', emailInput.value.trim());
      else localStorage.removeItem('vaos_email');
    } catch { /* Storage availability must not block a valid login. */ }

    status.dataset.state = 'success';
    status.textContent = 'Authorized. Opening VAOS…';
    try { await cinematic.complete(); }
    finally { window.location.replace('/workspace.html'); }
  } catch {
    // A network failure never triggers the success transition.
    status.dataset.state = 'error';
    status.textContent = 'Authentication service is unavailable.';
  } finally {
    submitButton.disabled = false;
  }
});

checkExistingSession();
