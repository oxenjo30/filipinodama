import { useLocation, useNavigate } from "react-router-dom";
import { NAV_LINKS, MOBILE_EXTRA, isNavActive } from "./navLinks";

/**
 * MobileNav — the `.fd-mnav` horizontal-scroll bar shown ≤1100px (styling in
 * index.css). Same destinations as the desktop nav plus a Profile tab, using the
 * shorter mobile labels where the prototype defines them.
 */
export function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const links = [...NAV_LINKS, ...MOBILE_EXTRA];

  return (
    <nav className="fd-mnav">
      {links.map((l) => (
        <button
          key={l.to}
          className={`navlink ${isNavActive(l.to, pathname) ? "on" : ""}`}
          onClick={() => navigate(l.to)}
        >
          {l.mobileLabel ?? l.label}
        </button>
      ))}
    </nav>
  );
}

export default MobileNav;
