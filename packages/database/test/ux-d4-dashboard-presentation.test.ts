import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { TenantDashboardOverviewDto, TimeSeriesPoint } from "@carhire/types";
import {
  bucketSeries, bookingsForPeriod, canRead, currencyText, dashboardValidForTenant,
  financialSeriesFor, granularityFor, hasDashboardRights, percentage,
} from "../../../src/lib/dashboard-presentation";
import {
  BookingVolumeChart, FinanceTrendChart, FleetDistributionChart,
} from "../../../src/components/dashboard/ExecutiveCharts";

async function main() {
  const company:any = {
    id:"tenant-A", tenantId:"tenant-A", kind:"tenant", sections:[{id:"overview",label:"Overview"}],
    permissions:["analytics.read","vehicle.read","booking.read","rental.read","invoice.read",
      "payment.read","ledger.read","crm.lead.read","crm.quote.read"],
  };
  assert.equal(hasDashboardRights(company),true,"Company full permissions should unlock its dashboard");
  assert.equal(hasDashboardRights({...company,permissions:["analytics.read","booking.read"]}),false);
  assert.equal(hasDashboardRights({...company,kind:"vehicle-owner"}),false);
  assert.equal(canRead(company,"ledger.read"),true);
  assert.equal(canRead({...company,permissions:[]},"ledger.read"),false);

  const day=(key:string,value:number):TimeSeriesPoint=>({
    timestamp:key+"T00:00:00.000Z",label:key,value,currency:"KES",
  });
  const samples=[day("2026-11-01",500),day("2026-11-02",300),day("2026-11-03",-100)];
  assert.deepEqual(bucketSeries(samples),[
    {key:"2026-11-01",label:"Nov 1",value:500},
    {key:"2026-11-02",label:"Nov 2",value:300},
    {key:"2026-11-03",label:"Nov 3",value:-100},
  ]);
  assert.equal(bucketSeries([day("2026-11-01",500),day("2026-11-02",-100)],"week")[0].value,400);
  assert.equal(granularityFor(Array.from({length:31},(_,i)=>day("2026-11-01",i))),"day");
  assert.equal(granularityFor(Array.from({length:65},(_,i)=>day("2026-11-01",i))),"week");
  assert.equal(granularityFor(Array.from({length:200},(_,i)=>day("2026-11-01",i))),"month");
  assert.equal(currencyText(null,"KES"),"Unavailable");
  assert.equal(percentage(null),"Unavailable");
  assert.throws(()=>bucketSeries([day("2026-11-03",Number.NaN)]),/invalid value/);

  const overview={
    tenantId:"tenant-A",period:{from:"2026-11-01T00:00:00Z",to:"2026-11-04T00:00:00Z",preset:"CUSTOM"},
    tenantTimezone:"Africa/Nairobi",currency:"KES",dataAsOf:new Date().toISOString(),
    headlineKpis:{utilizationRate:{value:25},pendingHandovers:{value:1}},
    financialSummary:{grossInvoiced:2000,netRevenue:1500,postedRevenue:700,cashReceipts:800,
      outstandingReceivables:1200,trialBalanceReconciled:false},
    fleetStatus:{total:8,available:3,onRent:2,reserved:1,maintenance:1,blocked:1,utilizationRate:25},
    revenueChart:samples,
    cashCollectionsChart:[day("2026-11-01",800),day("2026-11-02",0),day("2026-11-03",0)],
    grossInvoicedChart:[day("2026-11-01",2000),day("2026-11-02",0),day("2026-11-03",0)],
    bookingVolumeChart:[day("2026-11-01",2),day("2026-11-02",1),day("2026-11-03",0)],
    utilizationChart:[],
    chartAvailability:{postedRevenue:"VERIFIED",cashCollections:"VERIFIED",grossInvoiced:"VERIFIED",
      bookingVolume:"VERIFIED",utilization:"UNAVAILABLE"},
    recentActivity:[],
  } as unknown as TenantDashboardOverviewDto;

  assert.equal(dashboardValidForTenant(overview,company),true);
  assert.equal(dashboardValidForTenant(overview,{...company,tenantId:"tenant-B"}),false,"Reject foreign tenant analytics");
  assert.equal(bookingsForPeriod(overview),3,"Period bookings must use D3 trend not lifetime total");
  assert.equal(financialSeriesFor(overview,"postedRevenue")?.length,3);
  assert.equal(financialSeriesFor({...overview,chartAvailability:{...overview.chartAvailability!,postedRevenue:"UNAVAILABLE"}},"postedRevenue"),null);
  assert.equal(bookingsForPeriod({...overview,chartAvailability:{...overview.chartAvailability!,bookingVolume:"UNAVAILABLE"}}),null);

  const line=renderToStaticMarkup(React.createElement(FinanceTrendChart,{overview}));
  assert.match(line,/Revenue and collections/);
  assert.match(line,/posted general ledger|posted general ledger journals|ledger-posted/i);
  assert.match(line,/Financial chart metric/);
  assert.match(line,/Focus or hover/);
  assert.equal(line.includes("NaN"),false);
  const bookings=renderToStaticMarkup(React.createElement(BookingVolumeChart,{overview}));
  assert.match(bookings,/Booking trends/);
  assert.match(bookings,/New bookings by period/);
  const fleet=renderToStaticMarkup(React.createElement(FleetDistributionChart,{overview}));
  assert.match(fleet,/Current active vehicles/);
  assert.match(fleet,/Historical fleet capacity is not yet certified/);
  assert.equal(fleet.includes("NaN"),false);

  const unavailable=renderToStaticMarkup(React.createElement(FinanceTrendChart,{
    overview:{...overview,chartAvailability:{...overview.chartAvailability!,postedRevenue:"UNAVAILABLE"}},
  }));
  assert.match(unavailable,/Financial series unavailable/);
  assert.equal(unavailable.includes("700"),false,"No bogus revenue value when series unavailable");

  console.log("UX-D4 PASS: permission-safe presentation, tenant isolation, grouping, empty states, chart accessibility and no fake financial fallbacks");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
