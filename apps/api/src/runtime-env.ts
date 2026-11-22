import "dotenv/config";
import { resolve } from "node:path";

const stage = [process.env.NODE_ENV, process.env.APP_ENV]
  .map(value => String(value || "").trim().toLowerCase());
if (stage.some(value => value === "production" || value === "staging")) {
  throw new Error("PRODUCTION NO-GO (UX-D6 / Issue #33): Sage Auto business repositories still use SQLite. Native PostgreSQL application cutover and cross-process finance certification are mandatory.");
}

if (process.env.NODE_ENV !== "test") {
  process.env.SQLITE_PATH ||= resolve(process.cwd(), ".data/carhire.sqlite");
}
