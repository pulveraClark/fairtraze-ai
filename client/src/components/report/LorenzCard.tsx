import { CARD } from "../ui";
import { lorenzPoints, lowestHalf } from "../../lib/lorenz";

interface Props {
  shares: number[];
  /** The server's stored Gini. Shown as-is; the curve is never used to compute or replace it. */
  gini: number;
}

const SIZE = 200;
const PAD = 8;

/** Display-only Lorenz curve drawn from the members' stored contribution shares. */
export function LorenzCard({ shares, gini }: Props) {
  const pts = lorenzPoints(shares);
  const inner = SIZE - PAD * 2;
  const toX = (x: number) => PAD + x * inner;
  const toY = (y: number) => PAD + (1 - y) * inner;
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`).join(" ");
  const half = lowestHalf(shares);

  return (
    <section aria-labelledby="lorenz-title" className={`${CARD} min-w-0 p-5`}>
      <h2 id="lorenz-title" className="text-lg font-semibold text-slate-900">Lorenz curve</h2>
      <p className="mt-1 text-sm leading-normal text-slate-700">
        Members ordered from lowest to highest contribution. The further the curve sits below the dashed line, the more uneven the split.
      </p>

      <div className="mx-auto mt-4 w-full max-w-xs">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-labelledby="lorenz-svg-title" className="block h-auto w-full rounded-lg border border-slate-200 bg-slate-50">
          <title id="lorenz-svg-title">Lorenz curve of member contribution shares</title>
          <line x1={toX(0)} y1={toY(0)} x2={toX(1)} y2={toY(1)} stroke="#475569" strokeWidth={1.5} strokeDasharray="5 4" />
          <path d={path} fill="none" stroke="#4338ca" strokeWidth={2.5} strokeLinejoin="round" />
          {pts.map((p, i) => (
            <circle key={i} cx={toX(p.x)} cy={toY(p.y)} r={3.5} fill="#4338ca" stroke="#fff" strokeWidth={1} />
          ))}
        </svg>
        <p className="mt-2 text-center text-sm text-slate-700">Cumulative share of members →</p>
        <p className="text-center text-sm text-slate-700">↑ Cumulative share of contribution</p>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-800">
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block h-0.5 w-6 bg-indigo-700" />Actual split</li>
        <li className="flex items-center gap-2"><span aria-hidden="true" className="inline-block w-6 border-t-2 border-dashed border-slate-600" />Equal split</li>
      </ul>

      <p className="mt-3 text-base leading-normal text-slate-800">
        <span className="font-semibold">Gini coefficient: {gini.toFixed(3)}</span> <span className="text-slate-700">(from the stored report)</span>
      </p>
      {half && (
        <p className="mt-1 text-sm leading-normal text-slate-700">
          The lowest-contributing {half.count} of {half.of} members account for {(half.share * 100).toFixed(1)}% of total contribution
          (an equal split would be {(half.equalShare * 100).toFixed(1)}%).
        </p>
      )}

      <table className="sr-only">
        <caption>Lorenz curve points</caption>
        <thead><tr><th scope="col">Cumulative share of members</th><th scope="col">Cumulative share of contribution</th></tr></thead>
        <tbody>
          {pts.map((p, i) => (
            <tr key={i}><td>{(p.x * 100).toFixed(1)}%</td><td>{(p.y * 100).toFixed(1)}%</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
