const API_URL = "";

const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.href = "/login/";
} else if (user.role === "admin") {
  window.location.href = "/admin/";
}

const navAdmin = document.getElementById("navAdmin");
if (navAdmin && user?.role !== "admin") navAdmin.remove();

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login/";
}
window.logout = logout;

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${token}` };
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function statusLabel(status) {
  if (status === "verifying") return "Verificando";
  if (status === "in_progress") return "Em andamento";
  if (status === "resolved") return "Resolvida";
  if (status === "rejected") return "Rejeitada";
  return "Pendente";
}

function setWelcome(userData) {
  const welcomeLine = document.getElementById("welcomeLine");
  const welcomeTitle = document.getElementById("welcomeTitle");
  const name = userData?.name?.trim();

  if (name) {
    welcomeLine.textContent = `Olá, ${name}!`;
    welcomeTitle.textContent = "Bem-vindo ao SCDRI";
    return;
  }

  welcomeLine.textContent = "Olá!";
  welcomeTitle.textContent = "Bem-vindo ao SCDRI";
}

function updateStats(reports) {
  const total = reports.length;
  const pending = reports.filter((r) => r.status === "open" || r.status === "verifying" || r.status === "in_progress").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const rejected = reports.filter((r) => r.status === "rejected").length;

  document.getElementById("statTotal").textContent = String(total);
  document.getElementById("statPending").textContent = String(pending);
  document.getElementById("statResolved").textContent = String(resolved);
  document.getElementById("statRejected").textContent = String(rejected);
  document.getElementById("lastUpdated").textContent = `Atualizado em ${new Date().toLocaleTimeString()}`;
}

async function loadNavAvatar() {
  const img = document.getElementById("navAvatar");
  const a = img?.closest(".nav-avatar");
  if (!img || !a) return;

  a.classList.add("is-placeholder");
  img.removeAttribute("src");

  try {
    const res = await fetch("/users/me", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) return;
    const me = await res.json();

    if (me.avatar) {
      const src = me.avatar.startsWith("/uploads/")
        ? me.avatar
        : me.avatar.startsWith("uploads/")
          ? "/" + me.avatar
          : "/uploads/" + me.avatar;

      img.src = src + `?v=${Date.now()}`;
      img.onload = () => a.classList.remove("is-placeholder");
      img.onerror = () => {
        a.classList.add("is-placeholder");
        img.removeAttribute("src");
      };
    }
  } catch {
  }
}

async function carregarMinhasDenuncias() {
  const grid = document.getElementById("reportsGrid");
  const res = await fetch(`${API_URL}/reports/me`, { headers: authHeaders() });

  if (res.status === 401 || res.status === 403) {
    logout();
    return;
  }

  const data = await res.json().catch(() => []);

  if (!res.ok) {
    alert(data.error || "Erro ao carregar denúncias");
    return;
  }

  const reports = Array.isArray(data) ? data : [];
  updateStats(reports);
  grid.innerHTML = "";

  if (reports.length === 0) {
    grid.innerHTML = '<div class="empty-state">Nenhuma denúncia enviada ainda. Clique em "Nova Denúncia" para começar.</div>';
    return;
  }

  reports.forEach((r) => {
    const card = document.createElement("article");
    card.className = "report-card";
    card.innerHTML = `
      <div class="report-card-header">
        <h3>${esc(r.title || "(sem título)")}</h3>
        <span class="status ${esc(r.status || "pending")}">${statusLabel(r.status)}</span>
      </div>
      <p class="muted small report-location">${esc(r.location || "")}</p>
      ${r.image
        ? `<img src="${esc(r.image)}" class="report-img" alt="Imagem da denúncia">`
        : `<div class="report-img report-img-placeholder">Sem imagem</div>`
      }
      <p class="report-desc">${esc(r.description || "")}</p>
      ${r.status === "rejected" ? `<p class="muted small"><strong>Motivo:</strong> ${esc(r.reject_reason || "(sem motivo)")}</p>` : ""}
      <p class="muted small report-date">${r.created_at ? new Date(r.created_at).toLocaleString() : ""}</p>
    `;
    grid.appendChild(card);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setWelcome(user);
  loadNavAvatar();
  carregarMinhasDenuncias();
});


