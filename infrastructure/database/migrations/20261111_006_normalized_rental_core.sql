-- Additive normalized core. No cutover or deletion of compatibility records.
-- Runtime must use a non-owner, NOSUPERUSER NOBYPASSRLS role and transaction-local
-- app.current_tenant_id. There is deliberately no session-variable bypass.
CREATE SCHEMA rental_domain;
CREATE DOMAIN rental_domain.record_id AS text CHECK (length(VALUE) BETWEEN 1 AND 200);
CREATE DOMAIN rental_domain.currency_code AS text CHECK (VALUE ~ '^[A-Z]{3}$');
CREATE DOMAIN rental_domain.money AS numeric(19,4)
  CHECK (VALUE > '-Infinity'::numeric AND VALUE < 'Infinity'::numeric);

CREATE TABLE rental_domain.tenants (
  tenant_id rental_domain.record_id PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  slug text NOT NULL UNIQUE,
  currency rental_domain.currency_code NOT NULL
);
CREATE TABLE rental_domain.customers (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL,
  customer_number text NOT NULL,
  full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
  status text NOT NULL,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,customer_number)
);
CREATE TABLE rental_domain.vehicles (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL,
  registration_plate text NOT NULL,
  make text NOT NULL, model text NOT NULL,
  odometer bigint NOT NULL CHECK (odometer >= 0),
  fuel_level numeric(7,4) NOT NULL CHECK (fuel_level BETWEEN 0 AND 100),
  lifecycle_status text NOT NULL, availability_status text NOT NULL,
  PRIMARY KEY (tenant_id,id)
);
CREATE UNIQUE INDEX vehicle_plate_per_tenant ON rental_domain.vehicles(tenant_id,lower(trim(registration_plate)));
CREATE TABLE rental_domain.bookings (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL,
  booking_number text NOT NULL,
  customer_id rental_domain.record_id NOT NULL,
  assigned_vehicle_id rental_domain.record_id,
  pickup_at timestamptz NOT NULL, return_at timestamptz NOT NULL,
  currency rental_domain.currency_code NOT NULL,
  gross_total rental_domain.money NOT NULL CHECK (gross_total >= 0),
  deposit_required rental_domain.money NOT NULL CHECK (deposit_required >= 0),
  status text NOT NULL,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,booking_number),
  UNIQUE (tenant_id,id,customer_id),
  CHECK (return_at > pickup_at),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES rental_domain.customers(tenant_id,id),
  FOREIGN KEY (tenant_id,assigned_vehicle_id) REFERENCES rental_domain.vehicles(tenant_id,id)
);
CREATE TABLE rental_domain.rentals (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL,
  rental_number text NOT NULL,
  booking_id rental_domain.record_id NOT NULL,
  customer_id rental_domain.record_id NOT NULL,
  vehicle_id rental_domain.record_id NOT NULL,
  scheduled_start timestamptz NOT NULL, scheduled_end timestamptz NOT NULL,
  actual_start timestamptz, actual_end timestamptz,
  checkout_odometer bigint NOT NULL CHECK (checkout_odometer >= 0),
  return_odometer bigint,
  state text NOT NULL,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,rental_number),
  UNIQUE (tenant_id,booking_id), UNIQUE (tenant_id,id,customer_id),
  CHECK (scheduled_end > scheduled_start),
  CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start),
  CHECK (return_odometer IS NULL OR return_odometer >= checkout_odometer),
  FOREIGN KEY (tenant_id,booking_id,customer_id) REFERENCES rental_domain.bookings(tenant_id,id,customer_id),
  FOREIGN KEY (tenant_id,vehicle_id) REFERENCES rental_domain.vehicles(tenant_id,id)
);
CREATE TABLE rental_domain.invoices (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL, invoice_number text NOT NULL,
  customer_id rental_domain.record_id NOT NULL,
  booking_id rental_domain.record_id, rental_id rental_domain.record_id,
  currency rental_domain.currency_code NOT NULL, status text NOT NULL,
  subtotal rental_domain.money NOT NULL CHECK (subtotal >= 0),
  tax_total rental_domain.money NOT NULL CHECK (tax_total >= 0),
  total rental_domain.money NOT NULL CHECK (total >= 0),
  amount_paid rental_domain.money NOT NULL CHECK (amount_paid >= 0),
  amount_credited rental_domain.money NOT NULL CHECK (amount_credited >= 0),
  amount_outstanding rental_domain.money NOT NULL CHECK (amount_outstanding >= 0),
  version integer NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,invoice_number), UNIQUE (tenant_id,id,currency),
  CHECK (total = subtotal + tax_total),
  CHECK (total = amount_paid + amount_credited + amount_outstanding),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES rental_domain.customers(tenant_id,id),
  FOREIGN KEY (tenant_id,booking_id,customer_id) REFERENCES rental_domain.bookings(tenant_id,id,customer_id),
  FOREIGN KEY (tenant_id,rental_id,customer_id) REFERENCES rental_domain.rentals(tenant_id,id,customer_id)
);
CREATE TABLE rental_domain.invoice_lines (
  tenant_id rental_domain.record_id NOT NULL,
  id rental_domain.record_id NOT NULL, invoice_id rental_domain.record_id NOT NULL,
  line_type text NOT NULL, description text NOT NULL,
  quantity numeric(19,4) NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric),
  unit_price rental_domain.money NOT NULL,
  net_amount rental_domain.money NOT NULL, tax_amount rental_domain.money NOT NULL,
  gross_amount rental_domain.money NOT NULL, sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,id), CHECK (gross_amount = net_amount + tax_amount),
  FOREIGN KEY (tenant_id,invoice_id) REFERENCES rental_domain.invoices(tenant_id,id)
);
CREATE TABLE rental_domain.payments (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL, payment_number text NOT NULL,
  purpose text NOT NULL, direction text NOT NULL CHECK (direction IN ('INBOUND','OUTBOUND')),
  currency rental_domain.currency_code NOT NULL, provider text NOT NULL,
  provider_transaction_id text NOT NULL, status text NOT NULL,
  amount rental_domain.money NOT NULL CHECK (amount > 0),
  allocated_amount rental_domain.money NOT NULL CHECK (allocated_amount >= 0),
  unallocated_amount rental_domain.money NOT NULL CHECK (unallocated_amount >= 0),
  refunded_amount rental_domain.money NOT NULL CHECK (refunded_amount >= 0),
  version integer NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,payment_number), UNIQUE (tenant_id,id,purpose,currency),
  CHECK (amount = allocated_amount + unallocated_amount), CHECK (refunded_amount <= amount)
);
CREATE UNIQUE INDEX payment_provider_reference ON rental_domain.payments(tenant_id,provider,lower(provider_transaction_id));
CREATE TABLE rental_domain.deposits (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  id rental_domain.record_id NOT NULL,
  customer_id rental_domain.record_id NOT NULL, booking_id rental_domain.record_id, rental_id rental_domain.record_id,
  currency rental_domain.currency_code NOT NULL, status text NOT NULL,
  required_amount rental_domain.money NOT NULL CHECK (required_amount >= 0),
  received_amount rental_domain.money NOT NULL CHECK (received_amount >= 0),
  held_amount rental_domain.money NOT NULL CHECK (held_amount >= 0),
  applied_amount rental_domain.money NOT NULL CHECK (applied_amount >= 0),
  refund_due_amount rental_domain.money NOT NULL CHECK (refund_due_amount >= 0),
  refunded_amount rental_domain.money NOT NULL CHECK (refunded_amount >= 0),
  forfeited_amount rental_domain.money NOT NULL CHECK (forfeited_amount >= 0),
  version integer NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,booking_id), UNIQUE (tenant_id,rental_id), UNIQUE (tenant_id,id,currency),
  CHECK (booking_id IS NOT NULL OR rental_id IS NOT NULL),
  CHECK (received_amount = held_amount + applied_amount + refunded_amount + forfeited_amount),
  CHECK (refund_due_amount <= held_amount),
  FOREIGN KEY (tenant_id,customer_id) REFERENCES rental_domain.customers(tenant_id,id),
  FOREIGN KEY (tenant_id,booking_id,customer_id) REFERENCES rental_domain.bookings(tenant_id,id,customer_id),
  FOREIGN KEY (tenant_id,rental_id,customer_id) REFERENCES rental_domain.rentals(tenant_id,id,customer_id)
);
CREATE TABLE rental_domain.refunds (
  tenant_id rental_domain.record_id NOT NULL,
  id rental_domain.record_id NOT NULL, refund_number text NOT NULL,
  original_payment_id rental_domain.record_id NOT NULL, payment_purpose text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('CUSTOMER_REFUND','CUSTOMER_INVOICE','RENTAL_DEPOSIT')),
  deposit_id rental_domain.record_id, invoice_id rental_domain.record_id,
  currency rental_domain.currency_code NOT NULL,
  amount rental_domain.money NOT NULL CHECK (amount > 0),
  status text NOT NULL CHECK (status IN ('PENDING','APPROVED','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  requested_by text, approved_by text, provider_reference text,
  PRIMARY KEY (tenant_id,id), UNIQUE (tenant_id,refund_number),
  CHECK ((source_type = 'RENTAL_DEPOSIT') = (deposit_id IS NOT NULL)),
  CHECK ((source_type = 'RENTAL_DEPOSIT') = (payment_purpose = 'RENTAL_DEPOSIT')),
  CHECK (deposit_id IS NULL OR invoice_id IS NULL),
  CHECK (requested_by IS NULL OR approved_by IS NULL OR requested_by <> approved_by),
  CHECK (status <> 'COMPLETED' OR (NULLIF(trim(provider_reference),'') IS NOT NULL AND requested_by IS NOT NULL AND approved_by IS NOT NULL AND requested_by <> approved_by)),
  FOREIGN KEY (tenant_id,original_payment_id,payment_purpose,currency) REFERENCES rental_domain.payments(tenant_id,id,purpose,currency),
  FOREIGN KEY (tenant_id,deposit_id,currency) REFERENCES rental_domain.deposits(tenant_id,id,currency),
  FOREIGN KEY (tenant_id,invoice_id,currency) REFERENCES rental_domain.invoices(tenant_id,id,currency)
);
CREATE TABLE rental_domain.allocations (
  tenant_id rental_domain.record_id NOT NULL,
  id rental_domain.record_id NOT NULL, payment_id rental_domain.record_id NOT NULL,
  payment_purpose text NOT NULL, currency rental_domain.currency_code NOT NULL,
  invoice_id rental_domain.record_id, deposit_id rental_domain.record_id,
  amount rental_domain.money NOT NULL CHECK (amount > 0),
  PRIMARY KEY (tenant_id,id),
  CHECK ((invoice_id IS NOT NULL)::integer + (deposit_id IS NOT NULL)::integer = 1),
  CHECK (deposit_id IS NULL OR payment_purpose = 'RENTAL_DEPOSIT'),
  FOREIGN KEY (tenant_id,payment_id,payment_purpose,currency) REFERENCES rental_domain.payments(tenant_id,id,purpose,currency),
  FOREIGN KEY (tenant_id,invoice_id,currency) REFERENCES rental_domain.invoices(tenant_id,id,currency),
  FOREIGN KEY (tenant_id,deposit_id,currency) REFERENCES rental_domain.deposits(tenant_id,id,currency)
);
-- Exact source evidence is retained separately, not used as normalized field storage.
CREATE TABLE rental_domain.source_archive (
  tenant_id rental_domain.record_id NOT NULL REFERENCES rental_domain.tenants(tenant_id),
  namespace text NOT NULL, record_key text NOT NULL, payload bytea NOT NULL,
  PRIMARY KEY (tenant_id,namespace,record_key)
);

CREATE INDEX booking_customer ON rental_domain.bookings(tenant_id,customer_id);
CREATE INDEX rental_vehicle ON rental_domain.rentals(tenant_id,vehicle_id);
CREATE INDEX invoice_rental ON rental_domain.invoices(tenant_id,rental_id);
CREATE INDEX invoice_line_parent ON rental_domain.invoice_lines(tenant_id,invoice_id);
CREATE INDEX allocation_payment ON rental_domain.allocations(tenant_id,payment_id);
CREATE INDEX allocation_invoice ON rental_domain.allocations(tenant_id,invoice_id);
CREATE INDEX allocation_deposit ON rental_domain.allocations(tenant_id,deposit_id);
CREATE INDEX refund_payment ON rental_domain.refunds(tenant_id,original_payment_id);
CREATE INDEX refund_deposit ON rental_domain.refunds(tenant_id,deposit_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','customers','vehicles','bookings','rentals','invoices','invoice_lines','payments','deposits','refunds','allocations','source_archive'] LOOP
    EXECUTE format('ALTER TABLE rental_domain.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('ALTER TABLE rental_domain.%I FORCE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY tenant_isolation ON rental_domain.%I FOR ALL USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'',true),'''')) WITH CHECK (tenant_id = NULLIF(current_setting(''app.current_tenant_id'',true),''''))',t);
  END LOOP;
END $$;
REVOKE ALL ON SCHEMA rental_domain FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA rental_domain FROM PUBLIC;

-- Lock shared money parents before child mutations; concurrent allocations/refunds
-- cannot both reserve the same balance. Final totals are checked at commit.
CREATE FUNCTION rental_domain.lock_money_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE row_data jsonb; parent_id text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id <> OLD.tenant_id OR NEW.id <> OLD.id OR
      (to_jsonb(NEW)->'payment_id') IS DISTINCT FROM (to_jsonb(OLD)->'payment_id') OR
      (to_jsonb(NEW)->'original_payment_id') IS DISTINCT FROM (to_jsonb(OLD)->'original_payment_id') OR
      (to_jsonb(NEW)->'deposit_id') IS DISTINCT FROM (to_jsonb(OLD)->'deposit_id') OR
      (to_jsonb(NEW)->'invoice_id') IS DISTINCT FROM (to_jsonb(OLD)->'invoice_id')) THEN
    RAISE EXCEPTION 'Financial record identity and parent links are immutable' USING ERRCODE='23514';
  END IF;
  row_data := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  parent_id := COALESCE(row_data->>'payment_id',row_data->>'original_payment_id');
  IF parent_id IS NOT NULL THEN
    PERFORM 1 FROM rental_domain.payments WHERE tenant_id=row_data->>'tenant_id' AND id=parent_id FOR UPDATE;
  END IF;
  IF row_data->>'deposit_id' IS NOT NULL THEN
    PERFORM 1 FROM rental_domain.deposits WHERE tenant_id=row_data->>'tenant_id' AND id=row_data->>'deposit_id' FOR UPDATE;
  END IF;
  IF TG_TABLE_NAME='invoice_lines' THEN
    PERFORM 1 FROM rental_domain.invoices WHERE tenant_id=row_data->>'tenant_id' AND id=row_data->>'invoice_id' FOR UPDATE;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER allocation_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON rental_domain.allocations FOR EACH ROW EXECUTE FUNCTION rental_domain.lock_money_parent();
CREATE TRIGGER refund_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON rental_domain.refunds FOR EACH ROW EXECUTE FUNCTION rental_domain.lock_money_parent();
CREATE TRIGGER invoice_line_parent_lock BEFORE INSERT OR UPDATE OR DELETE ON rental_domain.invoice_lines FOR EACH ROW EXECUTE FUNCTION rental_domain.lock_money_parent();

CREATE FUNCTION rental_domain.check_payment_totals() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r jsonb; payment_id text; p rental_domain.payments%ROWTYPE; allocated numeric; refunded numeric; reserved numeric;
BEGIN
  r := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  payment_id := CASE WHEN TG_TABLE_NAME='payments' THEN r->>'id' ELSE COALESCE(r->>'payment_id',r->>'original_payment_id') END;
  SELECT * INTO p FROM rental_domain.payments WHERE tenant_id=r->>'tenant_id' AND id=payment_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount),0) INTO allocated FROM rental_domain.allocations WHERE tenant_id=p.tenant_id AND allocations.payment_id=p.id;
  SELECT COALESCE(sum(amount) FILTER (WHERE status='COMPLETED'),0),
         COALESCE(sum(amount) FILTER (WHERE status IN ('PENDING','APPROVED','PROCESSING','COMPLETED')),0)
    INTO refunded,reserved FROM rental_domain.refunds WHERE tenant_id=p.tenant_id AND original_payment_id=p.id;
  IF p.allocated_amount<>allocated OR p.refunded_amount<>refunded OR reserved>p.amount THEN
    RAISE EXCEPTION 'Payment allocations or refund totals do not reconcile' USING ERRCODE='23514',CONSTRAINT='payment_totals_reconcile';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER payment_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_payment_totals();
CREATE CONSTRAINT TRIGGER allocation_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_payment_totals();
CREATE CONSTRAINT TRIGGER refund_payment_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_payment_totals();

CREATE FUNCTION rental_domain.check_deposit_totals() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r jsonb; deposit_id text; d rental_domain.deposits%ROWTYPE; received numeric; refunded numeric; reserved numeric;
BEGIN
  r := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  deposit_id := CASE WHEN TG_TABLE_NAME='deposits' THEN r->>'id' ELSE r->>'deposit_id' END;
  IF deposit_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO d FROM rental_domain.deposits WHERE tenant_id=r->>'tenant_id' AND id=deposit_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(amount),0) INTO received FROM rental_domain.allocations WHERE tenant_id=d.tenant_id AND allocations.deposit_id=d.id;
  SELECT COALESCE(sum(amount) FILTER (WHERE status='COMPLETED'),0),
         COALESCE(sum(amount) FILTER (WHERE status IN ('PENDING','APPROVED','PROCESSING')),0)
    INTO refunded,reserved FROM rental_domain.refunds WHERE tenant_id=d.tenant_id AND refunds.deposit_id=d.id;
  IF d.received_amount<>received OR d.refunded_amount<>refunded OR reserved>d.held_amount THEN
    RAISE EXCEPTION 'Deposit receipts or refunds do not reconcile' USING ERRCODE='23514',CONSTRAINT='deposit_totals_reconcile';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER deposit_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.deposits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_deposit_totals();
CREATE CONSTRAINT TRIGGER allocation_deposit_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_deposit_totals();
CREATE CONSTRAINT TRIGGER refund_deposit_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.refunds DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_deposit_totals();

CREATE FUNCTION rental_domain.check_invoice_lines() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE r jsonb; invoice_id text; i rental_domain.invoices%ROWTYPE; totals record;
BEGIN
  r := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  invoice_id := CASE WHEN TG_TABLE_NAME='invoices' THEN r->>'id' ELSE r->>'invoice_id' END;
  SELECT * INTO i FROM rental_domain.invoices WHERE tenant_id=r->>'tenant_id' AND id=invoice_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COALESCE(sum(net_amount),0) AS net,COALESCE(sum(tax_amount),0) AS tax,COALESCE(sum(gross_amount),0) AS gross
    INTO totals FROM rental_domain.invoice_lines WHERE tenant_id=i.tenant_id AND invoice_lines.invoice_id=i.id;
  IF i.subtotal<>totals.net OR i.tax_total<>totals.tax OR i.total<>totals.gross THEN
    RAISE EXCEPTION 'Invoice lines do not reconcile to invoice totals' USING ERRCODE='23514',CONSTRAINT='invoice_lines_reconcile';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER invoice_totals_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.invoices DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_invoice_lines();
CREATE CONSTRAINT TRIGGER invoice_lines_reconcile AFTER INSERT OR UPDATE OR DELETE ON rental_domain.invoice_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION rental_domain.check_invoice_lines();
