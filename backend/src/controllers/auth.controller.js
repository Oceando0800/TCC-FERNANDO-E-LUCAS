import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { pool } from "../db.js";

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

function isValidName(name) {
  return /^[\p{L}\s.]+$/u.test(String(name || ""));
}

const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Nome deve ter no mínimo 2 caracteres")
    .max(40, "Nome deve ter no máximo 40 caracteres")
    .refine((v) => isValidName(v), "Nome permite apenas letras, espaço e ponto"),
  cpf: z.string().min(11),
  password: z.string().min(6).max(18)
});

const loginSchema = z.object({
  cpf: z.string().min(11),
  password: z.string().min(6).max(18)
});

export async function register(req, res, next) {
  try {
    const data = registerSchema.parse(req.body);
    const normalizedName = String(data.name || "").trim();
    const cpf = normalizeCpf(data.cpf);

    if (!isValidCpf(cpf)) return res.status(400).json({ error: "CPF inválido" });

    const [exists] = await pool.query("SELECT id FROM users WHERE cpf = ?", [cpf]);
    if (exists.length) return res.status(409).json({ error: "CPF já cadastrado" });

    const [nameExists] = await pool.query(
      "SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1",
      [normalizedName]
    );
    if (nameExists.length) return res.status(409).json({ error: "Nome já cadastrado" });

    const password_hash = await bcrypt.hash(data.password, 10);

    const [result] = await pool.query(
      "INSERT INTO users (name, cpf, password_hash, role) VALUES (?, ?, ?, 'user')",
      [normalizedName, cpf, password_hash]
    );

    res.status(201).json({ id: result.insertId, name: normalizedName, cpf });
  } catch (e) {
    if (e?.name === "ZodError") {
      const first = e?.issues?.[0];
      if (first?.path?.[0] === "password") {
        return res.status(400).json({ error: "A Senha Deve Conter Entre 6 e 18 Caracteres" });
      }
      return res.status(400).json({ error: first?.message || "Dados inválidos" });
    }
    next(e);
  }
}

export async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const cpf = normalizeCpf(data.cpf);

    if (!isValidCpf(cpf)) return res.status(400).json({ error: "CPF inválido" });

    const [rows] = await pool.query(
      "SELECT id, name, cpf, password_hash, role, is_banned, banned_reason FROM users WHERE cpf = ?",
      [cpf]
    );

    if (!rows.length) return res.status(401).json({ error: "Credenciais inválidas" });

    const user = rows[0];
    if (Number(user.is_banned) === 1) {
      return res.status(403).json({
        error: user.banned_reason
          ? `Usuário banido: ${user.banned_reason}`
          : "Usuário banido por decisão administrativa"
      });
    }

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Credenciais inválidas" });

    const token = jwt.sign(
      { id: user.id, role: user.role, cpf: user.cpf, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, cpf: user.cpf, role: user.role }
    });
  } catch (e) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "A Senha Deve Conter Entre 6 e 18 Caracteres" });
    next(e);
  }
}
