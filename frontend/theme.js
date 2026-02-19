(function () {
  const root = document.documentElement;
  let toggleBtn = null;

  const saved = localStorage.getItem("theme");
  if (saved === "dark" || saved === "light") root.dataset.theme = saved;
  if (!root.dataset.theme) root.dataset.theme = "light";

  function setTheme(next) {
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
    syncIcon();
  }

  function toggleTheme() {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    if (toggleBtn) {
      toggleBtn.classList.remove("is-clicked");
      void toggleBtn.offsetWidth;
      toggleBtn.classList.add("is-clicked");
    }
    setTheme(next);
  }

  function ensureThemeToggle() {
    if (document.querySelector(".theme-toggle")) {
      toggleBtn = document.querySelector(".theme-toggle");
      syncIcon();
      return;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Alternar entre modo claro e escuro");
    btn.setAttribute("title", "Tema");
    btn.innerHTML = `
      <span class="theme-toggle-track">
        <span class="theme-toggle-sun" aria-hidden="true">&#9728;</span>
        <span class="theme-toggle-moon" aria-hidden="true">&#9790;</span>
        <span class="theme-toggle-thumb"></span>
      </span>
    `;
    btn.addEventListener("click", toggleTheme);

    const navLinks = document.querySelector(".glass-nav .nav-links");
    if (navLinks) {
      const avatarLink = navLinks.querySelector(".nav-avatar");
      if (avatarLink) avatarLink.insertAdjacentElement("afterend", btn);
      else navLinks.prepend(btn);
    } else {
      btn.classList.add("is-floating");
      document.body.appendChild(btn);
    }

    toggleBtn = btn;
    syncIcon();
  }

  function syncIcon() {
    const btn = toggleBtn || document.querySelector(".theme-toggle");
    if (!btn) return;
    const isDark = root.dataset.theme === "dark";
    btn.classList.toggle("is-dark", isDark);
    btn.setAttribute("aria-pressed", String(isDark));
  }

  function authHeader() {
    const token = localStorage.getItem("token");
    if (!token) return null;
    return { Authorization: `Bearer ${token}` };
  }

  async function fetchUnreadCount() {
    const headers = authHeader();
    if (!headers) return 0;

    try {
      const res = await fetch("/users/me/notifications/unread-count", { headers });
      if (!res.ok) return 0;
      const data = await res.json().catch(() => ({}));
      return Number(data.unread || 0);
    } catch {
      return 0;
    }
  }

  async function fetchNotifications() {
    const headers = authHeader();
    if (!headers) return [];

    try {
      const res = await fetch("/users/me/notifications", { headers });
      if (!res.ok) return [];
      const data = await res.json().catch(() => []);
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  async function markAllRead() {
    const headers = authHeader();
    if (!headers) return false;

    try {
      const res = await fetch("/users/me/notifications/read", {
        method: "PATCH",
        headers
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  function formatDate(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

  function safeUrl(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (value.startsWith("/")) return value;
    if (value.startsWith("http://") || value.startsWith("https://")) return value;
    return "";
  }

  function shouldSanitizeInput(el) {
    if (el instanceof HTMLTextAreaElement) return true;
    if (!(el instanceof HTMLInputElement)) return false;
    return ["text", "search", "email", "url", "tel"].includes(el.type);
  }

  function sanitizeUserText(value) {
    return String(value ?? "")
      .replace(/[<>]/g, "")
      .replace(/\bjavascript\s*:/gi, "")
      .replace(/\bon\w+\s*=/gi, "");
  }

  function renderNotifications(listEl, notifications) {
    if (!notifications.length) {
      listEl.innerHTML = '<div class="notif-empty">Sem notificações no momento.</div>';
      return;
    }

    listEl.innerHTML = notifications
      .map((n) => {
        const typeLabel = n.type === "warning"
          ? "Aviso"
          : n.type === "fine"
            ? "Multa"
            : "Intimação";

        const readClass = n.read_at ? "read" : "unread";
        const attachmentUrl = safeUrl(n.attachment_url);
        return `
          <article class="notif-item ${readClass}">
            <div class="notif-item-top">
              <strong>${typeLabel}</strong>
              <span>${esc(formatDate(n.created_at))}</span>
            </div>
            <h4>${esc(n.title || "Notificação")}</h4>
            <p>${esc(n.message || "")}</p>
            ${attachmentUrl ? `<a class="notif-attachment" href="${esc(attachmentUrl)}" target="_blank" rel="noopener noreferrer">Baixar intimação (.docx)</a>` : ""}
          </article>
        `;
      })
      .join("");
  }

  async function ensureNotificationCenter() {
    const token = localStorage.getItem("token");
    if (!token) return;

    const navLinks = document.querySelector(".glass-nav .nav-links");
    if (!navLinks || navLinks.querySelector(".notif-center")) return;

    const wrap = document.createElement("div");
    wrap.className = "notif-center";
    wrap.innerHTML = `
      <button type="button" class="notif-btn" title="Notificações" aria-label="Notificações">
        <span class="notif-icon" aria-hidden="true">✉</span>
        <span class="notif-dot" hidden></span>
      </button>
      <section class="notif-panel" hidden>
        <header class="notif-head">
          <h3>Notificações</h3>
          <button type="button" class="notif-read-all">Marcar lidas</button>
        </header>
        <div class="notif-list"></div>
      </section>
    `;

    const avatarLink = navLinks.querySelector(".nav-avatar");
    const themeBtn = navLinks.querySelector(".theme-toggle");

    if (themeBtn) themeBtn.insertAdjacentElement("afterend", wrap);
    else if (avatarLink) avatarLink.insertAdjacentElement("afterend", wrap);
    else navLinks.prepend(wrap);

    const btn = wrap.querySelector(".notif-btn");
    const dot = wrap.querySelector(".notif-dot");
    const panel = wrap.querySelector(".notif-panel");
    const listEl = wrap.querySelector(".notif-list");
    const readAllBtn = wrap.querySelector(".notif-read-all");

    const refreshDot = async () => {
      const unread = await fetchUnreadCount();
      dot.hidden = unread <= 0;
    };

    const openPanel = async () => {
      panel.hidden = false;
      const notifications = await fetchNotifications();
      renderNotifications(listEl, notifications);
    };

    const closePanel = () => {
      panel.hidden = true;
    };

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (panel.hidden) await openPanel();
      else closePanel();
    });

    panel.addEventListener("click", (e) => e.stopPropagation());

    readAllBtn.addEventListener("click", async () => {
      const ok = await markAllRead();
      if (!ok) return;
      const notifications = await fetchNotifications();
      renderNotifications(listEl, notifications);
      await refreshDot();
    });

    document.addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    await refreshDot();
    setInterval(refreshDot, 30000);
  }

  window.toggleTheme = toggleTheme;

  document.addEventListener("DOMContentLoaded", async () => {
    document.addEventListener("input", (event) => {
      const el = event.target;
      if (!shouldSanitizeInput(el)) return;
      const clean = sanitizeUserText(el.value);
      if (clean !== el.value) el.value = clean;
    });

    ensureThemeToggle();
    await ensureNotificationCenter();
  });
})();
