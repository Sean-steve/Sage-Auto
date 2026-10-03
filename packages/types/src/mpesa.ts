// ============================================================================
// CAR HIRE OS — M-PESA DARAJA INTEGRATION CONTRACTS & TYPES (Sprint 23)
// Strongly Typed Interfaces for STK Push, C2B, B2C, Callbacks & Daraja Protocol
// ============================================================================

export type MpesaEnvironment = "SANDBOX" | "PRODUCTION";

export interface MpesaConfig {
  environment: MpesaEnvironment;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  initiatorName?: string;
  securityCredential?: string;
  callbackUrl?: string;
  b2cResultUrl?: string;
  b2cQueueTimeoutUrl?: string;
  c2bValidationUrl?: string;
  c2bConfirmationUrl?: string;
  webhookSharedSecret?: string;
  timeoutMs?: number;
}

export interface MpesaAuthTokenResponse {
  access_token: string;
  expires_in: string; // Seconds as string, e.g. "3599"
}

export interface StkPushRequestPayload {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: "CustomerPayBillOnline" | "CustomerBuyGoodsOnline";
  Amount: number;
  PartyA: string; // Customer phone e.g. 2547XXXXXXXX
  PartyB: string; // Paybill or Till
  PhoneNumber: string; // Same as PartyA
  CallBackURL: string;
  AccountReference: string; // E.g. Booking ID or Invoice Number
  TransactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string; // "0" indicates request accepted for processing
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkCallbackMetadataItem {
  Name: string;
  Value?: string | number;
}

export interface StkCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number; // 0 = Success, 1032 = Cancelled, 1037 = Timeout, etc.
      ResultDesc: string;
      CallbackMetadata?: {
        Item: StkCallbackMetadataItem[];
      };
    };
  };
}

export interface ParsedMpesaStkCallback {
  merchantRequestId: string;
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  mpesaReceiptNumber?: string;
  amount?: number;
  phoneNumber?: string;
  transactionDate?: string;
  balance?: number;
  isSuccessful: boolean;
}

export interface C2BValidationRequestPayload {
  TransactionType: string;
  TransID: string;
  TransTime: string;
  TransAmount: string;
  BusinessShortCode: string;
  BillRefNumber: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string;
  ThirdPartyTransID?: string;
  MSISDN: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface C2BValidationResponse {
  ResultCode: number; // 0 = Accept, any other = Reject
  ResultDesc: string;
}

export interface C2BConfirmationPayload extends C2BValidationRequestPayload {}

export interface B2CPaymentRequestPayload {
  InitiatorName: string;
  SecurityCredential: string;
  CommandID: "SalaryPayment" | "BusinessPayment" | "PromotionPayment";
  Amount: number;
  PartyA: string; // Shortcode
  PartyB: string; // Recipient Phone (2547XXXXXXXX)
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
}

export interface B2CPaymentResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

export interface B2CResultPayload {
  Result: {
    ResultType: number;
    ResultCode: number;
    ResultDesc: string;
    OriginatorConversationID: string;
    ConversationID: string;
    TransactionID: string;
    ResultParameters?: {
      ResultParameter: Array<{
        Key: string;
        Value: string | number;
      }>;
    };
    ReferenceData?: {
      ReferenceItem: Array<{
        Key: string;
        Value: string;
      }>;
    };
  };
}

export interface ParsedMpesaB2CResult {
  originatorConversationId: string;
  conversationId: string;
  transactionId: string;
  resultCode: number;
  resultDesc: string;
  amount?: number;
  receiverPartyPublicName?: string;
  transactionCompletedDateTime?: string;
  b2cUtilityAccountAvailableFunds?: number;
  isSuccessful: boolean;
}

export interface TransactionStatusQueryPayload {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "TransactionStatusQuery";
  TransactionID: string;
  PartyA: string;
  IdentifierType: "1" | "2" | "4";
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export interface StkQueryRequestPayload {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export interface StkQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string | number;
  ResultDesc: string;
}

export interface AccountBalanceQueryPayload {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "AccountBalance";
  PartyA: string;
  IdentifierType: "4";
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
}

export interface ReversalRequestPayload {
  Initiator: string;
  SecurityCredential: string;
  CommandID: "TransactionReversal";
  TransactionID: string;
  Amount: number;
  ReceiverParty: string;
  RecieverIdentifierType: "11";
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export const MPESA_RESULT_CODES: Record<number, string> = {
  0: "Success / Transaction Accepted",
  1: "Insufficient Funds in customer M-Pesa wallet",
  1032: "Transaction Cancelled by Customer",
  1037: "Transaction Timed Out (Customer did not respond on USSD/SIM prompt)",
  2001: "Invalid Initiator / Authentication Credentials",
  9999: "System or Network Internal Failure",
};
