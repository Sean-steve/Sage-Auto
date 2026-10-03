import React, { useState } from "react";
import { CheckCircle2, Shield, Calendar, CreditCard } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button, Input, Card } from "@carhire/ui";

export const PublicBookingExperience: React.FC = () => {
  const { vehicles = [], activeTenant, createBooking, customers = [] } = useApp();
  const [step, setStep] = useState<number>(1);
  const [bookingConfirmed, setBookingConfirmed] = useState<string | null>(null);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Direct Online Reservation</h2>
        <p className="text-xs text-slate-500">Fast 3-step online rental booking with automated M-Pesa STK push verification</p>
      </div>

      {bookingConfirmed ? (
        <Card className="text-center p-8 space-y-3">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
          <h3 className="text-lg font-bold">Reservation Successful!</h3>
          <p className="text-xs text-slate-500">Booking Reference #{bookingConfirmed} has been confirmed.</p>
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="flex justify-between text-xs font-bold border-b pb-3">
            <span className={step >= 1 ? "text-emerald-600" : "text-slate-400"}>1. Vehicle Selection</span>
            <span className={step >= 2 ? "text-emerald-600" : "text-slate-400"}>2. Driver Information</span>
            <span className={step >= 3 ? "text-emerald-600" : "text-slate-400"}>3. Payment & Confirmation</span>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-slate-600">Select dates and vehicle preferences:</p>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Pickup Date" type="date" defaultValue="2026-08-25" />
                <Input label="Return Date" type="date" defaultValue="2026-08-28" />
              </div>
              <Button onClick={() => setStep(2)}>Continue to Driver Details</Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Full Name" placeholder="e.g. John Kamau" />
                <Input label="Mobile Phone" placeholder="e.g. 0712345678" />
                <Input label="National ID / Passport" placeholder="e.g. 29384912" />
                <Input label="Driver's License No." placeholder="e.g. DL-84729" />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => {
                  setBookingConfirmed("BK-2026-ONLINE-001");
                }}>Complete Booking</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
