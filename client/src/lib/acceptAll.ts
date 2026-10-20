/** What "Accept all" will do, given the group's member limit. The server enforces the same rule (oldest first). */
export interface AcceptAllPlan {
  /** How many requests will be accepted. */
  accepting: number;
  /** How many stay pending because the group is full. */
  leftOver: number;
  title: string;
  detail: string | null;
}

const plural = (n: number) => `${n} request${n === 1 ? "" : "s"}`;

export function planAcceptAll(pending: number, members: number, maxGroupSize: number | null): AcceptAllPlan {
  const slots = maxGroupSize == null ? pending : Math.max(0, maxGroupSize - members);
  const accepting = Math.min(pending, slots);
  const leftOver = pending - accepting;
  if (accepting === 0) {
    return { accepting, leftOver, title: "The group is full", detail: `The limit is ${maxGroupSize} members. No requests can be accepted.` };
  }
  return {
    accepting,
    leftOver,
    title: `Accept ${plural(accepting)}?`,
    detail: leftOver > 0
      ? `Only ${accepting} fit (limit ${maxGroupSize}). The oldest ${accepting} will be accepted; ${leftOver} will stay pending.`
      : null,
  };
}
