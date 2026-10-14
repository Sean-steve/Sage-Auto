/**
 * Explicit local-dev-only entrypoint to add canonical demo vehicle records to
 * an EXISTING tenant. Never run against live customer/production databases.
 *
 * NODE_ENV=development SQLITE_PATH=.local/sage.sqlite \
 * pnpm demo:fleet -- --tenant-id=<tenant UUID> --confirm-demo
 */
import { resolve, relative, isAbsolute } from "node:path";
import { seedDemoFleetForTenant, DEMO_FLEET } from "./demo-fleet";

async function main() {
  const args=process.argv.slice(2).filter(a=>a!=="--");
  const tenantId=args.find(a=>a.startsWith("--tenant-id="))?.slice("--tenant-id=".length);
  if(!tenantId || !args.includes("--confirm-demo"))
    throw new Error("Specify --tenant-id=<existing tenant ID> --confirm-demo. No records were changed.");
  if(["production","staging"].includes(process.env.NODE_ENV||"") ||
     ["production","staging"].includes(process.env.APP_ENV||""))
    throw new Error("Refusing to seed demo vehicles in staging or production.");
  const db=process.env.SQLITE_PATH;
  if(!db || db===":memory:")
    throw new Error("Set SQLITE_PATH to your local development SQLite database. Refusing an ephemeral or missing database.");
  // Explicit local-only opt-in: prevents accidental seeding of network, hosted
  // PostgreSQL or an unrecognized store behind a production API.
  if(!db.endsWith(".sqlite") && !db.endsWith(".db"))
    throw new Error("Only a local SQLite .sqlite/.db file is supported.");
  const {TenantRepository}=await import("@carhire/database");
  const tenant=await new TenantRepository().findById(tenantId);
  if(!tenant || tenant.deletedAt || tenant.status!=="ACTIVE")
    throw new Error("The specified active tenant does not exist. No demo vehicles were created.");
  const result=await seedDemoFleetForTenant(tenantId);
  console.log(`Demo fleet: ${result.created} created, ${result.skipped} already present (${DEMO_FLEET.length} catalogue vehicles). Tenant: ${tenant.name}.`);
  console.log("These are fictional demonstration assets. Compliance and calendar availability still govern rentals.");
}
main().catch((error:Error)=>{console.error("Demo fleet seed blocked:",error.message);process.exitCode=1;});
