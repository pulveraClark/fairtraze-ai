import { useEffect, useState } from "react";

const STEPS = [
  {
    label: "Data Collection",
    desc: "Fetching per-contributor commit history from GitHub",
  },
  {
    label: "Contribution Profiling",
    desc: "Computing weighted scores and contribution shares",
  },
  {
    label: "Participation Imbalance Detection",
    desc: "Evaluating flags and Gini coefficient",
  },
  {
    label: "Significance Scoring",
    desc: "Applying file-type weights, commit impact, and self-churn penalty",
  },
  {
    label: "Saving Report",
    desc: "Persisting scores and flags; AI explanation available on demand",
  },
];

// Approximate cumulative times (ms) at which each step becomes active.
// Step 5 is resolved externally when the API call completes.
const STEP_DELAYS = [0, 4000, 7000, 10000];

interface Props {
  done: boolean; // true when the API call has completed successfully
}

export function AnalysisStepper({ done }: Props) {
  const [activeStep, setActiveStep] = useState(0); // 0-indexed

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    STEP_DELAYS.forEach((delay, i) => {
      timers.push(setTimeout(() => setActiveStep(i), delay));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  // When the API call finishes, jump to the last step as "active" briefly
  useEffect(() => {
    if (done) setActiveStep(STEPS.length - 1);
  }, [done]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-5">
        Analysis in progress
      </p>
      <ol className="space-y-4">
        {STEPS.map((step, i) => {
          const isComplete = done ? i < STEPS.length : i < activeStep;
          const isActive = !done && i === activeStep;
          const isPending = !done && i > activeStep;

          return (
            <li key={step.label} className="flex items-start gap-3">
              {/* Status dot */}
              <div className="mt-0.5 shrink-0 flex flex-col items-center">
                {isComplete ? (
                  <span className="h-5 w-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-600 text-xs">
                    ✓
                  </span>
                ) : isActive ? (
                  <span className="h-5 w-5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                ) : (
                  <span className="h-5 w-5 rounded-full bg-slate-100 border border-slate-200" />
                )}
                {i < STEPS.length - 1 && (
                  <span
                    className={`w-px flex-1 mt-1 mb-[-12px] h-4 ${
                      isComplete ? "bg-emerald-200" : "bg-slate-100"
                    }`}
                  />
                )}
              </div>

              {/* Text */}
              <div className="pb-1">
                <p
                  className={`text-sm font-semibold leading-tight ${
                    isComplete
                      ? "text-emerald-700"
                      : isActive
                      ? "text-indigo-700"
                      : "text-slate-400"
                  }`}
                >
                  Step {i + 1} · {step.label}
                </p>
                <p
                  className={`text-xs mt-0.5 ${
                    isPending ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {step.desc}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {!done && (
        <p className="mt-5 text-xs text-slate-400">
          Data collection from GitHub usually takes the longest (10–30 seconds).
        </p>
      )}
    </div>
  );
}
