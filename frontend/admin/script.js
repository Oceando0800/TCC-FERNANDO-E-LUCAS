const API_URL = "";

const token = localStorage.getItem("token");
const user = JSON.parse(localStorage.getItem("user") || "null");

if (!token || !user || user.role !== "admin") {
  window.location.href = "/login/";
}

let categoryChart = null;
let regionChart = null;
let regionStats = [];
let regionPage = 0;
const REGION_PAGE_SIZE = 5;

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

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[c]));
}

function formatDate(dateInput) {
  if (!dateInput) return "-";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDateOnly(dateInput) {
  if (!dateInput) return "-";
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("pt-BR");
}

function statusLabel(status) {
  if (status === "verifying") return "Verificando";
  if (status === "in_progress") return "Em andamento";
  if (status === "resolved") return "Limpo";
  if (status === "rejected") return "Rejeitado";
  return "Pendente";
}

function urgencyLabel(urgency) {
  if (!urgency) return "Nulo";
  if (urgency === "high") return "Alta";
  if (urgency === "medium") return "Média";
  return "Baixa";
}

function categoryLabel(category) {
  if (category === "entulho") return "Entulho";
  if (category === "domestico") return "Doméstico";
  if (category === "industrial") return "Industrial";
  return "-";
}

function updateRegionPager() {
  const totalPages = Math.max(1, Math.ceil(regionStats.length / REGION_PAGE_SIZE));
  const pageInfo = document.getElementById("regionPageInfo");
  const btnPrev = document.getElementById("regionPrev");
  const btnNext = document.getElementById("regionNext");

  if (pageInfo) pageInfo.textContent = `${regionPage + 1}/${totalPages}`;
  if (btnPrev) btnPrev.disabled = regionPage <= 0;
  if (btnNext) btnNext.disabled = regionPage >= totalPages - 1;
}

function renderRegionPage() {
  if (!regionChart) return;

  const start = regionPage * REGION_PAGE_SIZE;
  const chunk = regionStats.slice(start, start + REGION_PAGE_SIZE);

  const normalizeWord = (w) => w.trim();
  const abbreviateCity = (city) => {
    const raw = String(city || "Não informado").trim();
    if (raw.length <= 14) return raw;

    const words = raw.split(/\s+/).map(normalizeWord).filter(Boolean);
    if (words.length <= 1) return raw.slice(0, 14) + "...";

    const first = words[0];
    const tail = words.slice(1).map((w) => `${w[0]?.toUpperCase() || ""}.`).join(" ");
    const compact = `${first} ${tail}`.trim();

    if (compact.length <= 18) return compact;
    return [first, tail]; // multiline label in Chart.js
  };

  regionChart.data.labels = chunk.map((x) => abbreviateCity(x.region));
  regionChart.data.datasets[0].data = chunk.map((x) => Number(x.total || 0));
  regionChart.update();
  updateRegionPager();
}

function getFilters() {
  return {
    author: document.getElementById("filterAuthor")?.value?.trim() || "",
    location: document.getElementById("filterLocation")?.value?.trim() || "",
    category: document.getElementById("filterCategory")?.value || "",
    urgency: document.getElementById("filterUrgency")?.value || "",
    status: document.getElementById("filterStatus")?.value || ""
  };
}

function getUserFilters() {
  return {
    name: document.getElementById("userFilterName")?.value?.trim() || "",
    status: document.getElementById("userFilterStatus")?.value || "",
    falseSort: document.getElementById("userFilterFalseSort")?.value || "normal"
  };
}

function toQueryString(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  return params.toString();
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
  } catch (e) {
  }
}

function fillInsights(reports) {
  const criticalOpen = reports.filter((r) => (r.status === "open" || r.status === "verifying") && (r.urgency === "high")).length;

  const topLocationMap = new Map();
  reports.forEach((r) => {
    const key = (r.location || "Não informado").trim();
    topLocationMap.set(key, (topLocationMap.get(key) || 0) + 1);
  });

  let topLocation = "-";
  let topLocationCount = 0;
  topLocationMap.forEach((count, loc) => {
    if (count > topLocationCount) {
      topLocation = loc;
      topLocationCount = count;
    }
  });

  let latestText = "-";
  const sortedByDate = [...reports].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  if (sortedByDate.length > 0) latestText = formatDate(sortedByDate[0].created_at);

  document.getElementById("insightCriticalOpen").textContent = String(criticalOpen);
  document.getElementById("insightTopLocation").textContent = topLocation;
  document.getElementById("insightLastReport").textContent = latestText;
}

async function carregar(filters = getFilters()) {
  const tbody = document.getElementById("adminTableBody");
  if (!tbody) return;

  const totalCount = document.getElementById("totalCount");
  const pendingCount = document.getElementById("pendingCount");
  const resolvedCount = document.getElementById("resolvedCount");
  const rejectedCount = document.getElementById("rejectedCount");

  const query = toQueryString(filters);
  const url = query ? `${API_URL}/reports?${query}` : `${API_URL}/reports`;

  const res = await fetch(url, { headers: authHeaders() });

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

  const total = reports.length;
  const pending = reports.filter((r) => r.status === "open" || r.status === "verifying" || r.status === "in_progress").length;
  const resolved = reports.filter((r) => r.status === "resolved").length;
  const rejected = reports.filter((r) => r.status === "rejected").length;

  totalCount.textContent = String(total);
  pendingCount.textContent = String(pending);
  resolvedCount.textContent = String(resolved);
  rejectedCount.textContent = String(rejected);

  fillInsights(reports);

  tbody.innerHTML = "";

  if (reports.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhuma denúncia encontrada para os filtros selecionados.</td></tr>';
    return;
  }

  reports.forEach((r) => {
    const urgency = r.urgency || "low";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${esc(r.id)}</td>
      <td>${esc(r.user_name || "")}</td>
      <td>${esc(r.title || "")}</td>
      <td>${esc(categoryLabel(r.category))}</td>
      <td>${esc(r.location || "")}</td>
      <td>
        ${r.status === "verifying"
          ? `<select class="verification-decision" data-id="${esc(r.id)}">
               <option value="">Escolher...</option>
               <option value="high">Alta</option>
               <option value="medium">Média</option>
               <option value="low">Baixa</option>
               <option value="false">Denúncia falsa</option>
             </select>`
          : `${esc(r.status === "open" ? "Nulo" : urgencyLabel(urgency))}`}
      </td>
      <td><span class="status-pill ${esc(r.status)}">${statusLabel(r.status)}</span></td>
      <td>
        <div class="table-actions">
          ${r.status === "open" ? `<button class="btn verify" data-id="${esc(r.id)}">Verificar</button>` : ""}
          ${r.status === "verifying" ? `<button class="btn finish-verification" data-id="${esc(r.id)}">Finalizar verificação</button>` : ""}
          ${r.status === "in_progress" ? `<button class="btn complete-cleanup" data-id="${esc(r.id)}">Limpeza concluída</button>` : ""}
          <button class="btn delete" data-id="${esc(r.id)}">Excluir</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".verify").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const res2 = await fetch(`${API_URL}/reports/${id}/verify`, {
        method: "PATCH",
        headers: authHeaders()
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) return alert(data2.error || "Erro ao iniciar verificação");
      carregar(filters);
    });
  });

  tbody.querySelectorAll(".finish-verification").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const decision = tbody.querySelector(`.verification-decision[data-id="${id}"]`)?.value || "";

      if (!decision) return alert("Ao finalizar verificação, escolha: Alta, Média, Baixa ou Denúncia falsa.");

      if (decision === "false") {
        const ok = confirm("Confirmar como denúncia falsa?");
        if (!ok) return;

        const resFalse = await fetch(`${API_URL}/reports/${id}/false`, {
          method: "PATCH",
          headers: authHeaders()
        });
        const dataFalse = await resFalse.json().catch(() => ({}));
        if (!resFalse.ok) return alert(dataFalse.error || "Erro ao marcar denúncia falsa");
        carregar(filters);
        return;
      }

      const resUrgency = await fetch(`${API_URL}/reports/${id}/urgency`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ urgency: decision })
      });
      const dataUrgency = await resUrgency.json().catch(() => ({}));
      if (!resUrgency.ok) return alert(dataUrgency.error || "Erro ao definir urgência");

      const res2 = await fetch(`${API_URL}/reports/${id}/start-cleanup`, {
        method: "PATCH",
        headers: authHeaders()
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) return alert(data2.error || "Erro ao finalizar verificação");
      carregar(filters);
    });
  });

  tbody.querySelectorAll(".complete-cleanup").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const res2 = await fetch(`${API_URL}/reports/${id}/complete-cleanup`, {
        method: "PATCH",
        headers: authHeaders()
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) return alert(data2.error || "Erro ao concluir limpeza");
      carregar(filters);
    });
  });

  tbody.querySelectorAll(".delete").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const ok = confirm("Tem certeza que deseja EXCLUIR esta denúncia?\n\nEssa ação não pode ser desfeita.");
      if (!ok) return;

      const res2 = await fetch(`${API_URL}/reports/${id}`, {
        method: "DELETE",
        headers: authHeaders()
      });

      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) alert(data2.error || "Erro ao excluir denúncia");
      else carregar(filters);
    });
  });
}

async function carregarUsuarios(filters = getUserFilters()) {
  const tbody = document.getElementById("usersTableBody");
  if (!tbody) return;

  const res = await fetch(`${API_URL}/users`, { headers: authHeaders() });
  const data = await res.json().catch(() => []);

  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Erro ao carregar usuários.</td></tr>';
    return;
  }

  const createdAtMs = (u) => {
    const t = new Date(u.created_at || 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };

  const falseCount = (u) => Number(u.false_report_count || 0);

  let users = Array.isArray(data) ? data.filter((u) => u.role !== "admin") : [];

  if (filters.name) {
    const needle = filters.name.toLowerCase();
    users = users.filter((u) => String(u.name || "").toLowerCase().includes(needle));
  }

  if (filters.status === "active") {
    users = users.filter((u) => Number(u.is_banned) !== 1);
  } else if (filters.status === "banned") {
    users = users.filter((u) => Number(u.is_banned) === 1);
  }

  if (filters.falseSort === "false_asc") {
    users.sort((a, b) => falseCount(a) - falseCount(b) || createdAtMs(a) - createdAtMs(b));
  } else if (filters.falseSort === "false_desc") {
    users.sort((a, b) => falseCount(b) - falseCount(a) || createdAtMs(a) - createdAtMs(b));
  } else {
    users.sort((a, b) => createdAtMs(a) - createdAtMs(b));
  }

  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-row">Nenhum usuário listado.</td></tr>';
    return;
  }

  tbody.innerHTML = "";
  users.forEach((u) => {
    const tr = document.createElement("tr");
    const banDate = formatDateOnly(u.banned_at);
    const reasonText = u.banned_reason || "-";
    const reasonWithDate = Number(u.is_banned) === 1 && banDate !== "-"
      ? `${reasonText} (Banido em: ${banDate})`
      : reasonText;

    tr.innerHTML = `
      <td>${esc(u.id)}</td>
      <td>${esc(u.name)}</td>
      <td>${esc(u.cpf)}</td>
      <td>${Number(u.false_report_count || 0) > 0 ? Number(u.false_report_count) : "-"}</td>
      <td>${Number(u.ban_count || 0) > 0 ? Number(u.ban_count) : "-"}</td>
      <td>${Number(u.is_banned) === 1 ? "Banido" : "Ativo"}</td>
      <td>${esc(reasonWithDate)}</td>
      <td>
        <div class="table-actions">
          ${Number(u.is_banned) === 1
            ? `<button class="btn unban-user" data-id="${esc(u.id)}">Desbanir</button>`
            : `<button class="btn ban-user" data-id="${esc(u.id)}">Banir</button>`}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".ban-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const reason = prompt("Motivo do banimento:", "Uso indevido do sistema") || "Uso indevido do sistema";

      const res2 = await fetch(`${API_URL}/users/${id}/ban`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ reason })
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) return alert(data2.error || "Erro ao banir usuário");
      carregarUsuarios(getUserFilters());
    });
  });

  tbody.querySelectorAll(".unban-user").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const res2 = await fetch(`${API_URL}/users/${id}/unban`, {
        method: "PATCH",
        headers: authHeaders()
      });
      const data2 = await res2.json().catch(() => ({}));
      if (!res2.ok) return alert(data2.error || "Erro ao desbanir usuário");
      carregarUsuarios(getUserFilters());
    });
  });
}

async function carregarGraficos() {
  const res = await fetch(`${API_URL}/reports/stats`, { headers: authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return;

  const catLabels = (data.byCategory || []).map((x) => categoryLabel(x.category));
  const catValues = (data.byCategory || []).map((x) => Number(x.total || 0));

  regionStats = Array.isArray(data.byRegion) ? data.byRegion : [];
  regionPage = 0;

  if (categoryChart) categoryChart.destroy();
  if (regionChart) regionChart.destroy();

  const ctx1 = document.getElementById("chartCategory")?.getContext("2d");
  const ctx2 = document.getElementById("chartRegion")?.getContext("2d");

  if (ctx1) {
    categoryChart = new Chart(ctx1, {
      type: "doughnut",
      data: {
        labels: catLabels,
        datasets: [{ data: catValues }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom" } }
      }
    });
  }

  if (ctx2) {
    regionChart = new Chart(ctx2, {
      type: "bar",
      data: {
        labels: [],
        datasets: [{ label: "Ocorrências", data: [] }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: {
              maxRotation: 0,
              minRotation: 0,
              autoSkip: false
            }
          },
          y: { beginAtZero: true }
        }
      }
    });
    renderRegionPage();
  }
}

const btnPdf = document.getElementById("btnPdf");
btnPdf?.addEventListener("click", async () => {
  const period = document.getElementById("period")?.value || "all";
  const textEl = btnPdf.querySelector(".pdf-btn-text");

  btnPdf.disabled = true;
  if (textEl) textEl.textContent = "Gerando...";

  try {
    const res = await fetch(`${API_URL}/reports/report/pdf?period=${encodeURIComponent(period)}`, {
      headers: authHeaders()
    });

    if (res.status === 401 || res.status === 403) return logout();

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erro ao gerar PDF");
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-${period}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    btnPdf.disabled = false;
    if (textEl) textEl.textContent = "Exportar PDF";
  }
});

document.getElementById("btnApplyFilters")?.addEventListener("click", () => carregar(getFilters()));
document.getElementById("btnClearFilters")?.addEventListener("click", () => {
  ["filterAuthor", "filterLocation"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  ["filterCategory", "filterUrgency", "filterStatus"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  carregar(getFilters());
});

["filterAuthor", "filterLocation"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") carregar(getFilters());
  });
});

["filterCategory", "filterUrgency", "filterStatus"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("change", () => carregar(getFilters()));
});

document.getElementById("btnApplyUserFilters")?.addEventListener("click", () => carregarUsuarios(getUserFilters()));
document.getElementById("btnClearUserFilters")?.addEventListener("click", () => {
  const name = document.getElementById("userFilterName");
  const status = document.getElementById("userFilterStatus");
  const falseSort = document.getElementById("userFilterFalseSort");
  if (name) name.value = "";
  if (status) status.value = "";
  if (falseSort) falseSort.value = "normal";
  carregarUsuarios(getUserFilters());
});

document.getElementById("userFilterName")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") carregarUsuarios(getUserFilters());
});

["userFilterStatus", "userFilterFalseSort"].forEach((id) => {
  const el = document.getElementById(id);
  el?.addEventListener("change", () => carregarUsuarios(getUserFilters()));
});

document.getElementById("regionPrev")?.addEventListener("click", () => {
  if (regionPage <= 0) return;
  regionPage -= 1;
  renderRegionPage();
});

document.getElementById("regionNext")?.addEventListener("click", () => {
  const totalPages = Math.max(1, Math.ceil(regionStats.length / REGION_PAGE_SIZE));
  if (regionPage >= totalPages - 1) return;
  regionPage += 1;
  renderRegionPage();
});

document.addEventListener("DOMContentLoaded", async () => {
  loadNavAvatar();
  await carregar(getFilters());
  await carregarUsuarios(getUserFilters());
  await carregarGraficos();
});


