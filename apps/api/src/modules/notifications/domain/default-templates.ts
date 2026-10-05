// ============================================================================
// CAR HIRE OS — DEFAULT SYSTEM NOTIFICATION TEMPLATES (DEV-012, SPRINT 32)
// Canonical system-level templates with variable schemas & multichannel copies
// ============================================================================

import { NotificationTemplateRecord } from "@car-hire-os/types";

export const DEFAULT_NOTIFICATION_TEMPLATES: Omit<
  NotificationTemplateRecord,
  "createdAt" | "updatedAt"
>[] = [
  // 1. Booking Confirmation — Email
  {
    id: "sys-tpl-booking-conf-email",
    tenantId: null,
    key: "booking.confirmation",
    name: "Booking Confirmation (Email)",
    category: "TRANSACTIONAL",
    channel: "EMAIL",
    subjectTemplate: "Reservation Confirmed: {{bookingReference}} — {{tenantName}}",
    bodyTemplate:
      "Dear {{customerName}},\n\nYour reservation {{bookingReference}} is confirmed!\n\nVehicle: {{vehicleName}}\nPickup: {{pickupDate}} at {{pickupLocation}}\nReturn: {{returnDate}} at {{returnLocation}}\nTotal Amount: {{totalAmount}}\n\nManage your booking or complete pre-handover verification here:\n{{portalUrl}}\n\nThank you for choosing {{tenantName}}.",
    htmlTemplate: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px;">
          <h1 style="color: #0f172a; font-size: 24px; margin: 0;">Reservation Confirmed</h1>
          <p style="color: #64748b; font-size: 14px; margin: 4px 0 0 0;">Reference: <strong>{{bookingReference}}</strong></p>
        </div>
        <p>Dear <strong>{{customerName}}</strong>,</p>
        <p>Your vehicle reservation is confirmed with <strong>{{tenantName}}</strong>. Here are your booking details:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: 600;">Vehicle:</td>
            <td style="padding: 10px;">{{vehicleName}}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: 600;">Pickup Date & Location:</td>
            <td style="padding: 10px;">{{pickupDate}} &mdash; {{pickupLocation}}</td>
          </tr>
          <tr style="background: #f8fafc; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: 600;">Return Date & Location:</td>
            <td style="padding: 10px;">{{returnDate}} &mdash; {{returnLocation}}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px; font-weight: 600;">Total Confirmed:</td>
            <td style="padding: 10px; font-weight: 700; color: #0284c7;">{{totalAmount}}</td>
          </tr>
        </table>
        <div style="text-align: center; margin: 28px 0;">
          <a href="{{portalUrl}}" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">View Booking & Sign Agreement</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; text-align: center;">This is a transactional message sent by {{tenantName}}. Questions? Contact us at {{supportEmail}}.</p>
      </div>
    `,
    variablesSchema: [
      { name: "customerName", description: "Full name of customer", required: true },
      { name: "bookingReference", description: "Canonical booking reference", required: true },
      { name: "vehicleName", description: "Make and model of vehicle", required: true },
      { name: "pickupDate", description: "Pickup date and time", required: true },
      { name: "pickupLocation", description: "Pickup address/station", required: true },
      { name: "returnDate", description: "Return date and time", required: true },
      { name: "returnLocation", description: "Return address/station", required: true },
      { name: "totalAmount", description: "Formatted total amount", required: true },
      { name: "tenantName", description: "Tenant organization name", required: true },
      { name: "portalUrl", description: "Canonical portal link to booking", required: true },
      { name: "supportEmail", description: "Support contact email", required: false },
    ],
    description: "Default transactional email sent upon reservation confirmation.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 2. Booking Confirmation — SMS
  {
    id: "sys-tpl-booking-conf-sms",
    tenantId: null,
    key: "booking.confirmation",
    name: "Booking Confirmation (SMS)",
    category: "TRANSACTIONAL",
    channel: "SMS",
    bodyTemplate:
      "{{tenantName}}: Booking {{bookingReference}} confirmed! Vehicle: {{vehicleName}}. Pickup: {{pickupDate}} @ {{pickupLocation}}. View details: {{portalUrl}}",
    variablesSchema: [
      { name: "tenantName", description: "Company name", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "vehicleName", description: "Vehicle description", required: true },
      { name: "pickupDate", description: "Pickup timestamp", required: true },
      { name: "pickupLocation", description: "Pickup station", required: true },
      { name: "portalUrl", description: "Shortlink URL", required: true },
    ],
    description: "Concise SMS confirmation compliant with 160-character segment limit.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 3. Booking Confirmation — WhatsApp
  {
    id: "sys-tpl-booking-conf-wa",
    tenantId: null,
    key: "booking.confirmation",
    name: "Booking Confirmation (WhatsApp)",
    category: "TRANSACTIONAL",
    channel: "WHATSAPP",
    bodyTemplate:
      "Hello *{{customerName}}*! Your booking with *{{tenantName}}* is confirmed.\n\n*Reference:* {{bookingReference}}\n*Vehicle:* {{vehicleName}}\n*Pickup:* {{pickupDate}} at {{pickupLocation}}\n*Total:* {{totalAmount}}\n\nManage your booking here: {{portalUrl}}",
    variablesSchema: [
      { name: "customerName", description: "Customer full name", required: true },
      { name: "tenantName", description: "Tenant brand name", required: true },
      { name: "bookingReference", description: "Reference", required: true },
      { name: "vehicleName", description: "Vehicle model", required: true },
      { name: "pickupDate", description: "Pickup time", required: true },
      { name: "pickupLocation", description: "Pickup place", required: true },
      { name: "totalAmount", description: "Total price", required: true },
      { name: "portalUrl", description: "Web link", required: true },
    ],
    description: "WhatsApp Cloud API template with markdown formatting.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 4. Booking Cancellation — Email
  {
    id: "sys-tpl-booking-cancel-email",
    tenantId: null,
    key: "booking.cancellation",
    name: "Booking Cancellation (Email)",
    category: "TRANSACTIONAL",
    channel: "EMAIL",
    subjectTemplate: "Booking Cancelled: {{bookingReference}} — {{tenantName}}",
    bodyTemplate:
      "Dear {{customerName}},\n\nYour booking {{bookingReference}} has been cancelled.\nReason: {{cancellationReason}}\n\nIf a refund is applicable, it will be processed according to our cancellation policy.\n\nThank you,\n{{tenantName}}",
    variablesSchema: [
      { name: "customerName", description: "Customer name", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "cancellationReason", description: "Reason for cancellation", required: true },
      { name: "tenantName", description: "Tenant name", required: true },
    ],
    description: "Cancellation notice sent when a reservation is voided.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 5. Rental Contract Ready — Email
  {
    id: "sys-tpl-rental-contract-email",
    tenantId: null,
    key: "rental.contract.ready",
    name: "Rental Agreement Ready (Email)",
    category: "TRANSACTIONAL",
    channel: "EMAIL",
    subjectTemplate: "Rental Agreement Ready for Signature — {{bookingReference}}",
    bodyTemplate:
      "Dear {{customerName}},\n\nYour digital rental contract for reservation {{bookingReference}} is ready.\n\nPlease review and e-sign your agreement before dispatch:\n{{contractUrl}}\n\nRegards,\n{{tenantName}}",
    variablesSchema: [
      { name: "customerName", description: "Customer name", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "contractUrl", description: "Contract e-sign link", required: true },
      { name: "tenantName", description: "Tenant name", required: true },
    ],
    description: "Digital rental agreement signature invitation.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 6. Rental Handover Completed — Email & SMS
  {
    id: "sys-tpl-rental-handover-email",
    tenantId: null,
    key: "rental.handover.completed",
    name: "Rental Handover Completed (Email)",
    category: "TRANSACTIONAL",
    channel: "EMAIL",
    subjectTemplate: "Vehicle Handover Completed: {{vehicleName}} ({{registrationPlate}})",
    bodyTemplate:
      "Dear {{customerName}},\n\nVehicle {{vehicleName}} ({{registrationPlate}}) has been handed over successfully.\nOdometer: {{startOdometer}} km\nFuel: {{fuelLevel}}%\nReturn Expected: {{expectedReturnDate}} at {{returnLocation}}\n\nView inspection sheet: {{inspectionUrl}}\n\nDrive safely!\n{{tenantName}}",
    variablesSchema: [
      { name: "customerName", description: "Customer name", required: true },
      { name: "vehicleName", description: "Vehicle name", required: true },
      { name: "registrationPlate", description: "Plate number", required: true },
      { name: "startOdometer", description: "Starting km", required: true },
      { name: "fuelLevel", description: "Starting fuel", required: true },
      { name: "expectedReturnDate", description: "Expected return", required: true },
      { name: "returnLocation", description: "Return place", required: true },
      { name: "inspectionUrl", description: "Inspection report link", required: true },
      { name: "tenantName", description: "Tenant name", required: true },
    ],
    description: "Handover check-out receipt with inspection sheet link.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },
  {
    id: "sys-tpl-rental-handover-sms",
    tenantId: null,
    key: "rental.handover.completed",
    name: "Rental Handover Completed (SMS)",
    category: "TRANSACTIONAL",
    channel: "SMS",
    bodyTemplate:
      "{{tenantName}}: {{vehicleName}} ({{registrationPlate}}) has been handed over. Return by {{expectedReturnDate}}. Start: {{startOdometer}} km, fuel {{fuelLevel}}%. Drive safely.",
    variablesSchema: [
      { name: "tenantName", description: "Tenant name", required: true },
      { name: "vehicleName", description: "Vehicle name", required: true },
      { name: "registrationPlate", description: "Plate number", required: true },
      { name: "expectedReturnDate", description: "Expected return", required: true },
      { name: "startOdometer", description: "Starting km", required: true },
      { name: "fuelLevel", description: "Starting fuel", required: true },
    ],
    description: "SMS confirmation after physical vehicle handover.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 7. Payment Receipt — Email & SMS
  {
    id: "sys-tpl-payment-receipt-email",
    tenantId: null,
    key: "payment.receipt",
    name: "Payment Receipt (Email)",
    category: "TRANSACTIONAL",
    channel: "EMAIL",
    subjectTemplate: "Payment Receipt: {{paymentReference}} — {{tenantName}}",
    bodyTemplate:
      "Dear {{customerName}},\n\nWe have received your payment of {{amount}} for reservation {{bookingReference}}.\nPayment Method: {{paymentMethod}}\nTransaction ID: {{transactionId}}\n\nView full receipt:\n{{receiptUrl}}\n\nThank you,\n{{tenantName}}",
    variablesSchema: [
      { name: "customerName", description: "Customer name", required: true },
      { name: "amount", description: "Amount paid", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "paymentMethod", description: "Method (e.g. M-Pesa, Card)", required: true },
      { name: "transactionId", description: "Provider transaction ID", required: true },
      { name: "receiptUrl", description: "Receipt link", required: true },
      { name: "tenantName", description: "Tenant name", required: true },
    ],
    description: "Official payment receipt sent upon successful capture.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },
  {
    id: "sys-tpl-payment-receipt-sms",
    tenantId: null,
    key: "payment.receipt",
    name: "Payment Receipt (SMS)",
    category: "TRANSACTIONAL",
    channel: "SMS",
    bodyTemplate:
      "{{tenantName}}: Payment of {{amount}} received for booking {{bookingReference}}. Ref: {{transactionId}}. Thank you!",
    variablesSchema: [
      { name: "tenantName", description: "Tenant name", required: true },
      { name: "amount", description: "Amount paid", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "transactionId", description: "Transaction ref", required: true },
    ],
    description: "SMS receipt notification.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 8. Payment Failed — SMS
  {
    id: "sys-tpl-payment-failed-sms",
    tenantId: null,
    key: "payment.failed",
    name: "Payment Failed Alert (SMS)",
    category: "TRANSACTIONAL",
    channel: "SMS",
    bodyTemplate:
      "{{tenantName}}: Payment attempt for booking {{bookingReference}} failed ({{failureReason}}). Please retry payment: {{checkoutUrl}}",
    variablesSchema: [
      { name: "tenantName", description: "Tenant name", required: true },
      { name: "bookingReference", description: "Booking reference", required: true },
      { name: "failureReason", description: "Reason for failure", required: true },
      { name: "checkoutUrl", description: "Retry payment link", required: true },
    ],
    description: "Alert notifying customer of failed payment with retry link.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 9. Operational Alert — Maintenance Scheduled
  {
    id: "sys-tpl-maintenance-scheduled-email",
    tenantId: null,
    key: "maintenance.scheduled",
    name: "Vehicle Maintenance Notice (Email)",
    category: "OPERATIONAL",
    channel: "EMAIL",
    subjectTemplate: "Maintenance Scheduled: {{vehicleName}} ({{registrationPlate}})",
    bodyTemplate:
      "Hello {{assigneeName}},\n\nMaintenance has been scheduled for {{vehicleName}} ({{registrationPlate}}).\nService Type: {{serviceType}}\nProvider: {{serviceProviderName}}\nScheduled Date: {{scheduledDate}}\nWork Order: {{workOrderNumber}}\n\nPortal: {{portalUrl}}",
    variablesSchema: [
      { name: "assigneeName", description: "Recipient name", required: true },
      { name: "vehicleName", description: "Vehicle name", required: true },
      { name: "registrationPlate", description: "Plate number", required: true },
      { name: "serviceType", description: "Service type", required: true },
      { name: "serviceProviderName", description: "Provider name", required: true },
      { name: "scheduledDate", description: "Scheduled date", required: true },
      { name: "workOrderNumber", description: "Work order number", required: true },
      { name: "portalUrl", description: "Portal work order link", required: true },
    ],
    description: "Operational notification for fleet maintenance schedules.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 10. Operational Alert — Compliance Expiry
  {
    id: "sys-tpl-compliance-expired-email",
    tenantId: null,
    key: "compliance.document.expired",
    name: "Compliance Document Expiry Alert (Email)",
    category: "OPERATIONAL",
    channel: "EMAIL",
    subjectTemplate: "CRITICAL: Compliance Document Expired — {{vehicleName}} ({{registrationPlate}})",
    bodyTemplate:
      "Attention Fleet Operations,\n\nThe compliance document {{requirementName}} for vehicle {{vehicleName}} ({{registrationPlate}}) has expired on {{expiryDate}}.\nVehicle availability has been automatically gated.\n\nRenew or upload updated document here:\n{{complianceUrl}}",
    variablesSchema: [
      { name: "vehicleName", description: "Vehicle name", required: true },
      { name: "registrationPlate", description: "Plate number", required: true },
      { name: "requirementName", description: "Compliance requirement name", required: true },
      { name: "expiryDate", description: "Expiry date", required: true },
      { name: "complianceUrl", description: "Link to update compliance", required: true },
    ],
    description: "Urgent operational compliance expiry alert.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 11. Security — Password Reset
  {
    id: "sys-tpl-security-password-reset-email",
    tenantId: null,
    key: "security.password_reset",
    name: "Security: Password Reset (Email)",
    category: "SECURITY",
    channel: "EMAIL",
    subjectTemplate: "Reset Your Password — {{tenantName}}",
    bodyTemplate:
      "Hello {{userName}},\n\nYou requested to reset your password. Use the secure link below:\n{{resetUrl}}\n\nThis link will expire in 1 hour. If you did not make this request, please change your password immediately.\n\n{{tenantName}} Security Team",
    variablesSchema: [
      { name: "userName", description: "User's full name", required: true },
      { name: "resetUrl", description: "Secure password reset URL", required: true },
      { name: "tenantName", description: "Company name", required: true },
    ],
    description: "High-priority security email for password reset.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },

  // 12. Security — Email Verification
  {
    id: "sys-tpl-security-email-verification-email",
    tenantId: null,
    key: "security.email_verification",
    name: "Security: Verify Email (Email)",
    category: "SECURITY",
    channel: "EMAIL",
    subjectTemplate: "Verify Your Email Address — {{tenantName}}",
    bodyTemplate:
      "Hello {{userName}},\n\nPlease verify your email address by visiting this link:\n{{verificationUrl}}\n\nThis link is valid for 24 hours.\n\n{{tenantName}} Team",
    variablesSchema: [
      { name: "userName", description: "User's full name", required: true },
      { name: "verificationUrl", description: "Secure verification URL", required: true },
      { name: "tenantName", description: "Company name", required: true },
    ],
    description: "Account email verification request.",
    isSystemDefault: true,
    isActive: true,
    version: 1,
  },
];
