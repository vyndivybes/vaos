const email = document.querySelector("#workspace-email");
const logout = document.querySelector("#logout-button");

async function requireSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin" });
    if (!response.ok) {
      window.location.replace("/login");
      return;
    }
    const session = await response.json();
    email.textContent = `Signed in as ${session.email}`;
  } catch {
    window.location.replace("/login");
  }
}

logout?.addEventListener("click", async () => {
  try {
    await fetch("/api/logout", { method: "POST", credentials: "same-origin" });
  } finally {
    window.location.replace("/login");
  }
});

requireSession();
