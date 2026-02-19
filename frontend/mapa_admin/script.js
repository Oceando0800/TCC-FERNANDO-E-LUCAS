const API_URL = "";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user || user.role !== "admin") {
  window.location.href = "/inicio/";
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login/";
}
window.logout = logout;

function resolveAvatarSrc(avatar) {
  if (!avatar) return "";
  if (avatar.startsWith("http")) return avatar;
  if (avatar.startsWith("/uploads/")) return avatar;
  if (avatar.startsWith("uploads/")) return "/" + avatar;
  return "/uploads/" + avatar;
}

function statusLabel(status) {
  if (status === "verifying") return "Verificando";
  if (status === "in_progress") return "Em progresso";
  if (status === "resolved") return "Limpo";
  if (status === "rejected") return "Rejeitada";
  return "Pendente";
}

function urgencyLabel(urgency, status) {
  if (status === "open") return "Nulo";
  if (urgency === "high") return "Alta";
  if (urgency === "medium") return "Média";
  return "Baixa";
}

function statusClass(status) {
  if (status === "verifying") return "verifying";
  if (status === "in_progress") return "in_progress";
  if (status === "resolved") return "resolved";
  if (status === "rejected") return "rejected";
  return "open";
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

function safeImageUrl(url) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("/uploads/") || value.startsWith("uploads/")) return value.startsWith("/") ? value : `/${value}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  return "";
}

function markerIconByStatus(status) {
  const cls = statusClass(status);
  return L.divIcon({
    className: "pin-wrapper",
    html: `<div class="status-pin ${cls}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -16]
  });
}

const map = L.map("map").setView([-24.9558, -53.4552], 13);
const markersLayer = L.layerGroup().addTo(map);
const decisionModal = document.getElementById("decisionModal");
const decisionConfirm = document.getElementById("decisionConfirm");
const decisionCancel = document.getElementById("decisionCancel");
let decisionReportId = null;

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

async function apiAction(url, method = "PATCH", body = null) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers };

  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (res.status === 401 || res.status === 403) {
    logout();
    return { ok: false };
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || "Erro ao executar ação");
    return { ok: false, data };
  }

  return { ok: true, data };
}

window.mapAdminVerify = async function mapAdminVerify(id) {
  const r = await apiAction(`${API_URL}/reports/${id}/verify`);
  if (r.ok) await carregarPontosNoMapa();
};

window.mapAdminFinishVerification = async function mapAdminFinishVerification(id) {
  decisionReportId = Number(id);
  decisionModal?.classList.add("open");
  decisionModal?.setAttribute("aria-hidden", "false");
  decisionConfirm.disabled = true;
  document.querySelectorAll('input[name="decisionOption"]').forEach((el) => {
    el.checked = false;
  });
};

window.mapAdminCompleteCleanup = async function mapAdminCompleteCleanup(id) {
  const r = await apiAction(`${API_URL}/reports/${id}/complete-cleanup`);
  if (r.ok) await carregarPontosNoMapa();
};

function actionButtons(report) {
  if (report.status === "open") {
    return `<button class="map-action-btn" onclick="mapAdminVerify(${Number(report.id)})">Verificar</button>`;
  }

  if (report.status === "verifying") {
    return `<button class="map-action-btn" onclick="mapAdminFinishVerification(${Number(report.id)})">Finalizar verificação</button>`;
  }

  if (report.status === "in_progress") {
    return `<button class="map-action-btn" onclick="mapAdminCompleteCleanup(${Number(report.id)})">Limpeza concluída</button>`;
  }

  return "";
}

async function carregarPontosNoMapa() {
  const res = await fetch(`${API_URL}/reports/map`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401 || res.status === 403) return logout();

  const data = await res.json().catch(() => []);
  if (!res.ok) {
    alert(data.error || "Erro ao carregar denúncias no mapa");
    return;
  }

  markersLayer.clearLayers();

  data.forEach((d) => {
    if (d.lat == null || d.lng == null) return;
    const imageUrl = safeImageUrl(d.image);

    const html = `
      <div class="map-popup">
        <h3>${esc(d.title || "(sem título)")}</h3>
        ${imageUrl ? `<img src="${esc(imageUrl)}" class="popup-report-img" alt="Imagem da denúncia" />` : ""}
        <div class="map-popup-meta">
          <div><b>Usuário:</b> ${esc(d.user_name || "-")}</div>
          <div><b>Título:</b> ${esc(d.title || "-")}</div>
          <div><b>Urgência:</b> ${esc(urgencyLabel(d.urgency, d.status))}</div>
          <div><b>Status:</b> ${esc(statusLabel(d.status))}</div>
          <div><b>Local:</b> ${esc(d.location || "Não informado")}</div>
          <div><b>Data:</b> ${esc(d.created_at ? new Date(d.created_at).toLocaleString("pt-BR") : "-")}</div>
        </div>
        ${actionButtons(d)}
      </div>
    `;

    L.marker([d.lat, d.lng], { icon: markerIconByStatus(d.status) })
      .addTo(markersLayer)
      .bindPopup(html);
  });
}

async function loadNavAvatar() {
  const img = document.getElementById("navAvatar");
  const a = img?.closest(".nav-avatar");
  if (!img || !a) return;

  a.classList.add("is-placeholder");
  img.removeAttribute("src");

  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const me = await res.json().catch(() => ({}));
    if (!me.avatar) return;

    img.src = resolveAvatarSrc(me.avatar) + `?v=${Date.now()}`;
    img.onload = () => a.classList.remove("is-placeholder");
    img.onerror = () => {
      a.classList.add("is-placeholder");
      img.removeAttribute("src");
    };
  } catch {
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll('input[name="decisionOption"]').forEach((el) => {
    el.addEventListener("change", () => {
      decisionConfirm.disabled = !document.querySelector('input[name="decisionOption"]:checked');
    });
  });

  decisionCancel?.addEventListener("click", () => {
    decisionModal?.classList.remove("open");
    decisionModal?.setAttribute("aria-hidden", "true");
    decisionReportId = null;
  });

  decisionModal?.addEventListener("click", (e) => {
    if (e.target === decisionModal) {
      decisionModal.classList.remove("open");
      decisionModal.setAttribute("aria-hidden", "true");
      decisionReportId = null;
    }
  });

  decisionConfirm?.addEventListener("click", async () => {
    if (!decisionReportId) return;
    const selected = document.querySelector('input[name="decisionOption"]:checked')?.value;
    if (!selected) return;

    if (selected === "false") {
      const rf = await apiAction(`${API_URL}/reports/${decisionReportId}/false`);
      if (!rf.ok) return;
    } else {
      const ru = await apiAction(`${API_URL}/reports/${decisionReportId}/urgency`, "PATCH", { urgency: selected });
      if (!ru.ok) return;

      const rs = await apiAction(`${API_URL}/reports/${decisionReportId}/start-cleanup`);
      if (!rs.ok) return;
    }

    decisionModal?.classList.remove("open");
    decisionModal?.setAttribute("aria-hidden", "true");
    decisionReportId = null;
    await carregarPontosNoMapa();
  });

  await loadNavAvatar();
  await carregarPontosNoMapa();
  setTimeout(() => map.invalidateSize(), 30);
});
