const API_URL = "";

function normalizeCpf(cpf) {
  return String(cpf || "").replace(/\D/g, "");
}

function bindCpfInputMask() {
  const cpfInput = document.getElementById("cpf");
  if (!cpfInput) return;
  cpfInput.addEventListener("input", () => {
    cpfInput.value = normalizeCpf(cpfInput.value).slice(0, 11);
  });
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

bindCpfInputMask();

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  const cpfRaw = document.getElementById("cpf").value;
  const password = document.getElementById("password").value;

  const cpf = normalizeCpf(cpfRaw);

  if (!isValidCpf(cpf)) {
    alert("CPF inválido.");
    return;
  }

  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpf, password })
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    alert(data.error || "Login inválido");
    return;
  }

  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));

  window.location.href = data.user.role === "admin" ? "../admin/" : "../inicio/";
});
