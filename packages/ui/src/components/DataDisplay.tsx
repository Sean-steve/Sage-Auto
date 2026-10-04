import React from "react";
import { ArrowRight, MapPin } from "lucide-react";
import { cn } from "@carhire/utils";

export function PageSection({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("space-y-5",className)}>
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-3xl">
        {eyebrow&&<p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">{eyebrow}</p>}
        <h2 className="mt-1 text-xl font-semibold tracking-[-0.025em] text-slate-950 dark:text-white">{title}</h2>
        {description&&<p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions&&<div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
    {children}
  </section>;
}

export function MetricCard({
  label,
  value,
  detail,
  trend,
  icon,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  trend?: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
}) {
  const content=<>
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      {icon&&<span className="text-slate-400">{icon}</span>}
    </div>
    <div className="mt-3 flex items-baseline gap-3">
      <span className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 [font-variant-numeric:tabular-nums] dark:text-white">{value}</span>
      {trend&&<span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{trend}</span>}
    </div>
    {detail&&<div className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{detail}</div>}
  </>;
  const styles="w-full rounded-[14px] border border-slate-200 bg-white p-5 text-left shadow-[0_1px_2px_rgba(16,24,40,.04)] dark:border-slate-800 dark:bg-slate-900";
  return onClick
    ? <button onClick={onClick} className={cn(styles,"transition hover:border-slate-300 hover:bg-slate-50/60 dark:hover:bg-slate-800/60")}>{content}</button>
    : <div className={styles}>{content}</div>;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return <div className="grid min-h-48 place-items-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50/60 p-8 text-center dark:border-slate-700 dark:bg-slate-900/50">
    <div className="max-w-md">
      {icon&&<div className="mx-auto mb-4 grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 dark:border-slate-700 dark:bg-slate-900">{icon}</div>}
      <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
      {action&&<div className="mt-4">{action}</div>}
    </div>
  </div>;
}

export function Skeleton({className}: {className?:string}) {
  return <span aria-hidden="true" className={cn("sage-skeleton block h-4 w-full",className)}>Loading</span>;
}

export function DataToolbar({children,className}:{children:React.ReactNode;className?:string}) {
  return <div className={cn("flex flex-col gap-3 rounded-[14px] border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,.04)] sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900",className)}>{children}</div>;
}

export function TableFrame({children,className}:{children:React.ReactNode;className?:string}) {
  return <div className={cn("overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,.04)] dark:border-slate-800 dark:bg-slate-900",className)}>
    <div className="overflow-x-auto">{children}</div>
  </div>;
}

export function ChartFrame({
  title,
  description,
  action,
  children,
  footer,
  className,
}:{
  title:string;
  description?:string;
  action?:React.ReactNode;
  children:React.ReactNode;
  footer?:React.ReactNode;
  className?:string;
}) {
  return <section className={cn("sage-chart",className)}>
    <header className="mb-5 flex items-start justify-between gap-4">
      <div><h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>{description&&<p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}</div>
      {action}
    </header>
    <div className="min-h-56">{children}</div>
    {footer&&<footer className="mt-4 border-t border-slate-200 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">{footer}</footer>}
  </section>;
}

export function MapFrame({
  title,
  description,
  children,
  action,
  className,
}:{
  title:string;
  description?:string;
  children?:React.ReactNode;
  action?:React.ReactNode;
  className?:string;
}) {
  return <section className={cn("overflow-hidden rounded-[14px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",className)}>
    <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800">
      <div className="flex gap-3"><MapPin size={17} className="mt-0.5 text-emerald-700"/><div><h3 className="text-sm font-semibold text-slate-950 dark:text-white">{title}</h3>{description&&<p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>}</div></div>
      {action}
    </header>
    <div className="sage-map rounded-none border-0">{children||<div className="grid min-h-[360px] place-items-center p-8 text-center text-sm text-slate-500">Map data appears here when live location telemetry is connected.</div>}</div>
  </section>;
}

export function InlineAction({children,onClick}:{children:React.ReactNode;onClick?:()=>void}) {
  return <button onClick={onClick} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-400">{children}<ArrowRight size={13}/></button>;
}
