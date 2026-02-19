import { pool } from "../db.js";
import PDFDocument from "pdfkit";
import { AlignmentType, Document, Packer, Paragraph, TextRun } from "docx";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "..", "..", "uploads");
const notificationsDir = path.join(uploadsDir, "notifications");
const MAX_TITLE_LENGTH = 30;
const TITLE_EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\u200D|\uFE0F)/u;

function titleHasEmoji(value) {
  return TITLE_EMOJI_REGEX.test(String(value || ""));
}

function hasScriptLikeInput(value) {
  const text = String(value || "");
  return /[<>]/.test(text) || /\bjavascript\s*:/i.test(text) || /\bon\w+\s*=/i.test(text);
}


function safeNumber(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

async function geocodeAddress(address) {
  try {
    if (!address || !address.trim()) return { lat: null, lng: null };
    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" +
      encodeURIComponent(address);
    const r = await globalThis.fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "SCDRI-TCC/1.0 (school project)"
      }
    });

    if (!r.ok) return { lat: null, lng: null };

    const data = await r.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) return { lat: null, lng: null };

    const lat = safeNumber(data[0].lat);
    const lng = safeNumber(data[0].lon);

    return { lat, lng };
  } catch {
    return { lat: null, lng: null };
  }
}

async function backfillMissingGeo(limit = 20) {
  const [rows] = await pool.query(
    `SELECT id, location
     FROM reports
     WHERE (lat IS NULL OR lng IS NULL)
       AND location IS NOT NULL
       AND TRIM(location) <> ''
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );

  for (const row of rows) {
    const geo = await geocodeAddress(row.location);
    if (geo.lat == null || geo.lng == null) continue;

    await pool.query("UPDATE reports SET lat = ?, lng = ? WHERE id = ?", [
      geo.lat,
      geo.lng,
      row.id
    ]);
  }
}

function urgLabel(u) {
  if (u === "high") return "ALTA";
  if (u === "medium") return "M\u00c9DIA";
  return "BAIXA";
}

async function createNotification(userId, type, title, message, attachmentUrl = null) {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, attachment_url)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, type, title, message, attachmentUrl]
  );
}

async function logReportHistory({ reportId, changedBy = null, action, fromStatus = null, toStatus = null, note = null }) {
  await pool.query(
    `INSERT INTO report_history (report_id, changed_by, action, from_status, to_status, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportId, changedBy, action, fromStatus, toStatus, note]
  );
}

function extractCityFromLocation(location) {
  const text = String(location || "").trim();
  if (!text) return null;

  // 1) Prefer pattern "Cidade - UF" or "Cidade/UF"
  const cityUfMatch = text.match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s.'-]{1,})\s*[-/]\s*[A-Z]{2}\b/);
  if (cityUfMatch?.[1]) {
    const byUf = cityUfMatch[1].trim();
    if (/[A-Za-zÀ-ÿ]/.test(byUf)) return byUf;
  }

  // 2) Remove CEP snippets and inspect comma-separated chunks from right to left
  const withoutCep = text.replace(/CEP[:\s-]*\d{5}-?\d{3}/gi, " ");
  const parts = withoutCep.split(",").map((p) => p.trim()).filter(Boolean);

  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const raw = parts[i];
    const candidate = raw.split("-")[0].split("/")[0].trim();
    if (!candidate) continue;
    if (!/[A-Za-zÀ-ÿ]/.test(candidate)) continue;
    if (/^\d+$/.test(candidate)) continue;
    if (/^CEP\b/i.test(candidate)) continue;
    return candidate;
  }

  return null;
}

async function generateSummonsDocx(userCpf, cityName) {
  fs.mkdirSync(notificationsDir, { recursive: true });

  const now = new Date();
  const cpfText = String(userCpf || "").trim() || "NAO INFORMADO";
  const cityText = String(cityName || "").trim() || "Municipio";

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: "INTIMACAO OFICIAL", bold: true, size: 34 })]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: `Fica o portador do CPF ${cpfText} intimado a comparecer ao orgao competente para prestar esclarecimentos sobre reincidencia de denuncias falsas registradas no sistema SCDRI.`,
              size: 24
            })
          ]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [new TextRun({ text: "Prazo para comparecimento: 10 dias corridos.", bold: true, size: 24 })]
        }),
        new Paragraph({
          children: [new TextRun({ text: "Data de emissao: " + now.toLocaleDateString("pt-BR"), size: 24 })]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [new TextRun({ text: "______________________________________________", size: 22 })]
        }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `Prefeitura de ${cityText}`, italics: true, size: 22 })]
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [new TextRun({ text: "______________________________________________", size: 22 })]
        }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [new TextRun({ text: "Assinatura do usuario", italics: true, size: 22 })]
        })
      ]
    }]
  });

  const fileName = `intimacao-${Date.now()}.docx`;
  const filePath = path.join(notificationsDir, fileName);
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);

  return `/uploads/notifications/${fileName}`;
}

function getRange(period) {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (period === "daily") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
  } else if (period === "weekly") {
    const day = (now.getDay() + 6) % 7;
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (period === "monthly") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setMonth(0, 1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(11, 31);
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}


export async function createReport(req, res, next) {
  try {
    const schema = z.object({
      title: z
        .string()
        .trim()
        .min(1, "Título é obrigatório")
        .max(MAX_TITLE_LENGTH, `Título deve ter no máximo ${MAX_TITLE_LENGTH} caracteres`)
        .refine((v) => !titleHasEmoji(v), "Título não pode conter emoji")
        .refine((v) => !hasScriptLikeInput(v), "Título contém conteúdo não permitido"),
      description: z
        .string()
        .min(10)
        .max(500)
        .refine((v) => !hasScriptLikeInput(v), "Descrição contém conteúdo não permitido"),
      location: z
        .string()
        .optional()
        .refine((v) => !v || !hasScriptLikeInput(v), "Local contém conteúdo não permitido"),
      category: z.enum(["entulho", "domestico", "industrial"]).optional(),
      lat: z.coerce.number().nullable().optional(),
      lng: z.coerce.number().nullable().optional()
    });

    const data = schema.parse(req.body);
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    const geocoded = await geocodeAddress(data.location || "");
    const finalLat = safeNumber(data.lat) ?? geocoded.lat;
    const finalLng = safeNumber(data.lng) ?? geocoded.lng;

    const [result] = await pool.query(
      `INSERT INTO reports (user_id, title, category, description, location, image, lat, lng)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        data.title,
        data.category || "industrial",
        data.description,
        data.location || null,
        image,
        finalLat,
        finalLng
      ]
    );

    const [rows] = await pool.query("SELECT * FROM reports WHERE id = ?", [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
}


export async function listMyReports(req, res, next) {
  try {
    const status = req.query.status ? String(req.query.status) : null;

    const allowed = new Set(["open", "verifying", "in_progress", "resolved", "rejected"]);
    let sql = "SELECT * FROM reports WHERE user_id = ?";
    const params = [req.user.id];

    if (status) {
      if (!allowed.has(status)) return res.status(400).json({ error: "Status invÃƒÂ¡lido" });
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC";
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}


export async function listMapReports(req, res, next) {
  try {
    await backfillMissingGeo(20);

    const [rows] = await pool.query(
      `SELECT r.id, r.title, r.description, r.location, r.status, r.urgency, r.image, r.lat, r.lng, r.created_at, u.name AS user_name
       FROM reports r
       JOIN users u ON u.id = r.user_id
       WHERE r.lat IS NOT NULL AND r.lng IS NOT NULL
       ORDER BY r.created_at DESC`
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}


export async function listAllReports(req, res, next) {
  try {
    const q = String(req.query.q || "").trim();
    const author = String(req.query.author || "").trim();
    const location = String(req.query.location || "").trim();
    const status = String(req.query.status || "").trim();
    const urgency = String(req.query.urgency || "").trim();
    const category = String(req.query.category || "").trim();
    const district = String(req.query.district || "").trim();
    const address = String(req.query.address || "").trim();

    const clauses = [];
    const params = [];

    if (q) {
      clauses.push("(r.title LIKE ? OR r.description LIKE ? OR r.location LIKE ? OR u.name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (author) {
      clauses.push("u.name LIKE ?");
      params.push(`%${author}%`);
    }
    if (location) {
      clauses.push("r.location LIKE ?");
      params.push(`%${location}%`);
    }
    if (status) {
      clauses.push("r.status = ?");
      params.push(status);
    }
    if (urgency) {
      if (urgency === "null") {
        clauses.push("r.status = 'open'");
      } else {
        clauses.push("r.urgency = ?");
        params.push(urgency);
      }
    }
    if (category) {
      clauses.push("r.category = ?");
      params.push(category);
    }
    if (district) {
      clauses.push("r.location LIKE ?");
      params.push(`%${district}%`);
    }
    if (address) {
      clauses.push("r.location LIKE ?");
      params.push(`%${address}%`);
    }

    const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT r.*, u.name AS user_name
       FROM reports r
       JOIN users u ON u.id = r.user_id
       ${whereSql}
       ORDER BY r.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}


export async function resolveReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    const [beforeRows] = await pool.query("SELECT status FROM reports WHERE id = ?", [id]);
    const fromStatus = beforeRows?.[0]?.status || null;
    await pool.query("UPDATE reports SET status = 'resolved' WHERE id = ?", [id]);
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "resolve_direct",
      fromStatus,
      toStatus: "resolved",
      note: "Encerramento direto"
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function verifyReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalido" });

    const [rows] = await pool.query("SELECT id, status FROM reports WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Denuncia nao encontrada" });

    if (rows[0].status !== "open") {
      return res.status(400).json({ error: "So denuncias pendentes podem ir para verificacao" });
    }

    await pool.query(
      "UPDATE reports SET status = 'verifying', reviewed_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "verify",
      fromStatus: "open",
      toStatus: "verifying",
      note: "Denuncia em verificacao"
    });

    res.json({ ok: true, status: "verifying" });
  } catch (e) {
    next(e);
  }
}


export async function startCleanup(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalido" });

    const [rows] = await pool.query("SELECT id, status FROM reports WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Denuncia nao encontrada" });

    if (rows[0].status !== "verifying") {
      return res.status(400).json({ error: "A denuncia precisa estar em verificacao para ir para em andamento" });
    }

    await pool.query(
      "UPDATE reports SET status = 'in_progress', reviewed_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "finish_verification",
      fromStatus: "verifying",
      toStatus: "in_progress",
      note: "Verificacao finalizada"
    });
    res.json({ ok: true, status: "in_progress" });
  } catch (e) {
    next(e);
  }
}


export async function completeCleanup(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalido" });

    const [rows] = await pool.query("SELECT id, status FROM reports WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "Denuncia nao encontrada" });

    if (rows[0].status !== "in_progress") {
      return res.status(400).json({ error: "A denuncia precisa estar em andamento para concluir" });
    }

    await pool.query(
      "UPDATE reports SET status = 'resolved', reviewed_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "complete_cleanup",
      fromStatus: "in_progress",
      toStatus: "resolved",
      note: "Limpeza realizada"
    });
    res.json({ ok: true, status: "resolved" });
  } catch (e) {
    next(e);
  }
}


export async function rejectReport(req, res, next) {
  try {
    const schema = z.object({
      reason: z.string().min(5).max(255)
    });
    const { reason } = schema.parse(req.body);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invÃƒÂ¡lido" });

    const [rows] = await pool.query("SELECT id, status FROM reports WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "DenÃƒÂºncia nÃƒÂ£o encontrada" });
    if (rows[0].status === "resolved") {
      return res.status(400).json({ error: "NÃƒÂ£o dÃƒÂ¡ pra rejeitar uma denÃƒÂºncia resolvida" });
    }

    await pool.query(
      "UPDATE reports SET status = 'rejected', reject_reason = ?, reviewed_by = ? WHERE id = ?",
      [reason, req.user.id, id]
    );
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "reject",
      fromStatus: rows[0].status,
      toStatus: "rejected",
      note: reason
    });

    res.json({ ok: true });
  } catch (e) {
    if (e?.name === "ZodError") return res.status(400).json({ error: "Payload invÃƒÂ¡lido" });
    next(e);
  }
}


export async function markFalseReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invalido" });

    const [rows] = await pool.query(
      "SELECT id, user_id, title, status, marked_false FROM reports WHERE id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Denuncia nao encontrada" });

    const report = rows[0];
    if (Number(report.marked_false) === 1) {
      return res.status(409).json({ error: "Essa denuncia ja foi marcada como falsa" });
    }

    await pool.query(
      "UPDATE reports SET status = 'rejected', marked_false = 1, reject_reason = COALESCE(reject_reason, 'Denuncia falsa'), reviewed_by = ? WHERE id = ?",
      [req.user.id, id]
    );
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "mark_false",
      fromStatus: report.status,
      toStatus: "rejected",
      note: "Denuncia falsa"
    });

    const [users] = await pool.query(
      "SELECT id, cpf, false_report_count FROM users WHERE id = ?",
      [report.user_id]
    );
    if (!users.length) return res.status(404).json({ error: "Autor da denuncia nao encontrado" });

    const currentCount = Number(users[0].false_report_count || 0);
    const nextCount = currentCount + 1;

    await pool.query(
      "UPDATE users SET false_report_count = ? WHERE id = ?",
      [nextCount, report.user_id]
    );

    let type = "warning";
    let title = "Aviso por denuncia falsa";
    let message =
      `Sua denuncia "${report.title}" foi analisada como falsa. Este e um aviso oficial.`;

    let attachmentUrl = null;

    if (nextCount === 2) {
      type = "fine";
      title = "Multa administrativa";
      message =
        `Sua segunda denuncia falsa foi registrada. Uma multa administrativa foi aplicada.`;
    } else if (nextCount >= 3) {
      type = "summons";
      title = "Intimacao oficial";
      message =
        `Foi registrada sua ${nextCount}a denuncia falsa. Voce recebeu uma intimacao oficial para comparecimento.`;
      attachmentUrl = await generateSummonsDocx(
        users[0].cpf,
        extractCityFromLocation(report.location)
      );
    }

    await createNotification(report.user_id, type, title, message, attachmentUrl);

    res.json({ ok: true, false_report_count: nextCount, notification_type: type });
  } catch (e) {
    next(e);
  }
}


export async function setUrgency(req, res, next) {
  try {
    const schema = z.object({
      urgency: z.enum(["low", "medium", "high"])
    });

    const { urgency } = schema.parse(req.body);
    const id = Number(req.params.id);

    await pool.query("UPDATE reports SET urgency = ? WHERE id = ?", [urgency, id]);
    await logReportHistory({
      reportId: id,
      changedBy: req.user.id,
      action: "set_urgency",
      note: `Urgencia definida para ${urgency}`
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}


export async function deleteReport(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invÃƒÂ¡lido" });

    const [rows] = await pool.query("SELECT image, status FROM reports WHERE id = ?", [id]);
    if (!rows.length) return res.status(404).json({ error: "DenÃƒÂºncia nÃƒÂ£o encontrada" });

    const image = rows[0].image;

    await pool.query("DELETE FROM report_history WHERE report_id = ?", [id]);
    await pool.query("DELETE FROM reports WHERE id = ?", [id]);
    if (image) {
      const filename = String(image).split("/uploads/")[1] || "";
      if (filename) {
        const imgPath = path.join(uploadsDir, filename);
        if (fs.existsSync(imgPath)) {
          try { fs.unlinkSync(imgPath); } catch {}
        }
      }
    }

    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listReportHistory(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "ID invÃ¡lido" });

    if (req.user.role !== "admin") {
      const [ownRows] = await pool.query("SELECT user_id FROM reports WHERE id = ?", [id]);
      if (!ownRows.length) return res.status(404).json({ error: "DenÃºncia nÃ£o encontrada" });
      if (Number(ownRows[0].user_id) !== Number(req.user.id)) {
        return res.status(403).json({ error: "Sem permissÃ£o para este histÃ³rico" });
      }
    }

    const [rows] = await pool.query(
      `SELECT h.*, u.name AS changed_by_name
       FROM report_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.report_id = ?
       ORDER BY h.created_at DESC`,
      [id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listMyHistory(req, res, next) {
  try {
    const [rows] = await pool.query(
      `SELECT h.*, r.title, r.id AS report_id, u.name AS changed_by_name
       FROM report_history h
       JOIN reports r ON r.id = h.report_id
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE r.user_id = ?
       ORDER BY h.created_at DESC
       LIMIT 120`,
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function reportStats(req, res, next) {
  try {
    const [byCategory] = await pool.query(
      `SELECT category, COUNT(*) AS total
       FROM reports
       GROUP BY category`
    );

    const [byStatus] = await pool.query(
      `SELECT status, COUNT(*) AS total
       FROM reports
       GROUP BY status`
    );

    const [byRegionRaw] = await pool.query(
      `SELECT location, COUNT(*) AS total
       FROM reports
       GROUP BY location`
    );

    const byCityMap = new Map();
    byRegionRaw.forEach((r) => {
      const city = extractCityFromLocation(r.location) || "Nao informado";
      byCityMap.set(city, (byCityMap.get(city) || 0) + Number(r.total || 0));
    });

    const byRegion = Array.from(byCityMap.entries())
      .map(([region, total]) => ({ region, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);

    res.json({ byCategory, byStatus, byRegion });
  } catch (e) {
    next(e);
  }
}


export async function reportPdf(req, res, next) {
  try {
    const period = String(req.query.period || "monthly");
    const { start, end } = getRange(period);

    const [rows] = await pool.query(
      `SELECT r.*, u.name AS user_name, u.cpf AS user_cpf
       FROM reports r
       JOIN users u ON u.id = r.user_id
       WHERE r.created_at BETWEEN ? AND ?
       ORDER BY FIELD(r.urgency,'high','medium','low'), r.created_at DESC`,
      [start, end]
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="relatorio-${period}.pdf"`);

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    const formatDate = (date) =>
      new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date).toUpperCase();
    const ensureSpace = (heightNeeded = 120) => {
      const available = doc.page.height - doc.page.margins.bottom - doc.y;
      if (available < heightNeeded) doc.addPage();
    };

    const startText = formatDate(start);
    const endText = formatDate(end);
    const imgSize = 150;

    doc.fontSize(18).text("Relat\u00f3rio de Den\u00fancias", { align: "center" });
    doc.moveDown(0.7);
    doc.fontSize(12).text(`DE: ${startText}  AT\u00c9: ${endText}`);
    doc.moveDown(0.8);

    if (!rows.length) {
      doc.fontSize(11).text("Nenhuma den\u00fancia no per\u00edodo selecionado.");
      doc.moveDown();
    }

    rows.forEach((r, i) => {
      ensureSpace(290);

      doc.fontSize(13).text(`Den\u00fancia ${i + 1}: ${r.title || "-"}`);
      doc.fontSize(10).text(`Urg\u00eancia: ${urgLabel(r.urgency)}   Status: ${String(r.status || "-").toUpperCase()}`);
      doc.text(`Autor: ${r.user_name || "-"} (CPF: ${r.user_cpf || "-"})`);
      if (r.location) doc.text(`Local: ${r.location}`);
      doc.text(`Data: ${new Date(r.created_at).toLocaleString("pt-BR")}`);
      doc.moveDown(0.35);

      if (r.image) {
        const filename = String(r.image).split("/uploads/")[1] || "";
        const ext = path.extname(filename).toLowerCase();
        const supported = [".jpg", ".jpeg", ".png"];

        if (!filename) {
          doc.fontSize(10).fillColor("red").text("Imagem inv\u00e1lida").fillColor("black");
          doc.moveDown(0.6);
        } else if (!supported.includes(ext)) {
          doc.fontSize(10)
            .fillColor("red")
            .text(`Imagem n\u00e3o suportada (${ext.replace(".", "").toUpperCase() || "desconhecida"})`)
            .fillColor("black");
          doc.moveDown(0.6);
        } else {
          const imgPath = path.join(uploadsDir, filename);

          if (fs.existsSync(imgPath)) {
            try {
              ensureSpace(imgSize + 40);
              const imageX = doc.x;
              const imageY = doc.y;
              doc.image(imgPath, imageX, imageY, { fit: [imgSize, imgSize], align: "left", valign: "top" });
              doc.rect(imageX, imageY, imgSize, imgSize).stroke("#bdbdbd");
              doc.y = imageY + imgSize + 8;
              doc.moveDown(0.6);
            } catch {
              doc.fontSize(10).fillColor("red").text("Erro ao carregar a imagem").fillColor("black");
              doc.moveDown(0.6);
            }
          } else {
            doc.fontSize(10).fillColor("red").text("Imagem n\u00e3o encontrada no servidor").fillColor("black");
            doc.moveDown(0.6);
          }
        }
      }

      doc.fontSize(11).text(`Descri\u00e7\u00e3o: ${r.description || "-"}`, { width: 520 });

      doc.moveDown();
      doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
      doc.moveDown();
    });

    ensureSpace(40);
    doc.fontSize(12).text(`TOTAL: ${rows.length}`);

    doc.end();
  } catch (e) {
    next(e);
  }
}


