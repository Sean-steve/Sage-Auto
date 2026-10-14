import React, { useEffect, useState } from 'react';
import { apiClient } from '../lib/api-client';
import { permits, type AccessPortal } from '../lib/access-context';

export function BookingPayments({ booking, portal, onRefresh }: { booking: any; portal: AccessPortal; onRefresh: () => Promise<void> }) {
  const [attempts, setAttempts] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const canRead = permits(portal, 'payment.read');
  async function load() {
    if (!canRead) return;
    const result = await apiClient.payments.listAttempts({ targetId: booking.id });
    if (result.error) throw new Error(result.error.message);
    setAttempts((result.data || []).filter((item: any) => item.targetId === booking.id));
  }
  useEffect(() => { void load().catch(e => setError(e.message)); }, [booking.id, booking.version]);
  async function verify(id: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.payments.verifyAttempt(id);
      if (result.error) throw new Error(result.error.message);
      setNotice(result.data ? 'Payment verified. Booking balances have been refreshed.' : 'The provider has not confirmed this payment yet.');
      await load(); await onRefresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.payments.recordManual({
        purpose: data.get('purpose'), targetId: booking.id, customerId: booking.customerId,
        amount: String(data.get('amount')), currency: booking.currency || 'KES',
        providerTransactionId: String(data.get('reference')).trim(),
        notes: `Offline payment received for ${booking.bookingNumber}`,
      });
      if (result.error) throw new Error(result.error.message);
      const payment: any = result.data;
      if (!payment) throw new Error('No payment receipt was returned. Refresh before retrying.');
      setNotice(`Payment ${payment.paymentNumber} recorded. Review the updated booking and dispatch requirements below.`);
      form.reset(); await load(); await onRefresh();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="mt-5 rounded-2xl border border-slate-200 p-5">
    <h3 className="font-bold">Payments</h3>
    <p className="mt-1 text-sm text-slate-600">Requesting payment changes the booking status; it does not collect money. Rental charges and the refundable security deposit are separate.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-3 text-sm text-emerald-800">{notice}</p>}
    {attempts.map(attempt => <div key={attempt.id} className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span>{attempt.provider}: {attempt.amount} {attempt.currency} · {attempt.status}</span>{permits(portal, 'payment.verify') && !['SUCCEEDED','FAILED','CANCELLED','EXPIRED'].includes(attempt.status) && <button type="button" disabled={busy} onClick={() => void verify(attempt.id)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Check provider status</button>}</div>)}
    {permits(portal, 'payment.record') && <details className="mt-4"><summary className="cursor-pointer font-semibold">Record money already received</summary>
      <form onSubmit={record} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">Payment for<select name="purpose" className="rounded-lg border p-2"><option value="CUSTOMER_INVOICE">Rental charges</option><option value="RENTAL_DEPOSIT">Security deposit</option></select></label>
        <label className="grid gap-1 text-sm">Amount ({booking.currency || 'KES'})<input required name="amount" type="number" min="0.01" step="0.01" className="rounded-lg border p-2" /></label>
        <label className="grid gap-1 text-sm sm:col-span-2">Receipt or transaction reference<input required name="reference" className="rounded-lg border p-2" /></label>
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input required type="checkbox" className="mt-1" />I have checked that this money was received and has not already been recorded.</label>
        <button disabled={busy} className="rounded-lg bg-emerald-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Saving…' : 'Record received payment'}</button>
      </form>
    </details>}
  </section>;
}
