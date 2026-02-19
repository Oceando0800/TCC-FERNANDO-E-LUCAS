import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import usersRoutes from "./routes/users.routes.js";

const app = express();

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPath = path.join(__dirname, "..", "..", "frontend");
app.use(express.static(frontendPath));

app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

app.get("/", (req, res) => {
  res.redirect("/inicio/");
});

app.get("/inicio/", (req, res) => {
  res.sendFile(path.join(frontendPath, "inicio", "index.html"));
});

app.get("/login/", (req, res) => {
  res.sendFile(path.join(frontendPath, "login", "index.html"));
});

app.get("/cadastro/", (req, res) => {
  res.sendFile(path.join(frontendPath, "cadastro", "index.html"));
});

app.get("/admin/", (req, res) => {
  res.sendFile(path.join(frontendPath, "admin", "index.html"));
});

app.get("/mapa/", (req, res) => {
  res.redirect("/mapa_usuario/");
});

app.get("/mapa_usuario/", (req, res) => {
  res.sendFile(path.join(frontendPath, "mapa_usuario", "index.html"));
});

app.get("/mapa_admin/", (req, res) => {
  res.sendFile(path.join(frontendPath, "mapa_admin", "index.html"));
});

app.get("/perfil/", (req, res) => {
  res.sendFile(path.join(frontendPath, "perfil", "index.html"));
});

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/reports", reportsRoutes);
app.use("/users", usersRoutes);

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({ error: err.message || "Internal error" });
});

export default app;
