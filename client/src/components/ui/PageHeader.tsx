import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "../layout/Breadcrumbs";

interface Props {
  breadcrumbs: Crumb[];
  title: string;
  badges?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

/** Breadcrumbs, title with badges, a meta line, and actions on the right (wrapping on narrow screens). */
export function PageHeader({ breadcrumbs, title, badges, meta, actions }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1 basis-72">
        <Breadcrumbs items={breadcrumbs} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="break-words text-xl font-semibold leading-tight text-slate-900">{title}</h1>
          {badges}
        </div>
        {meta && <div className="mt-1 break-words text-xs leading-normal text-slate-700">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
