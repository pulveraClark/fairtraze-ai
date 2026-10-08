import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QrScanner, cameraErrorMessage } from "./QrScanner";

afterEach(() => {
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
});

function setGetUserMedia(fn: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: fn }, configurable: true });
}

describe("QrScanner", () => {
  it("shows a clear message when camera permission is denied", async () => {
    setGetUserMedia(() => Promise.reject(Object.assign(new Error("x"), { name: "NotAllowedError" })));
    render(<QrScanner onResult={() => {}} onCancel={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/denied/i);
  });

  it("shows a clear message when there is no camera", async () => {
    setGetUserMedia(() => Promise.reject(Object.assign(new Error("x"), { name: "NotFoundError" })));
    render(<QrScanner onResult={() => {}} onCancel={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/no camera/i);
  });

  it("reports the scanned text and stops the camera; also stops on unmount", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    setGetUserMedia(() => Promise.resolve(stream));
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        detect() { return Promise.resolve([{ rawValue: "https://x.test/join?code=ABC" }]); }
      }
    );
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    const onResult = vi.fn();
    const { unmount } = render(<QrScanner onResult={onResult} onCancel={() => {}} />);
    await waitFor(() => expect(onResult).toHaveBeenCalledWith("https://x.test/join?code=ABC"));
    expect(stop).toHaveBeenCalled();
    unmount();
  });

  it("maps error names", () => {
    expect(cameraErrorMessage({ name: "OverconstrainedError" })).toMatch(/no camera/i);
    expect(cameraErrorMessage(new Error("boom"))).toMatch(/could not start/i);
  });
});
