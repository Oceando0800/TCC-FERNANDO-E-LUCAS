import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { pool } from "../db.js";

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    const safeExt = ext.slice(0, 10);
    const uid = req.user?.id ? String(req.user.id) : "user";
    cb(null, `avatar-${uid}-${Date.now()}${safeExt}`);
  }
});

export const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) cb(new Error("Arquivo deve ser uma imagem"));
    else cb(null, true);
  }
});

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, cpf: user.cpf, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

function isValidName(name) {
  return /^[\p{L}\s.]+$/u.test(String(name || ""));
}

export async function getMe(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, cpf, role, avatar FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "UsuÃ¡rio nÃ£o encontrado" });
    return res.json(rows[0]);
  } catch (e) {
    next(e);
  }
}

export async function updateMe(req, res, next) {
  try {
    const schema = z.object({
      name: z
        .string()
        .trim()
        .min(2, "Nome deve ter no mínimo 2 caracteres")
        .max(40, "Nome deve ter no máximo 40 caracteres")
        .refine((v) => isValidName(v), "Nome permite apenas letras, espaço e ponto")
    });
    const { name } = schema.parse(req.body);

    const [dup] = await pool.query(
      "SELECT id FROM users WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id <> ? LIMIT 1",
      [name, req.user.id]
    );
    if (dup.length) return res.status(409).json({ error: "Nome já cadastrado" });

    await pool.query("UPDATE users SET name = ? WHERE id = ?", [name, req.user.id]);

    const [rows] = await pool.query(
      "SELECT id, name, cpf, role, avatar FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "UsuÃ¡rio nÃ£o encontrado" });

    const token = signToken(rows[0]);
    return res.json({ user: rows[0], token });
  } catch (e) {
    if (e?.name === "ZodError") return res.status(400).json({ error: e?.issues?.[0]?.message || "Dados inválidos" });
    next(e);
  }
}

export async function changePassword(req, res, next) {
  try {
    const schema = z.object({
      current_password: z.string().min(6).max(18),
      new_password: z.string().min(6).max(18)
    });
    const { current_password, new_password } = schema.parse(req.body);

    const [rows] = await pool.query(
      "SELECT id, name, cpf, role, password_hash, avatar FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: "UsuÃ¡rio nÃ£o encontrado" });

    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "Senha atual incorreta" });

    const password_hash = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [password_hash, req.user.id]);
    const token = signToken(rows[0]);
    return res.json({ ok: true, token });
  } catch (e) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "A Senha Deve Conter Entre 6 e 18 Caracteres" });
    next(e);
  }
}

export async function updateAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ error: "Envie um arquivo no campo 'avatar'" });

    const newPath = `/uploads/${req.file.filename}`;
    const [rows] = await pool.query("SELECT avatar FROM users WHERE id = ?", [req.user.id]);
    const old = rows?.[0]?.avatar || null;

    await pool.query("UPDATE users SET avatar = ? WHERE id = ?", [newPath, req.user.id]);

    if (old && old.startsWith("/uploads/")) {
      const oldName = old.slice("/uploads/".length);
      const oldFs = path.join(process.cwd(), "uploads", oldName);
      if (fs.existsSync(oldFs)) {
        try { fs.unlinkSync(oldFs); } catch {}
      }
    }

    const [u] = await pool.query(
      "SELECT id, name, cpf, role, avatar FROM users WHERE id = ?",
      [req.user.id]
    );
    const user = u[0];
    const token = signToken(user);
    return res.json({ user, token });
  } catch (e) {
    next(e);
  }
}

export async function listMyNotifications(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, type, title, message, attachment_url, read_at, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 40`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function countUnreadNotifications(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE user_id = ?
         AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ unread: Number(rows?.[0]?.total || 0) });
  } catch (e) {
    next(e);
  }
}

export async function markNotificationsRead(req, res, next) {
  try {
    await pool.query(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE user_id = ?
         AND read_at IS NULL`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listUsersAdmin(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, cpf, role, is_banned, banned_reason, banned_at, false_report_count, ban_count, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function banUser(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: "ID invÃ¡lido" });
    if (targetId === req.user.id) return res.status(400).json({ error: "VocÃª nÃ£o pode se banir" });

    const reason = String(req.body?.reason || "ViolaÃ§Ã£o de regras do sistema").trim().slice(0, 255);

    const [rows] = await pool.query("SELECT id, role, is_banned FROM users WHERE id = ?", [targetId]);
    if (!rows.length) return res.status(404).json({ error: "UsuÃ¡rio nÃ£o encontrado" });
    if (rows[0].role === "admin") return res.status(400).json({ error: "NÃ£o Ã© permitido banir administrador" });
    if (Number(rows[0].is_banned) === 1) return res.status(409).json({ error: "UsuÃ¡rio jÃ¡ estÃ¡ banido" });

    await pool.query(
      "UPDATE users SET is_banned = 1, banned_reason = ?, banned_at = NOW(), ban_count = COALESCE(ban_count, 0) + 1 WHERE id = ?",
      [reason, targetId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function unbanUser(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    if (!Number.isFinite(targetId)) return res.status(400).json({ error: "ID invÃ¡lido" });

    const [rows] = await pool.query("SELECT id, role, is_banned FROM users WHERE id = ?", [targetId]);
    if (!rows.length) return res.status(404).json({ error: "UsuÃ¡rio nÃ£o encontrado" });
    if (rows[0].role === "admin") return res.status(400).json({ error: "OperaÃ§Ã£o invÃ¡lida para admin" });
    if (Number(rows[0].is_banned) === 0) return res.status(409).json({ error: "UsuÃ¡rio nÃ£o estÃ¡ banido" });

    await pool.query(
      "UPDATE users SET is_banned = 0, banned_reason = NULL, banned_at = NULL WHERE id = ?",
      [targetId]
    );

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

