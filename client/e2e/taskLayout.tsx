import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/geist";
import "../src/index.css";
import { AuthProvider } from "../src/context/AuthContext";
import { ToastProvider } from "../src/components/Toast";
import { TasksTab } from "../src/components/tasks/TasksTab";

const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });

// The same width rules the real group pages put around the Tasks tab (max-w-7xl, side padding, min-w-0).
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <AuthProvider>
      <ToastProvider>
        <main className="mx-auto w-full min-w-0 max-w-7xl space-y-4 px-4 py-4 sm:px-8">
          <TasksTab projectId={7} onOpenDocument={() => undefined} />
        </main>
      </ToastProvider>
    </AuthProvider>
  </QueryClientProvider>,
);
