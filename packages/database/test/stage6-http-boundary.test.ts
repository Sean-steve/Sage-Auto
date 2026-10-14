import assert from "node:assert/strict";
import { BookingAvailabilityConflictError, ContractNotFoundError } from "@carhire/database";
import { globalErrorMiddleware } from "../../../apps/api/src/common/filters/http-exception.filter";

function handle(error: Error) {
  let status=0;
  let result:any;
  const response={
    status(code:number){status=code;return this;},
    json(value:unknown){result=value;return this;},
  };
  globalErrorMiddleware(error,
    {path:"/api/v1/bookings/test/confirm",id:"stage6-request"} as any,
    response as any,()=>{});
  return {status,result};
}

const overlap=handle(new BookingAvailabilityConflictError(
  "Selected vehicle has another reservation in the requested interval.","vehicle-test"
));
assert.equal(overlap.status,409,"availability conflict must be HTTP 409, never HTTP 500");
assert.equal(overlap.result.error.code,"BOOKING_AVAILABILITY_CONFLICT");

const missing=handle(new ContractNotFoundError("nonexistent-contract"));
assert.equal(missing.status,404,"missing Contract must be HTTP 404, never HTTP 500");

const unexpected=handle(new Error("unexpected internal failure"));
assert.equal(unexpected.status,500);
assert.equal(unexpected.result.error.message,"An unexpected internal error occurred");

console.log("PASS Stage 6 HTTP boundary: overlap 409, missing contract 404, unexpected faults 500.");
