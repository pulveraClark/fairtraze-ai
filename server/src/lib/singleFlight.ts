// Share one in-flight promise between callers that ask for the same key at the same moment.
// Nothing is kept: the entry is removed the instant the promise settles (success or failure), so the next call
// always runs fresh. Different keys never share. This is not a cache.
const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => fn())().finally(() => {
    if (inFlight.get(key) === p) inFlight.delete(key);
  });
  inFlight.set(key, p);
  return p;
}

/** Freezes plain objects and arrays all the way down so one waiter cannot change what another reads. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value) && !(value instanceof Date)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}
