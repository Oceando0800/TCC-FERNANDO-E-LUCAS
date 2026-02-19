import app from "./app.js";
import dotenv from "dotenv";
import { ensureModerationAndNotificationsSchema, ensureReportGeoColumns } from "./db.js";

dotenv.config();

const port = Number(process.env.PORT || 8080);

async function bootstrap() {
  await ensureReportGeoColumns();
  await ensureModerationAndNotificationsSchema();
  app.listen(port, () => console.log(`API on http://localhost:${port}`));
}

bootstrap().catch((err) => {
  console.error("Falha ao iniciar servidor:", err);
  process.exit(1);
});
