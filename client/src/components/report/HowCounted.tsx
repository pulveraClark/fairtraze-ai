import { useState } from "react";
import { DisclosureSection } from "./DrawerParts";
import { COUNT_TONE } from "../ui/styles";
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
      <div className="space-y-6">
        {model.blocks.map((b) => (
          <section key={b.source}>
            <h4 className="text-lg font-semibold text-slate-900">{b.source}</h4>
            {b.note && <p className="mb-2 mt-0.5 text-sm leading-normal text-slate-700">{b.note}</p>}
            <div className={`${b.note ? "" : "mt-2 "}space-y-2`}>
              {b.groups.map((g) => {
                const tone = COUNT_TONE[g.tone];
                return (
                  <div
                    key={g.label}
                    className={`flex flex-col gap-1.5 border-l-[3px] py-1 pl-3 sm:flex-row sm:items-start sm:gap-3 ${tone.border}`}
                  >
                    <h5 className={`m-0 inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-lg font-bold leading-snug sm:w-[150px] ${tone.chip}`}>
                      <span aria-hidden="true">{g.symbol}</span>
                      <span>{g.label}</span>
                    </h5>
                    <ul className="m-0 min-w-0 list-none space-y-1 p-0 text-lg leading-normal text-slate-800">
                      {g.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <div className="space-y-1 text-lg leading-normal text-slate-700">
          {model.footer.map((line) => <p key={line} className="m-0">{line}</p>)}
        </div>
      </div>
    </DisclosureSection>
  );
}
