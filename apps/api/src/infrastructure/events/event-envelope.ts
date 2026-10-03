// ============================================================================
// CAR HIRE OS — CANONICAL DOMAIN EVENT ENVELOPE (DEV-010, BRS-002)
// Immutable past-tense fact representations with UTC timestamps and distributed tracing
// ============================================================================

import {
  DomainEventEnvelope,
  DomainEventActor,
  DomainEventAggregate,
  EventActorType,
} from "@carhire/contracts";
import { EventEnvelopeSchema } from "@carhire/validation";

export interface CreateEnvelopeParams<T = any> {
  eventType: string;
  aggregate: DomainEventAggregate;
  data: T;
  tenantId?: string | null;
  source?: string;
  actor?: Partial<DomainEventActor>;
  correlationId?: string;
  causationId?: string | null;
  eventVersion?: number;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
  eventId?: string;
}

/**
 * Creates a validated, canonical DomainEventEnvelope.
 * Events are immutable past-tense facts with explicit UTC occurredAt timestamp,
 * UUID identifier, and full tracing context (tenantId, correlationId, causationId, actor).
 */
export function createDomainEventEnvelope<T = any>(
  params: CreateEnvelopeParams<T>
): DomainEventEnvelope<T> {
  const now = new Date().toISOString();
  const eventId = params.eventId || crypto.randomUUID();
  const correlationId = params.correlationId || crypto.randomUUID();

  const actor: DomainEventActor = {
    type: (params.actor?.type || "SYSTEM") as EventActorType,
    id: params.actor?.id,
    supportActorId: params.actor?.supportActorId,
    impersonatorId: params.actor?.impersonatorId,
  };

  const envelope: DomainEventEnvelope<T> = {
    eventId,
    eventType: params.eventType,
    eventVersion: params.eventVersion ?? 1,
    occurredAt: params.occurredAt || now,
    tenantId: params.tenantId ?? null,
    source: params.source || "carhire.api",
    correlationId,
    causationId: params.causationId ?? null,
    aggregate: {
      type: params.aggregate.type,
      id: params.aggregate.id,
      version: params.aggregate.version ?? 1,
    },
    actor,
    data: params.data,
    metadata: params.metadata,
  };

  return freezeEventEnvelope(envelope);
}

/**
 * Deep freezes an envelope to strictly enforce event immutability.
 */
export function freezeEventEnvelope<T>(envelope: DomainEventEnvelope<T>): Readonly<DomainEventEnvelope<T>> {
  return Object.freeze({
    ...envelope,
    aggregate: Object.freeze({ ...envelope.aggregate }),
    actor: Object.freeze({ ...envelope.actor }),
    data: typeof envelope.data === "object" && envelope.data !== null ? Object.freeze({ ...envelope.data }) : envelope.data,
    metadata: envelope.metadata ? Object.freeze({ ...envelope.metadata }) : undefined,
  });
}

/**
 * Validates a domain event envelope against the canonical Zod schema.
 */
export function validateDomainEventEnvelope(envelope: unknown): {
  isValid: boolean;
  errors?: string[];
  validated?: DomainEventEnvelope;
} {
  const result = EventEnvelopeSchema.safeParse(envelope);
  if (result.success) {
    return { isValid: true, validated: result.data as unknown as DomainEventEnvelope };
  }
  const errors = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
  return { isValid: false, errors };
}

/**
 * Serializes an envelope to a JSON string safe for transport and persistence.
 */
export function serializeDomainEvent(envelope: DomainEventEnvelope): string {
  return JSON.stringify(envelope);
}

/**
 * Deserializes raw JSON or an existing object into a typed DomainEventEnvelope.
 */
export function deserializeDomainEvent(raw: string | Record<string, unknown>): DomainEventEnvelope {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return freezeEventEnvelope({
    eventId: parsed.eventId,
    eventType: parsed.eventType,
    eventVersion: Number(parsed.eventVersion || 1),
    occurredAt: parsed.occurredAt,
    tenantId: parsed.tenantId ?? null,
    source: parsed.source || "carhire.api",
    correlationId: parsed.correlationId,
    causationId: parsed.causationId ?? null,
    aggregate: {
      type: parsed.aggregate?.type || "unknown",
      id: parsed.aggregate?.id || "unknown",
      version: parsed.aggregate?.version ? Number(parsed.aggregate.version) : undefined,
    },
    actor: {
      type: parsed.actor?.type || "SYSTEM",
      id: parsed.actor?.id,
      supportActorId: parsed.actor?.supportActorId,
      impersonatorId: parsed.actor?.impersonatorId,
    },
    data: parsed.data || {},
    metadata: parsed.metadata,
  });
}
