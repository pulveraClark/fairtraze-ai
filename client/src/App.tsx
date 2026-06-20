import { useRouter } from "./router";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DemoPage } from "./pages/DemoPage";
import { OverviewPage } from "./pages/OverviewPage";

export default function App() {
  const { pathname } = useRouter();

  if (pathname === "/login")    return <LoginPage />;
  if (pathname === "/register") return <RegisterPage />;
  if (pathname === "/demo")     return <DemoPage />;
  if (pathname === "/overview") return <OverviewPage />;
  return <LandingPage />;
}
