import { resolve } from "node:path";

if (process.env.NODE_ENV !== "test") {
  process.env.SQLITE_PATH ||= resolve(process.cwd(), ".data/carhire.sqlite");
}
