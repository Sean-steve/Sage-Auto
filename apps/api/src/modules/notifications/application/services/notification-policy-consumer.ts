// ============================================================================
// CAR HIRE OS — NOTIFICATION POLICY CONSUMER (DEV-012, SPRINT 32)
// EventBus consumer that translates domain events into notification intents
// ============================================================================

import { DomainEventEnvelope, EVENT_TYPES } from "@carhire/contracts";
import { IEventSubscriber } from "../../../../infrastructure/events/event-bus";
import { NotificationOrchestratorService } from "./notification-orchestrator.service";
import { SendNotificationIntentDto } from "@car-hire-os/types";

export class NotificationPolicyConsumer implements IEventSubscriber {
  public readonly consumerName = "notification-policy-consumer";
  public readonly eventTypes = [
    EVENT_TYPES.BOOKING_RESERVATION_CONFIRMED,
    EVENT_TYPES.BOOKING_RESERVATION_CANCELLED,
    EVENT_TYPES.RENTAL_CONTRACT_SIGNED,
    EVENT_TYPES.RENTAL_HANDOVER_COMPLETED,
    EVENT_TYPES.PAYMENT_SUCCEEDED,
    EVENT_TYPES.PAYMENT_FAILED,
    EVENT_TYPES.MAINTENANCE_SCHEDULED,
    EVENT_TYPES.COMPLIANCE_DOCUMENT_EXPIRED,
  ] as const;

  constructor(private readonly orchestrator: NotificationOrchestratorService) {}

  async handle(event: DomainEventEnvelope<any>): Promise<void> {
    const tenantId = event.tenantId || (event.data as any)?.tenantId;
    if (!tenantId) {
      // Platform-wide or untracked events without tenantId are ignored
      return;
    }

    const eventType = event.eventType;
    const data = event.data || {};
    const correlationId = event.correlationId;
    const causationEventId = event.eventId;

    switch (eventType) {
      case EVENT_TYPES.BOOKING_RESERVATION_CONFIRMED: {
        const customerEmail = data.customerEmail || data.email;
        const customerPhone = data.customerPhone || data.phone;
        const customerName = data.customerName || data.name || "Valued Customer";
        const bookingReference = data.bookingReference || data.reference || data.bookingId;

        // 1. Email notification
        if (customerEmail) {
          const emailDto: SendNotificationIntentDto = {
            tenantId,
            channel: "EMAIL",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerEmail,
            recipientName: customerName,
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "booking.confirmation",
            correlationId,
            causationEventId,
            variables: {
              customerName,
              bookingReference,
              vehicleName: data.vehicleName || "Reserved Vehicle",
              pickupDate: data.pickupDate || new Date().toISOString().split("T")[0],
              pickupLocation: data.pickupLocation || "Main Station",
              returnDate: data.returnDate || new Date().toISOString().split("T")[0],
              returnLocation: data.returnLocation || "Main Station",
              totalAmount: data.totalAmount || "KES 0.00",
              tenantName: data.tenantName || "Auto Spec Sage",
              supportEmail: data.supportEmail || "support@autopecsage.com",
            },
          };
          await this.orchestrator.sendNotificationIntent(emailDto);
        }

        // 2. SMS notification
        if (customerPhone) {
          const smsDto: SendNotificationIntentDto = {
            tenantId,
            channel: "SMS",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerPhone,
            recipientName: customerName,
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "booking.confirmation",
            correlationId,
            causationEventId,
            variables: {
              customerName,
              bookingReference,
              vehicleName: data.vehicleName || "Reserved Vehicle",
              pickupDate: data.pickupDate || new Date().toISOString().split("T")[0],
              pickupLocation: data.pickupLocation || "Main Station",
              totalAmount: data.totalAmount || "KES 0.00",
              tenantName: data.tenantName || "Auto Spec Sage",
            },
          };
          await this.orchestrator.sendNotificationIntent(smsDto);
        }
        break;
      }

      case EVENT_TYPES.BOOKING_RESERVATION_CANCELLED: {
        const customerEmail = data.customerEmail || data.email;
        if (customerEmail) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "EMAIL",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerEmail,
            recipientName: data.customerName || "Customer",
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "booking.cancellation",
            correlationId,
            causationEventId,
            variables: {
              customerName: data.customerName || "Customer",
              bookingReference: data.bookingReference || data.bookingId,
              cancellationReason: data.reason || "Customer request",
              tenantName: data.tenantName || "Auto Spec Sage",
            },
          });
        }
        break;
      }

      case EVENT_TYPES.RENTAL_HANDOVER_COMPLETED: {
        const customerEmail = data.customerEmail || data.email;
        if (customerEmail) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "EMAIL",
            category: "TRANSACTIONAL",
            priority: "NORMAL",
            recipient: customerEmail,
            recipientName: data.customerName || "Customer",
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "rental.handover.completed",
            correlationId,
            causationEventId,
            variables: {
              customerName: data.customerName || "Customer",
              vehicleName: data.vehicleName || "Vehicle",
              registrationPlate: data.registrationPlate || "KDA 123A",
              startOdometer: data.startOdometer || 0,
              fuelLevel: data.fuelLevel || 100,
              expectedReturnDate: data.expectedReturnDate || new Date().toISOString().split("T")[0],
              returnLocation: data.returnLocation || "Main Station",
              tenantName: data.tenantName || "Auto Spec Sage",
            },
          });
        }
        break;
      }

      case EVENT_TYPES.PAYMENT_SUCCEEDED: {
        const customerEmail = data.customerEmail || data.email;
        const customerPhone = data.customerPhone || data.phone;
        const customerName = data.customerName || "Customer";

        if (customerEmail) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "EMAIL",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerEmail,
            recipientName: customerName,
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "payment.receipt",
            correlationId,
            causationEventId,
            variables: {
              customerName,
              amount: data.formattedAmount || `${data.currency || "KES"} ${data.amount}`,
              bookingReference: data.bookingReference || data.reference || "N/A",
              paymentMethod: data.paymentMethod || "M-Pesa",
              transactionId: data.transactionId || data.providerRef || "TX-000",
              paymentReference: data.reference || "REC-001",
              tenantName: data.tenantName || "Auto Spec Sage",
            },
          });
        }

        if (customerPhone) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "SMS",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerPhone,
            recipientName: customerName,
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "payment.receipt",
            correlationId,
            causationEventId,
            variables: {
              tenantName: data.tenantName || "Auto Spec Sage",
              amount: data.formattedAmount || `${data.currency || "KES"} ${data.amount}`,
              bookingReference: data.bookingReference || data.reference || "N/A",
              transactionId: data.transactionId || data.providerRef || "TX-000",
            },
          });
        }
        break;
      }

      case EVENT_TYPES.PAYMENT_FAILED: {
        const customerPhone = data.customerPhone || data.phone;
        if (customerPhone) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "SMS",
            category: "TRANSACTIONAL",
            priority: "HIGH",
            recipient: customerPhone,
            recipientPartyType: "CUSTOMER",
            recipientPartyId: data.customerId,
            templateKey: "payment.failed",
            correlationId,
            causationEventId,
            variables: {
              tenantName: data.tenantName || "Auto Spec Sage",
              bookingReference: data.bookingReference || data.reference || "N/A",
              failureReason: data.reason || "Payment declined",
            },
          });
        }
        break;
      }

      case EVENT_TYPES.MAINTENANCE_SCHEDULED: {
        const assigneeEmail = data.assigneeEmail || data.contactEmail;
        if (assigneeEmail) {
          await this.orchestrator.sendNotificationIntent({
            tenantId,
            channel: "EMAIL",
            category: "OPERATIONAL",
            priority: "NORMAL",
            recipient: assigneeEmail,
            recipientName: data.assigneeName || "Service Team",
            templateKey: "maintenance.scheduled",
            correlationId,
            causationEventId,
            variables: {
              assigneeName: data.assigneeName || "Team",
              vehicleName: data.vehicleName || "Fleet Vehicle",
              registrationPlate: data.registrationPlate || "KDA 123A",
              serviceType: data.serviceType || "Scheduled Inspection",
              serviceProviderName: data.serviceProviderName || "Fleet Workshop",
              scheduledDate: data.scheduledDate || new Date().toISOString().split("T")[0],
              workOrderNumber: data.workOrderNumber || "WO-001",
            },
          });
        }
        break;
      }

      case EVENT_TYPES.COMPLIANCE_DOCUMENT_EXPIRED: {
        const operationsEmail = data.operationsEmail || data.contactEmail || "ops@autopecsage.com";
        await this.orchestrator.sendNotificationIntent({
          tenantId,
          channel: "EMAIL",
          category: "OPERATIONAL",
          priority: "HIGH",
          recipient: operationsEmail,
          templateKey: "compliance.document.expired",
          correlationId,
          causationEventId,
          variables: {
            vehicleName: data.vehicleName || "Fleet Vehicle",
            registrationPlate: data.registrationPlate || "KDA 123A",
            requirementName: data.requirementName || "Insurance / PSV License",
            expiryDate: data.expiryDate || new Date().toISOString().split("T")[0],
          },
        });
        break;
      }
    }
  }
}
