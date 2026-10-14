# Sage Auto — Demo car fleet for Rental Operations

This is fictional **development/demo inventory**, not real company stock. The
vehicle data is persisted in the canonical Fleet repositories. It appears in
**Fleet**, **Availability**, and the new **Explore cars in your rental fleet**
panel in **Rental Operations**. No bookings, live rentals, customers, deposits,
payments, maintenance records or owner-settlements are invented.

## What is included

26 sample vehicles across six classes:

- **Hatchback:** Toyota Vitz, Mazda Demio, Suzuki Swift, Honda Fit.
- **Sedan:** Toyota Axio, Nissan Sylphy, Toyota Premio, Honda Civic.
- **SUV:** Toyota Corolla Cross, Nissan X-Trail, Subaru Forester, Hyundai Tucson, Mazda CX-5, Toyota RAV4.
- **4x4 Offroad:** Suzuki Jimny, Toyota Fortuner, Land Cruiser Prado TX, Land Cruiser 300.
- **Luxury:** Mercedes-Benz C200, BMW 320i, Lexus ES 250, Mercedes-Benz E300.
- **Van/Bus:** Toyota Noah, Nissan Serena, Toyota Hiace, Nissan NV350.

Every vehicle has an invented `DEMO-xxx` plate, fake VIN, trim, seats, fuel
type, transmission, mileage, KES base daily rate, features and a locality
across Nairobi CBD, JKIA, Westlands, Karen, Mombasa, Nakuru, Naivasha or Kisumu.
The inventory is marked `ACTIVE` / `AVAILABLE` but **not published to the
customer website**. It has no genuine compliance documents. **Available** is
only a vehicle state; real date availability, compliance and pricing must still
be confirmed by their respective engines.

## Option A — View instantly in the isolated review workspace

```bash
git pull origin main
pnpm install --frozen-lockfile

# Terminal 1: creates isolated accounts and fleet data in .review/access
pnpm review:api

# Terminal 2: serves the UI on http://localhost:3510
pnpm review:web
```

Open `http://localhost:3510/`, sign in with the **Company Owner** account
from the local private `.review/access/ACCESS.md`, and choose **Rental Operations**
or **Fleet**. The review-mode API idempotently seeds all 26 cars; restarting
it does not duplicate them. Do not publish `ACCESS.md`.

## Option B — Add cars to your existing local development tenant

Use the **same** `SQLITE_PATH` that your local API uses. In development it
defaults to `.data/carhire.sqlite`. The seed command cannot modify a live
PostgreSQL server and refuses production/staging environments; still make a
copy of your local SQLite file before introducing demonstration assets.

Discover the local tenant ID (existing active tenants only):

```bash
SQLITE_PATH=.data/carhire.sqlite pnpm exec tsx -e \
  'import {TenantRepository} from "@carhire/database"; new TenantRepository().listAll().then(x=>console.log(x.map(t=>({id:t.id,name:t.name}))))'
```

Then seed the chosen tenant explicitly:

```bash
NODE_ENV=development APP_ENV=development SQLITE_PATH=.data/carhire.sqlite \
  pnpm demo:fleet -- --tenant-id=YOUR_TENANT_ID --confirm-demo
```

Reload the browser. Existing vehicles are **not edited, deleted or overwritten**;
the command skips already-existing `DEMO-xxx` plates within the target tenant.
Re-running it is safe. To view all 26, use **Show all vehicles** in Rental
Operations, and filter by category.

```bash
pnpm test:demo-fleet
pnpm typecheck
pnpm build
```

## Limitations

- KES prices are illustrative fleet base rates, **not frozen authoritative quotes**.
- Real bookings require verified customers, eligibility, rate plans and
  real compliance/availability checks. Rental Operations will not falsely show
  active on-road rentals merely because demo fleet records exist.
- Images are optional: the workspace renders category-specific art treatment
  until you attach real vehicle media in Fleet.
- Demo plates/VINs deliberately distinguish sample assets from real vehicles.
- Do not run this seed on a live production tenant or register these assets as
  actual customer-facing bookable inventory.
