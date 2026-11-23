import { describe, it, expect } from "vitest";
import {
  ActionError,
  GENERIC_ERROR_TEXT,
  NETWORK_ERROR_TEXT,
  SLOW_AFTER_MS,
  SLOW_TEXT,
  ensureOk,
  errorMessage,
} from "./feedback";

describe("errorMessage", () => {
  it("uses the plain message of an ActionError", () => {
    expect(errorMessage(new ActionError("The group is full."), "x")).toBe("The group is full.");
  });
  it("turns a browser network failure into one calm sentence", () => {
    expect(errorMessage(new TypeError("Failed to fetch"), "x")).toBe(NETWORK_ERROR_TEXT);
    expect(errorMessage(new Error("NetworkError when attempting to fetch resource."), "x")).toBe(NETWORK_ERROR_TEXT);
  });
  it("keeps a plain Error message and falls back for anything else", () => {
    expect(errorMessage(new Error("Someone else changed this task."), "x")).toBe("Someone else changed this task.");
    expect(errorMessage("boom", "Could not save. Try again.")).toBe("Could not save. Try again.");
    expect(errorMessage(undefined)).toBe(GENERIC_ERROR_TEXT);
  });
});

describe("ensureOk", () => {
  it("passes an ok response through", async () => {
    const res = new Response("{}", { status: 200 });
    await expect(ensureOk(res, "x")).resolves.toBe(res);
  });
  it("throws the server's error text when there is one", async () => {
    const res = new Response(JSON.stringify({ error: "That code is not valid." }), { status: 400 });
    await expect(ensureOk(res, "Could not join. Try again.")).rejects.toMatchObject({
      message: "That code is not valid.",
      status: 400,
    });
  });
  it("uses the fallback when the body is not JSON", async () => {
    await expect(ensureOk(new Response("<html>", { status: 502 }), "Could not join. Try again.")).rejects.toThrow(
      "Could not join. Try again.",
    );
  });
});

describe("shared wording", () => {
  it("has one slow line and a 3 second threshold", () => {
    expect(SLOW_TEXT).toBe("This is taking longer than usual.");
    expect(SLOW_AFTER_MS).toBe(3000);
  });
});
