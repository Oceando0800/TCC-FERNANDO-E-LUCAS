const API_URL = "";

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function isValidCpf(cpf) {
  const raw = normalizeCpf(cpf);
  if (raw.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(raw)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(raw[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(raw[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i += 1) sum += Number(raw[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10) check = 0;
  if (check !== Number(raw[10])) return false;

  return true;
}

const rulesRequiredEl = document.getElementById("rulesRequired");
const openRulesBtn = document.getElementById("openRulesBtn");
const rulesModal = document.getElementById("rulesModal");
const rulesAcknowledge = document.getElementById("rulesAcknowledge");
const rulesContinueBtn = document.getElementById("rulesContinueBtn");
const rulesCancelBtn = document.getElementById("rulesCancelBtn");

let hasAcceptedRules = false;

function bindCpfInputMask() {
  const cpfInput = document.getElementById("cpf");
  if (!cpfInput) return;
  cpfInput.addEventListener("input", () => {
    cpfInput.value = normalizeCpf(cpfInput.value).slice(0, 11);
  });
}

function openRulesModal() {
  if (!rulesModal) return;
  rulesModal.classList.add("is-open");
  rulesModal.setAttribute("aria-hidden", "false");
}

function closeRulesModal() {
  if (!rulesModal) return;
  rulesModal.classList.remove("is-open");
  rulesModal.setAttribute("aria-hidden", "true");
}

function setRulesAccepted(accepted) {
  hasAcceptedRules = accepted;
  if (!rulesRequiredEl) return;
  rulesRequiredEl.classList.toggle("is-accepted", accepted);
}

function bindRulesFlow() {
  if (!openRulesBtn || !rulesModal || !rulesContinueBtn || !rulesAcknowledge || !rulesCancelBtn) return;

  openRulesBtn.addEventListener("click", openRulesModal);
  rulesCancelBtn.addEventListener("click", closeRulesModal);

  rulesModal.addEventListener("click", (event) => {
    if (event.target === rulesModal) closeRulesModal();
  });

  rulesContinueBtn.addEventListener("click", () => {
    if (!rulesAcknowledge.checked) {
      alert("Para continuar, marque: Eu li, e vou seguir as regras corretamente.");
      return;
    }
    setRulesAccepted(true);
    closeRulesModal();
  });
}

bindCpfInputMask();
bindRulesFlow();

document.getElementById("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = document.getElementById("name").value.trim();
  const cpfRaw = document.getElementById("cpf").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  const cpf = normalizeCpf(cpfRaw);

  if (name.length < 2) {
    alert("Informe um nome valido.");
    return;
  }

  if (!isValidCpf(cpf)) {
    alert("CPF invalido.");
    return;
  }

  if (password.length < 6 || password.length > 18) {
    alert("A senha deve conter entre 6 e 18 caracteres.");
    return;
  }

  if (password !== confirmPassword) {
    alert("As senhas nao coincidem.");
    return;
  }

  if (!hasAcceptedRules) {
    alert("Voce precisa ler e aceitar as regras do site para continuar.");
    openRulesModal();
    return;
  }

  const res = await fetch(`${API_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, cpf, password })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data.error || "Erro ao cadastrar");
    return;
  }

  alert("Cadastro realizado. Faca login.");
  window.location.href = "../login/";
});
