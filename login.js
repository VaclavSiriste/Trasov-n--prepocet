const params = new URLSearchParams(window.location.search);
const nextPath = (() => {
  const n = params.get("next");
  return n && n.startsWith("/") ? n : "/";
})();

const formEmail = document.getElementById("form-email");
const formCode = document.getElementById("form-code");
const emailInput = document.getElementById("email");
const codeInput = document.getElementById("code");
const errorEmail = document.getElementById("error-email");
const errorCode = document.getElementById("error-code");
const codeInfo = document.getElementById("code-info");
const codeEmail = document.getElementById("code-email");
const devCode = document.getElementById("dev-code");
const domainsHint = document.getElementById("domains-hint");
const btnSend = document.getElementById("btn-send");
const btnVerify = document.getElementById("btn-verify");

let challengeId = "";
let currentEmail = "";

async function readJsonSafe(res, endpointLabel) {
  const raw = await res.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    const snippet = raw.replace(/\s+/g, " ").slice(0, 120);
    throw new Error(`Server pro ${endpointLabel} nevrátil JSON (status ${res.status}). Odpověď začíná: ${snippet || "prázdná"}`);
  }
}

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = !msg;
}

if (params.get("error")) {
  showError(errorEmail, params.get("error"));
}

fetch("/api/auth/session", { credentials: "same-origin" })
  .then(async (r) => (r.ok ? readJsonSafe(r, "session") : null))
  .then((data) => {
    if (data?.ok) window.location.href = nextPath;
  })
  .catch(() => {});

fetch("/api/auth/env-status", { credentials: "same-origin" })
  .then((r) => readJsonSafe(r, "env-status"))
  .then((data) => {
    if (data.allowedDomains) domainsHint.textContent = `Povolené domény: ${data.allowedDomains}`;
    if (data.hint) showError(errorEmail, data.hint);
  })
  .catch(() => {});

formEmail.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(errorEmail, "");
  btnSend.disabled = true;
  try {
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ email: emailInput.value, next: nextPath }),
    });
    const data = await readJsonSafe(res, "request-code");
    if (!res.ok) throw new Error(data.error || "Odeslání se nepodařilo.");

    currentEmail = emailInput.value.trim().toLowerCase();
    challengeId = data.challengeId;
    codeInfo.textContent = data.message || "Na e-mail jsme odeslali kód.";
    codeEmail.textContent = `E-mail: ${currentEmail}`;
    if (data.devCode) {
      devCode.hidden = false;
      devCode.innerHTML = `Vývojový režim (bez SMTP): kód <strong>${data.devCode}</strong>`;
    } else {
      devCode.hidden = true;
    }

    formEmail.hidden = true;
    formCode.hidden = false;
    codeInput.focus();
  } catch (err) {
    showError(errorEmail, err.message);
  } finally {
    btnSend.disabled = false;
  }
});

formCode.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(errorCode, "");
  btnVerify.disabled = true;
  try {
    const res = await fetch("/api/auth/verify-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email: currentEmail,
        code: codeInput.value,
        challengeId,
        next: nextPath,
      }),
    });
    const data = await readJsonSafe(res, "verify-code");
    if (!res.ok) throw new Error(data.error || "Ověření se nepodařilo.");
    window.location.href = data.next || nextPath;
  } catch (err) {
    showError(errorCode, err.message);
  } finally {
    btnVerify.disabled = false;
  }
});

document.getElementById("btn-back").addEventListener("click", () => {
  formCode.hidden = true;
  formEmail.hidden = false;
  codeInput.value = "";
  showError(errorCode, "");
  devCode.hidden = true;
});

codeInput.addEventListener("input", () => {
  codeInput.value = codeInput.value.replace(/\D/g, "").slice(0, 6);
});
