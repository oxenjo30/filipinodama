import { Outlet } from "react-router-dom";
import { TopNav } from "../nav/TopNav";
import { MobileNav } from "../nav/MobileNav";
import { Toasts } from "../shared/Toasts";

/**
 * AppLayout — the shared chrome around every screen: the fixed background field
 * (dots + radial glow), the sticky desktop TopNav, the mobile nav bar, and the
 * global toast stack. Routed screens render into <Outlet/>.
 */
export function AppLayout() {
  return (
    <>
      <div className="fd-bg" />
      <div className="fd-bg-dots" />
      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <TopNav />
        <MobileNav />
        <main style={{ flex: 1 }}>
          <Outlet />
        </main>
      </div>
      <Toasts />
    </>
  );
}

export default AppLayout;
