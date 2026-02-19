const API_URL = "";
const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user) {
  window.location.href = "/login/";
}

const navAdmin = document.getElementById("navAdmin");
if (navAdmin && user?.role !== "admin") navAdmin.remove();

const form = document.getElementById("reportForm");
const descriptionEl = document.getElementById("description");
const descriptionCountEl = document.getElementById("descriptionCount");
const selectedInfoEl = document.getElementById("selectedInfo");
const clearFormBtn = document.getElementById("clearFormBtn");
const MAX_LOCATION_FIELD = 50;
const MAX_DESCRIPTION = 100;
const DESCRIPTION_MIN_HEIGHT = 84;
const DESCRIPTION_MAX_HEIGHT = 170;
const MAX_TITLE = 30;
const TITLE_EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u200D|\uFE0F)/gu;

let selectedLat = null;
let selectedLng = null;
let selectedMarker = null;
const myReportsLayer = L.layerGroup();

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login/";
}
window.logout = logout;

function authHeaders(extra = {}) {
  return { ...extra, Authorization: `Bearer ${token}` };
}

function resolveAvatarSrc(avatar) {
  if (!avatar) return "";
  if (avatar.startsWith("http")) return avatar;
  if (avatar.startsWith("/uploads/")) return avatar;
  if (avatar.startsWith("uploads/")) return "/" + avatar;
  return "/uploads/" + avatar;
}

function updateDescriptionCount() {
  if (!descriptionEl || !descriptionCountEl) return;
  descriptionCountEl.textContent = `${descriptionEl.value.length}/${MAX_DESCRIPTION}`;
}

function autoResizeDescription() {
  if (!descriptionEl) return;
  descriptionEl.style.height = `${DESCRIPTION_MIN_HEIGHT}px`;
  const nextHeight = Math.min(descriptionEl.scrollHeight, DESCRIPTION_MAX_HEIGHT);
  descriptionEl.style.height = `${Math.max(nextHeight, DESCRIPTION_MIN_HEIGHT)}px`;
}

function sanitizeTitle(value) {
  return String(value || "").replace(TITLE_EMOJI_REGEX, "").slice(0, MAX_TITLE);
}

function clampText(value, max = MAX_LOCATION_FIELD) {
  return String(value || "").slice(0, max);
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

descriptionEl?.addEventListener("input", () => {
  updateDescriptionCount();
  autoResizeDescription();
});
document.getElementById("title")?.addEventListener("input", (e) => {
  const input = e.target;
  const cleaned = sanitizeTitle(input.value);
  if (input.value !== cleaned) input.value = cleaned;
});
["cep", "number", "address", "district", "city"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("input", () => {
    const next = clampText(el.value);
    if (el.value !== next) el.value = next;
  });
});

const map = L.map("map").setView([-24.9558, -53.4552], 13);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors"
}).addTo(map);
myReportsLayer.addTo(map);

function statusLabel(status) {
  if (status === "verifying") return "Verificando";
  if (status === "in_progress") return "Em progresso";
  if (status === "resolved") return "Limpo";
  if (status === "rejected") return "Rejeitada";
  return "Pendente";
}

function statusColor(status) {
  if (status === "verifying") return "#0ea5e9";
  if (status === "in_progress") return "#2563eb";
  if (status === "resolved") return "#22c55e";
  if (status === "rejected") return "#ef4444";
  return "#f59e0b";
}

async function loadMyReportsOnMap() {
  const res = await fetch(`${API_URL}/reports/me`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return logout();

  const data = await res.json().catch(() => []);
  if (!res.ok) return;

  const reports = Array.isArray(data) ? data : [];
  myReportsLayer.clearLayers();

  reports.forEach((r) => {
    if (r.lat == null || r.lng == null) return;

    const popup = `
      <div class="map-popup-user">
        <b>${esc(r.title || "(sem título)")}</b><br>
        ${esc(r.location || "Local não informado")}<br>
        Status: ${esc(statusLabel(r.status))}<br>
        ${esc(r.created_at ? new Date(r.created_at).toLocaleString("pt-BR") : "")}
      </div>
    `;

    L.circleMarker([Number(r.lat), Number(r.lng)], {
      radius: 7,
      color: "#ffffff",
      weight: 2,
      fillColor: statusColor(r.status),
      fillOpacity: 0.95
    }).addTo(myReportsLayer).bindPopup(popup);
  });
}

function setSelectedPoint(lat, lng) {
  selectedLat = Number(lat);
  selectedLng = Number(lng);

  if (!selectedMarker) {
    selectedMarker = L.marker([selectedLat, selectedLng]).addTo(map);
  } else {
    selectedMarker.setLatLng([selectedLat, selectedLng]);
  }

  selectedInfoEl.textContent = `Ponto selecionado: ${selectedLat.toFixed(6)}, ${selectedLng.toFixed(6)}`;
}

function clearSelectedPoint() {
  selectedLat = null;
  selectedLng = null;
  if (selectedMarker) {
    map.removeLayer(selectedMarker);
    selectedMarker = null;
  }
  if (selectedInfoEl) selectedInfoEl.textContent = "Nenhum ponto selecionado no mapa.";
}

async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;

  try {
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return;

    const data = await res.json().catch(() => ({}));
    const a = data.address || {};

    const city = a.city || a.town || a.village || a.municipality || "";
    const district = a.suburb || a.neighbourhood || a.city_district || "";
    const road = a.road || a.pedestrian || a.footway || a.path || "";
    const number = a.house_number || "";
    const cep = a.postcode || "";

    const isoUF = String(a["ISO3166-2-lvl4"] || "").split("-")[1] || "";
    const stateUF = isoUF || (a.state_code || "").replace("BR-", "");
    const cityUf = city ? `${city}${stateUF ? ` - ${stateUF}` : ""}` : "";

    if (cep) document.getElementById("cep").value = clampText(cep);
    if (road) document.getElementById("address").value = clampText(road);
    if (number) document.getElementById("number").value = clampText(number);
    if (district) document.getElementById("district").value = clampText(district);
    if (cityUf) document.getElementById("city").value = clampText(cityUf);
  } catch (err) {
    console.warn("Falha no reverse geocoding:", err);
  }
}

map.on("click", async (e) => {
  const { lat, lng } = e.latlng;
  setSelectedPoint(lat, lng);
  await reverseGeocode(lat, lng);
});

map.locate({ setView: true, maxZoom: 15 });

function buildLocation() {
  const cep = document.getElementById("cep").value.trim();
  const address = document.getElementById("address").value.trim();
  const number = document.getElementById("number").value.trim();
  const district = document.getElementById("district").value.trim();
  const city = document.getElementById("city").value.trim();

  const line1 = [address, number].filter(Boolean).join(", ");
  const line2 = [district, city].filter(Boolean).join(", ");
  const line3 = cep ? `CEP: ${cep}` : "";

  return [line1, line2, line3].filter(Boolean).join(" - ");
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const titleInput = document.getElementById("title");
  const title = sanitizeTitle(titleInput?.value || "").trim();
  const address = clampText(document.getElementById("address").value).trim();
  const city = clampText(document.getElementById("city").value).trim();
  const category = document.getElementById("category").value;
  const description = String(document.getElementById("description").value || "").slice(0, MAX_DESCRIPTION).trim();
  const imageFile = document.getElementById("image")?.files?.[0] || null;

  if (titleInput) titleInput.value = title;
  document.getElementById("address").value = address;
  document.getElementById("city").value = city;
  document.getElementById("description").value = description;
  if (!title) return alert("Informe um título.");
  if (title.length > MAX_TITLE) return alert(`O título pode ter no máximo ${MAX_TITLE} caracteres.`);
  if (!address) return alert("Informe a rua.");
  if (!city) return alert("Informe cidade/UF.");
  if (description.length < 10) return alert("A descrição precisa ter pelo menos 10 caracteres.");
  if (description.length > MAX_DESCRIPTION) return alert(`A descrição pode ter no máximo ${MAX_DESCRIPTION} caracteres.`);
  if (selectedLat == null || selectedLng == null) return alert("Clique no mapa para selecionar o local da denúncia.");

  const fd = new FormData();
  fd.append("title", title);
  fd.append("description", description);
  fd.append("category", category);
  fd.append("location", buildLocation());
  fd.append("lat", String(selectedLat));
  fd.append("lng", String(selectedLng));
  if (imageFile) fd.append("image", imageFile);

  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/reports`, {
      method: "POST",
      headers: authHeaders(),
      body: fd
    });

    if (res.status === 401 || res.status === 403) return logout();

    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.error || "Erro ao enviar denúncia");

    alert("Denúncia enviada com sucesso.");
    window.location.href = "/inicio/";
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

clearFormBtn?.addEventListener("click", () => {
  form?.reset();
  clearSelectedPoint();
  updateDescriptionCount();
  autoResizeDescription();
});

async function loadNavAvatar() {
  const img = document.getElementById("navAvatar");
  const a = img?.closest(".nav-avatar");
  if (!img || !a) return;

  a.classList.add("is-placeholder");
  img.removeAttribute("src");

  try {
    const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() });
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

document.addEventListener("DOMContentLoaded", () => {
  updateDescriptionCount();
  autoResizeDescription();
  loadNavAvatar();
  loadMyReportsOnMap();
  setTimeout(() => map.invalidateSize(), 30);
});
