import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useInvalidateOnAlertCount } from "./useInvalidateOnAlertCount";
import * as AuthContextModule from "../context/AuthContext";

vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual<typeof AuthContextModule>("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockUseAuth = vi.mocked(AuthContextModule.useAuth);

describe("useInvalidateOnAlertCount", () => {
  let counts: number[];
  let client: QueryClient;

  beforeEach(() => {
    counts = [2];
    mockUseAuth.mockReturnValue({
      user: { id: 5, email: "a@example.com", name: "A", systemRole: "STUDENT" },
      token: "t", loading: false,
      register: vi.fn(), login: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(),
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true, json: async () => ({ unreadCount: counts[0] }),
    })));
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  it("ignores the first count, then invalidates only the given prefixes when it changes", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useInvalidateOnAlertCount([["group", 5], ["disputes", 5, "mine"]]), { wrapper });

    await waitFor(() => expect(client.getQueryData(["alerts", "unread-count", 5])).toBe(2));
    expect(spy).not.toHaveBeenCalled();

    counts[0] = 3;
    await client.invalidateQueries({ queryKey: ["alerts", "unread-count", 5] });
    spy.mockClear();
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    const keys = spy.mock.calls.map((c) => c[0]?.queryKey);
    expect(keys).toEqual([["group", 5], ["disputes", 5, "mine"]]);
  });

  it("does not invalidate when the count is unchanged", async () => {
    const spy = vi.spyOn(client, "invalidateQueries");
    renderHook(() => useInvalidateOnAlertCount([["group", 5]]), { wrapper });
    await waitFor(() => expect(client.getQueryData(["alerts", "unread-count", 5])).toBe(2));

    await client.invalidateQueries({ queryKey: ["alerts", "unread-count", 5] }); // refetch, same value
    spy.mockClear();
    await new Promise((r) => setTimeout(r, 50));
    expect(spy).not.toHaveBeenCalled();
  });
});
