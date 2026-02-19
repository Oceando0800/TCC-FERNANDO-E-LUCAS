const API_URL = "";

let token = localStorage.getItem("token");
let user = JSON.parse(localStorage.getItem("user") || "null");
let closeAvatarEditor = () => {};

if (!token || !user) {
  window.location.href = "/login/";
}

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

const PROFILE_AVATAR_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23b8c4cf'/%3E%3Cellipse cx='60' cy='44' rx='21' ry='22' fill='%236f8191'/%3E%3Cpath d='M6 118c7-28 27-43 54-43s47 15 54 43' fill='%236f8191'/%3E%3C/svg%3E";

async function loadNavAvatar() {
  const img = document.getElementById("navAvatar");
  const a = img?.closest(".nav-avatar");
  if (!img || !a) return;

  a.classList.add("is-placeholder");
  img.removeAttribute("src");

  const t = localStorage.getItem("token");
  if (!t) return;

  try {
    const res = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${t}` }
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
  } catch (e) {
  }
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

function normalizeName(name) {
  return String(name || "")
    .replace(/[^\p{L}\s.]/gu, "")
    .slice(0, 40);
}

function isValidName(name) {
  const clean = String(name || "").trim();
  return clean.length >= 2 && clean.length <= 40 && /^[\p{L}\s.]+$/u.test(clean);
}

function applyUserToUI(u) {
  document.getElementById("profileName").textContent = u?.name ? `Perfil - ${u.name}` : "Perfil";
  document.getElementById("profileCpf").textContent = u?.cpf ? `CPF: ${u.cpf}` : "";
  document.getElementById("profileRole").textContent = u?.role ? `Perfil: ${u.role}` : "";
  document.getElementById("name").value = u?.name || "";

  const navAdmin = document.getElementById("navAdmin");
  if (navAdmin && u?.role !== "admin") navAdmin.remove();

  const img = document.getElementById("avatarImg");
  const src = resolveAvatarSrc(u?.avatar);
  if (!img) return;

  const fallback = () => {
    img.src = PROFILE_AVATAR_FALLBACK;
  };

  img.onerror = fallback;
  if (src) img.src = src + `?v=${Date.now()}`;
  else fallback();
}

function bindNameInputMask() {
  const nameInput = document.getElementById("name");
  if (!nameInput) return;
  nameInput.addEventListener("input", () => {
    nameInput.value = normalizeName(nameInput.value);
  });
}

function setupAvatarToggle() {
  const toggle = document.getElementById("avatarToggle");
  const form = document.getElementById("avatarForm");
  if (!toggle || !form) return;

  let isOpen = false;

  const close = () => {
    if (!isOpen) return;
    isOpen = false;
    toggle.setAttribute("aria-expanded", "false");
    form.classList.remove("open");

    const onTransitionEnd = () => {
      if (!isOpen) form.hidden = true;
      form.removeEventListener("transitionend", onTransitionEnd);
    };
    form.addEventListener("transitionend", onTransitionEnd);
  };

  const open = () => {
    if (isOpen) return;
    isOpen = true;
    form.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => form.classList.add("open"));
  };

  closeAvatarEditor = close;

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    if (isOpen) close();
    else open();
  });

  form.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

async function refreshMe() {
  const res = await fetch(`${API_URL}/users/me`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return logout();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || "Erro ao carregar perfil");
    return;
  }

  user = data;
  localStorage.setItem("user", JSON.stringify(user));
  applyUserToUI(user);
  loadNavAvatar();
}

async function loadRejected() {
  const list = document.getElementById("rejectedList");
  if (!list) return;

  list.innerHTML = '<div class="empty-state">Carregando...</div>';

  const res = await fetch(`${API_URL}/reports/me?status=rejected`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return logout();

  const data = await res.json().catch(() => []);

  if (!res.ok) {
    list.innerHTML = '<div class="empty-state">Erro ao carregar.</div>';
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    list.innerHTML = '<div class="empty-state">Nenhuma denúncia rejeitada.</div>';
    return;
  }

  list.innerHTML = "";
  data.forEach((r) => {
    const card = document.createElement("div");
    card.className = "rejected-card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <strong>${esc(r.title || "(sem título)")}</strong>
        <span class="badge-rejected">Rejeitada</span>
      </div>
      <p class="muted small">${esc(r.location || "")}</p>
      <p class="reason"><strong>Motivo:</strong> ${esc(r.reject_reason || "(sem motivo registrado)")}</p>
      <p class="muted small">${r.created_at ? new Date(r.created_at).toLocaleString() : ""}</p>
    `;
    list.appendChild(card);
  });
}

async function loadHistory() {
  const list = document.getElementById("historyList");
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Carregando...</div>';

  const res = await fetch(`${API_URL}/reports/me/history`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) return logout();
  const data = await res.json().catch(() => []);

  if (!res.ok) {
    list.innerHTML = '<div class="empty-state">Erro ao carregar histórico.</div>';
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    list.innerHTML = '<div class="empty-state">Sem histórico de alterações.</div>';
    return;
  }

  list.innerHTML = "";
  data.slice(0, 20).forEach((h) => {
    const card = document.createElement("div");
    card.className = "rejected-card";
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
        <strong>Denúncia #${esc(h.report_id)} - ${esc(h.title || "(sem título)")}</strong>
        <span class="badge-rejected">${esc(h.action || "ação")}</span>
      </div>
      <p class="muted small">${esc(h.from_status || "-")} -> ${esc(h.to_status || "-")}</p>
      <p class="reason">${esc(h.note || "")}</p>
      <p class="muted small">${h.created_at ? new Date(h.created_at).toLocaleString() : ""}</p>
    `;
    list.appendChild(card);
  });
}

document.getElementById("nameForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nameInput = document.getElementById("name");
  const name = normalizeName(nameInput?.value || "").trim();
  if (nameInput) nameInput.value = name;

  if (!isValidName(name)) {
    return alert("Nome deve ter entre 2 e 40 caracteres e usar apenas letras, espaço e ponto.");
  }

  const res = await fetch(`${API_URL}/users/me`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ name })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || "Erro ao atualizar nome");

  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
  }
  if (data.user) {
    user = data.user;
    localStorage.setItem("user", JSON.stringify(user));
    applyUserToUI(user);
    loadNavAvatar();
  }

  alert("Nome atualizado.");
});

document.getElementById("passForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const current_password = document.getElementById("currentPass").value;
  const new_password = document.getElementById("newPass").value;
  const confirm_new_password = document.getElementById("confirmNewPass").value;

  if (new_password !== confirm_new_password) {
    return alert("A confirmação da nova senha não confere.");
  }

  const res = await fetch(`${API_URL}/users/me/password`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ current_password, new_password })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || "Erro ao alterar senha");

  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
  }

  document.getElementById("currentPass").value = "";
  document.getElementById("newPass").value = "";
  document.getElementById("confirmNewPass").value = "";
  alert("Senha atualizada.");
});

document.getElementById("avatarForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = document.getElementById("avatarFile").files?.[0];
  if (!file) return alert("Escolha uma imagem.");

  const fd = new FormData();
  fd.append("avatar", file);

  const res = await fetch(`${API_URL}/users/me/avatar`, {
    method: "PATCH",
    headers: authHeaders(),
    body: fd
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || "Erro ao atualizar foto");

  if (data.token) {
    token = data.token;
    localStorage.setItem("token", token);
  }
  if (data.user) {
    user = data.user;
    localStorage.setItem("user", JSON.stringify(user));
    applyUserToUI(user);
  }

  loadNavAvatar();
  document.getElementById("avatarFile").value = "";
  closeAvatarEditor();
  alert("Foto atualizada.");
});

document.addEventListener("DOMContentLoaded", () => {
  bindNameInputMask();
  setupAvatarToggle();
  applyUserToUI(user);
  loadNavAvatar();
  refreshMe();
  loadRejected();
  loadHistory();
});

