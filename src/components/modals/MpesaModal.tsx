import React, { useState } from "react";
import { X, Smartphone, CheckCircle2, AlertCircle, Loader2, CreditCard } from "lucide-react";
import { useApp } from "../../lib/store";

export const MpesaModal: React.FC = () => {
  const {
    isMpesaModalOpen,
    setIsMpesaModalOpen,
    mpesaTargetBooking,
    setMpesaTargetBooking,
    activeTenant,
    customers,
    processMpesaPayment,
  } = useApp();

  const [phone, setPhone] = useState("+254712345678");
  const pricingObj = (mpesaTargetBooking?.pricing || mpesaTargetBooking?.pricingSnapshot) as any;
  const [amount, setAmount] = useState(
    (pricingObj?.netPayable ?? pricingObj?.grossRentalTotal ?? mpesaTargetBooking?.grossTotal ?? 69300).toString()
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; receipt?: string } | null>(null);

  if (!isMpesaModalOpen || !mpesaTargetBooking) return null;

  const handlePush = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setResult(null);

    try {
      const res = await processMpesaPayment(
        mpesaTargetBooking.id,
        phone,
        parseFloat(amount)
      );

      setIsProcessing(false);
      setResult({
        success: true,
        message: "M-Pesa STK Push prompted to customer handset.",
        receipt: res.providerTransactionId || `MPESA-${Date.now().toString(36).toUpperCase()}`,
      });
    } catch (err: any) {
      setIsProcessing(false);
      setResult({
        success: false,
        message: err?.message || "Failed to initiate M-Pesa STK push.",
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-xs">
              M
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">Safaricom M-Pesa STK Push</h2>
              <p className="text-[10px] text-slate-400">Ref: {mpesaTargetBooking.bookingNumber}</p>
            </div>
          </div>
          <button
            onClick={() => {
              setIsMpesaModalOpen(false);
              setMpesaTargetBooking(null);
            }}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs">
          {result ? (
            <div className="py-6 text-center space-y-3">
              {result.success ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Payment Received!</h3>
                  <p className="text-slate-500">{result.message}</p>
                  {result.receipt && (
                    <p className="font-mono font-bold text-emerald-600 text-sm">Receipt: {result.receipt}</p>
                  )}
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-7 h-7" />
                  </div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-white">Payment Incomplete</h3>
                  <p className="text-slate-500">{result.message}</p>
                </>
              )}

              <button
                onClick={() => {
                  setIsMpesaModalOpen(false);
                  setMpesaTargetBooking(null);
                }}
                className="mt-4 px-5 py-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold rounded-xl text-xs"
              >
                Close Gateway
              </button>
            </div>
          ) : (
            <form onSubmit={handlePush} className="space-y-4">
              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Customer M-Pesa Mobile Number *
                </label>
                <input
                  required
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-400 font-medium mb-1">
                  Amount to Collect ({activeTenant.currencySymbol}) *
                </label>
                <input
                  required
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 font-mono font-bold"
                />
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 space-y-1">
                <div className="flex justify-between">
                  <span>Paybill Number:</span>
                  <span className="font-mono font-bold">{activeTenant?.mpesaPaybill || "174379"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Account Reference:</span>
                  <span className="font-mono">{mpesaTargetBooking.bookingNumber}</span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMpesaModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-400 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isProcessing ? "Prompting Phone PIN..." : "Send STK Push Prompt"}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
