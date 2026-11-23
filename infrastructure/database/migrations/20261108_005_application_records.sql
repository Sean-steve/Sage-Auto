-- Repository compatibility schema: PostgreSQL is authoritative; values retain
-- their current serialization while domain repositories migrate to typed tables.
CREATE TABLE application_records (
  namespace TEXT NOT NULL,
  record_key TEXT NOT NULL,
  payload BYTEA NOT NULL,
  unique_value TEXT,
  ordinal BIGINT GENERATED ALWAYS AS IDENTITY,
  PRIMARY KEY (namespace, record_key),
  UNIQUE (namespace, unique_value)
);
CREATE INDEX application_records_namespace_order ON application_records(namespace, ordinal);
