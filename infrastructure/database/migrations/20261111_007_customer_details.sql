-- Complete the staged customer shape before enabling the normalized repository.
-- Apply to an empty staging schema: incomplete earlier snapshots must be rebuilt
-- from source, not filled with invented identity/contact details.
ALTER TABLE rental_domain.customers
  ADD COLUMN customer_type text NOT NULL CHECK (customer_type IN ('INDIVIDUAL','CORPORATE_AFFILIATED','VIP')),
  ADD COLUMN email text NOT NULL CHECK (length(trim(email)) > 0),
  ADD COLUMN phone text NOT NULL CHECK (length(regexp_replace(phone,'[^0-9]','','g')) > 0),
  ADD COLUMN id_or_passport_number text NOT NULL CHECK (length(trim(id_or_passport_number)) > 0),
  ADD COLUMN tax_pin_number text,
  ADD COLUMN license_number text NOT NULL CHECK (length(trim(license_number)) > 0),
  ADD COLUMN license_expiry_date date NOT NULL,
  ADD COLUMN nationality text,
  ADD COLUMN address text,
  ADD COLUMN city text,
  ADD COLUMN country text,
  ADD COLUMN verification_status text NOT NULL CHECK (verification_status IN ('UNVERIFIED','PENDING_VERIFICATION','VERIFIED','REJECTED')),
  ADD COLUMN corporate_account_id rental_domain.record_id,
  ADD COLUMN total_rentals_count integer NOT NULL CHECK (total_rentals_count >= 0),
  ADD COLUMN rating double precision CHECK (rating >= 0 AND rating <= 5),
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text,
  ADD COLUMN emergency_contact_relationship text,
  ADD COLUMN notes text,
  ADD COLUMN version integer NOT NULL CHECK (version > 0),
  ADD COLUMN created_at timestamptz NOT NULL,
  ADD COLUMN updated_at timestamptz,
  ADD CONSTRAINT customer_status CHECK (status IN ('ACTIVE','RESTRICTED','BLOCKED','INACTIVE'));
CREATE UNIQUE INDEX customer_email_per_tenant ON rental_domain.customers(tenant_id,lower(trim(email)));
CREATE UNIQUE INDEX customer_phone_per_tenant ON rental_domain.customers(tenant_id,regexp_replace(phone,'[^0-9]','','g'));
CREATE UNIQUE INDEX customer_identity_per_tenant ON rental_domain.customers(tenant_id,lower(trim(id_or_passport_number)));
CREATE UNIQUE INDEX customer_license_per_tenant ON rental_domain.customers(tenant_id,lower(trim(license_number)));
CREATE TABLE rental_domain.customer_tags (
  tenant_id rental_domain.record_id NOT NULL,
  customer_id rental_domain.record_id NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  tag text NOT NULL,
  PRIMARY KEY (tenant_id,customer_id,position),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES rental_domain.customers(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE rental_domain.customer_numbers (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  year integer NOT NULL CHECK (year BETWEEN 1 AND 9999),
  last_value bigint NOT NULL CHECK (last_value >= 0 AND last_value <= 9007199254740991),
  PRIMARY KEY (tenant_id,year)
);
ALTER TABLE rental_domain.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_domain.customer_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON rental_domain.customer_tags
 USING (tenant_id=NULLIF(current_setting('app.current_tenant_id',true),''))
 WITH CHECK (tenant_id=NULLIF(current_setting('app.current_tenant_id',true),''));
ALTER TABLE rental_domain.customer_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE rental_domain.customer_numbers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON rental_domain.customer_numbers
 USING (tenant_id=NULLIF(current_setting('app.current_tenant_id',true),''))
 WITH CHECK (tenant_id=NULLIF(current_setting('app.current_tenant_id',true),''));
REVOKE ALL ON rental_domain.customer_tags,rental_domain.customer_numbers FROM PUBLIC;
