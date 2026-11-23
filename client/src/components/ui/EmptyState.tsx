import type { ReactNode } from "react";
import { CARD } from "./styles";

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`${CARD} flex flex-col items-center gap-3 p-8 text-center`}>
      <div aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-xl font-semibold text-slate-700">?</div>
      <div>
        <p className="text-base font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-1 text-sm leading-normal text-slate-700">{description}</p>}
      </div>
      {action}
    </div>
  );
}
