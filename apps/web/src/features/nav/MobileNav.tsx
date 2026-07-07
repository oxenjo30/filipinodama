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

  // Unread direct-messages total, from a REAL source. No DM/chat backend exists
  // yet, so this is honestly 0 and the Profile-tab badge stays hidden. When the
  // DM backend lands, replace this with the live unread count and the badge
  // (prototype line 180) lights up automatically.
  const unreadMessages = 0;

  return (
    <nav className="fd-mnav">
      {links.map((l) => (
        <button
          key={l.to}
          className={`navlink ${isNavActive(l.to, pathname) ? "on" : ""}`}
          onClick={() => navigate(l.to)}
          style={l.to === "/profile" ? { position: "relative" } : undefined}
        >
          {l.mobileLabel ?? l.label}
          {l.to === "/profile" && unreadMessages > 0 && (
            <span
              title="Unread messages"
              style={{ position: "absolute", top: -3, right: -5, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 9, background: "linear-gradient(180deg,#e0555f,#a8202f)", color: "#fff", font: "800 10px Inter", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #150a24", boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}
            >
              {unreadMessages > 9 ? "9+" : unreadMessages}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
}

export default MobileNav;
