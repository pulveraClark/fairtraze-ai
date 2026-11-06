import { useState } from "react";
import { DisclosureSection } from "./DrawerParts";
import { howCounted, type HowCountedInput } from "../../lib/howCounted";

/** Closed-by-default "How this was counted" section. Display only; reads numbers the report already stores. */
export function HowCounted(props: HowCountedInput) {
  const [open, setOpen] = useState(false);
  const model = howCounted(props);
  if (model.blocks.length === 0) return null;
  return (
    <DisclosureSection
      title="How this was counted"
      subtitle="What counts, what counts less and what does not"
      open={open}
      onToggle={setOpen}
    >
      <div className="space-y-4">
        {model.blocks.map((b) => (
          <div key={b.source}>
            <h4 className="mb-1 text-sm font-semibold text-slate-900">{b.source}</h4>
            <div className="space-y-1.5 text-sm leading-normal text-slate-800">
              {b.groups.map((g) => (
                <p key={g.label}><span className="font-semibold text-slate-900">{g.label}: </span>{g.text}</p>
              ))}
            </div>
          </div>
        ))}
        <div className="space-y-0.5 text-xs leading-normal text-slate-700">
          {model.footer.map((line) => <p key={line}>{line}</p>)}
        </div>
      </div>
    </DisclosureSection>
  );
}
