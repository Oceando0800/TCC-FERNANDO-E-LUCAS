import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

import {
  getMe,
  updateMe,
  changePassword,
  updateAvatar,
  avatarUpload,
  listMyNotifications,
  countUnreadNotifications,
  markNotificationsRead,
  listUsersAdmin,
  banUser,
  unbanUser
} from "../controllers/users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMe);
router.patch("/me", requireAuth, updateMe);
router.patch("/me/password", requireAuth, changePassword);
router.patch("/me/avatar", requireAuth, avatarUpload.single("avatar"), updateAvatar);
router.get("/me/notifications", requireAuth, listMyNotifications);
router.get("/me/notifications/unread-count", requireAuth, countUnreadNotifications);
router.patch("/me/notifications/read", requireAuth, markNotificationsRead);
router.get("/", requireAuth, requireAdmin, listUsersAdmin);
router.patch("/:id/ban", requireAuth, requireAdmin, banUser);
router.patch("/:id/unban", requireAuth, requireAdmin, unbanUser);

export default router;
