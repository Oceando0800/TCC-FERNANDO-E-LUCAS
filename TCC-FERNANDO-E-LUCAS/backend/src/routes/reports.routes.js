import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { upload } from "../middleware/upload.middleware.js";

import {
  createReport,
  listMyReports,
  listAllReports,
  resolveReport,
  verifyReport,
  startCleanup,
  completeCleanup,
  rejectReport,
  markFalseReport,
  setUrgency,
  reportPdf,
  deleteReport,
  listMapReports,
  listReportHistory,
  listMyHistory,
  reportStats
} from "../controllers/reports.controller.js";

const router = Router();

router.post("/", requireAuth, upload.single("image"), createReport);

router.get("/me", requireAuth, listMyReports);
router.get("/me/history", requireAuth, listMyHistory);

router.get("/map", requireAuth, listMapReports);
router.get("/:id/history", requireAuth, listReportHistory);

router.get("/", requireAuth, requireAdmin, listAllReports);
router.get("/stats", requireAuth, requireAdmin, reportStats);
router.patch("/:id/resolve", requireAuth, requireAdmin, resolveReport);
router.patch("/:id/verify", requireAuth, requireAdmin, verifyReport);
router.patch("/:id/start-cleanup", requireAuth, requireAdmin, startCleanup);
router.patch("/:id/complete-cleanup", requireAuth, requireAdmin, completeCleanup);
router.patch("/:id/reject", requireAuth, requireAdmin, rejectReport);
router.patch("/:id/false", requireAuth, requireAdmin, markFalseReport);
router.patch("/:id/urgency", requireAuth, requireAdmin, setUrgency);
router.get("/report/pdf", requireAuth, requireAdmin, reportPdf);
router.delete("/:id", requireAuth, requireAdmin, deleteReport);

export default router;
