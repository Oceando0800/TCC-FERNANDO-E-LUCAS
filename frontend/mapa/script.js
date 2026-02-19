function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login/";
}
window.logout = logout;

const token = localStorage.getItem("token");
if (!token) {
  alert("Você precisa estar logado para ver o mapa.");
  window.location.href = "/login/";
}

const user = JSON.parse(localStorage.getItem("user") || "null");
const isAdmin = user?.role === "admin";
const navAdmin = document.getElementById("navAdmin");
if (navAdmin && !isAdmin) navAdmin.remove();

const map = L.map("map").setView([-24.9558, -53.4552], 13);
const markersLayer = L.layerGroup().addTo(map);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

function mostrarMinhaPosicao() {
  map.locate({ setView: true, maxZoom: 16 });

  function onLocationFound(e) {
    const radius = e.accuracy / 2;
    L.circle(e.latlng, radius).addTo(map);

    L.marker(e.latlng)
      .addTo(map)
      .bindPopup("Você está em um raio de " + radius.toFixed(0) + "m deste ponto");
  }

  function onLocationError(e) {
    console.warn("Geolocalização falhou:", e.message);
  }

  map.on("locationfound", onLocationFound);
  map.on("locationerror", onLocationError);
}

mostrarMinhaPosicao();

function urgencyClass(urgency) {
  if (urgency === "high") return "high";
  if (urgency === "medium") return "medium";
  return "low";
}

function urgencyLabel(urgency) {
  if (urgency === "high") return "Alta";
  if (urgency === "medium") return "Média";
  return "Baixa";
}

function urgencyColorDot(urgency) {
  if (urgency === "high") return "??";
  if (urgency === "medium") return "??";
  return "??";
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

function statusLabel(status) {
  if (status === "verifying") return "Verificando";
  if (status === "in_progress") return "Em andamento";
  if (status === "resolved") return "Completo";
  if (status === "rejected") return "Rejeitada";
  return "Pendente";
}

function markerIconByUrgency(urgency) {
  const cls = urgencyClass(urgency);
  return L.divIcon({
    className: "pin-wrapper",
    html: `<div class="urgency-pin ${cls}"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 18],
    popupAnchor: [0, -16]
  });
}

async function apiAction(url, method = "PATCH") {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}` }
  });

  if (res.status === 401 || res.status === 403) {
    alert("Sessão expirada. Faça login novamente.");
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

window.startCleanupFromMap = async function startCleanupFromMap(id) {
  const r = await apiAction(`/reports/${id}/start-cleanup`);
  if (r.ok) await carregarPontosNoMapa();
};

window.completeCleanupFromMap = async function completeCleanupFromMap(id) {
  const r = await apiAction(`/reports/${id}/complete-cleanup`);
  if (r.ok) await carregarPontosNoMapa();
};

function adminActionHtml(report) {
  if (!isAdmin) return "";

  if (report.status === "open") {
    return `<button class="map-action-btn" onclick="startCleanupFromMap(${Number(report.id)})">Enviar equipe de limpeza</button>`;
  }

  if (report.status === "in_progress") {
    return `<button class="map-action-btn" onclick="completeCleanupFromMap(${Number(report.id)})">Limpeza realizada</button>`;
  }

  return "";
}

async function carregarPontosNoMapa() {
  try {
    const response = await fetch("/reports/map", {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401 || response.status === 403) {
      alert("Sessão expirada. Faça login novamente.");
      logout();
      return;
    }

    const denuncias = await response.json().catch(() => []);

    if (!response.ok) {
      alert(denuncias.error || "Erro ao carregar denúncias no mapa");
      return;
    }

    markersLayer.clearLayers();

    denuncias.forEach((d) => {
      if (d.lat == null || d.lng == null) return;
      const imageUrl = safeImageUrl(d.image);

      const html = `
        <div class="map-popup">
          <h3>${esc(d.title)}</h3>
          <p>${esc(d.description)}</p>

          ${imageUrl ? `<img src="${esc(imageUrl)}" class="report-img" alt="Imagem da denúncia" />` : ""}

          <div class="map-popup-meta">
            <div><b>Status:</b> ${esc(statusLabel(d.status))}</div>
            <div><b>Urgência:</b> ${urgencyColorDot(d.urgency)} ${esc(urgencyLabel(d.urgency))}</div>
            <div><b>Local:</b> ${esc(d.location || "Não informado")}</div>
          </div>

          ${adminActionHtml(d)}
        </div>
      `;

      L.marker([d.lat, d.lng], { icon: markerIconByUrgency(d.urgency) })
        .addTo(markersLayer)
        .bindPopup(html);
    });
  } catch (err) {
    console.error("Erro ao carregar mapa:", err);
    alert("Erro ao carregar o mapa.");
  }
}

carregarPontosNoMapa();

async function loadNavAvatar() {
  const img = document.getElementById("navAvatar");
  const a = img?.closest(".nav-avatar");
  if (!img || !a) return;

  a.classList.add("is-placeholder");
  img.removeAttribute("src");

  const savedToken = localStorage.getItem("token");
  if (!savedToken) return;

  try {
    const res = await fetch("/users/me", {
      headers: { Authorization: `Bearer ${savedToken}` }
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
  } catch (e) {
  }
}

document.addEventListener("DOMContentLoaded", loadNavAvatar);



