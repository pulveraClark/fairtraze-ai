import { useEffect, useRef, useState } from "react";

type Decoder = (video: HTMLVideoElement) => Promise<string | null>;

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}

async function createDecoder(): Promise<Decoder> {
  const BD = (window as unknown as {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }).BarcodeDetector;
  if (BD) {
    const detector = new BD({ formats: ["qr_code"] });
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
  }
  // Fallback: lazy-loaded so the scanner library is not in the main bundle.
  const { BrowserQRCodeReader } = await import("@zxing/browser");
  const reader = new BrowserQRCodeReader();
  const canvas = document.createElement("canvas");
  return async (video) => {
    if (!video.videoWidth) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    try {
      return reader.decodeFromCanvas(canvas).getText();
    } catch {
      return null; // NotFoundException every frame without a QR in view
    }
  };
}

export function cameraErrorMessage(err: unknown): string {
  const name = (err as { name?: string } | null)?.name;
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was denied. Allow camera permission in your browser, or type the code instead.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "No camera found on this device. Type the code instead.";
  }
  return "Could not start the camera. Type the code instead.";
}

export function QrScanner({
  onResult,
  onCancel,
}: {
  onResult: (text: string) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("No camera found on this device (or the page is not served over HTTPS). Type the code instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        if (!video) { stop(); return; }
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        const decode = await createDecoder();
        const tick = async () => {
          if (stopped) return;
          try {
            const text = await decode(video);
            if (text && !stopped) { stop(); onResultRef.current(text); return; }
          } catch { /* transient decode failure — keep scanning */ }
          timer = setTimeout(() => void tick(), 200);
        };
        void tick();
      } catch (err) {
        stop();
        setError(cameraErrorMessage(err));
      }
    }

    void start();
    return stop;
  }, []);

  return (
    <div className="space-y-2">
      {error ? (
        <p role="alert" className="text-xs text-red-700">{error}</p>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-black aspect-square">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" aria-label="Camera preview" />
        </div>
      )}
      {!error && <p className="text-xs text-slate-600">Point the camera at the class QR code.</p>}
      <button
        type="button"
        onClick={onCancel}
        className="min-h-9 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
      >
        {error ? "Close" : "Cancel scan"}
      </button>
    </div>
  );
}
