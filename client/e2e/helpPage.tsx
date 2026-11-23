import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { RouterProvider } from "../src/router";
import { AuthProvider } from "../src/context/AuthContext";
import { ToastProvider } from "../src/components/Toast";
import App from "../src/App";

// The real app at /help. ?auth=1 signs in a fake student; the API is faked, no backend.
const params = new URLSearchParams(location.search);
if (params.get("auth") === "1") localStorage.setItem("ft_auth_token", "t");
else localStorage.removeItem("ft_auth_token");

const student = {
  id: 1, email: "member.a@example.com", name: "Member A", systemRole: "STUDENT",
  emailVerified: true, consentRequired: false, consentVersion: "1.1",
};
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes("/api/auth/refresh")) return json({ token: "t", user: student });
  if (url.includes("/api/auth/me")) return json(student);
  return json([]);
}) as typeof fetch;

// Land on /help without a page load (the Vite dev server only serves this harness at its own path).
history.replaceState(null, "", `/help${location.hash}`);

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </RouterProvider>
  </QueryClientProvider>,
);
