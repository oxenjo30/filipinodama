/** The primary nav destinations, shared by the desktop nav and mobile bar.
 *  `mobileLabel` matches the prototype's shorter mobile labels (e.g. "Ranks"). */
export type NavLink = { to: string; label: string; mobileLabel?: string };

// Quests + Learn moved UNDER Play (see AppLayout NAV). On the mobile bar they're
// no longer top-level tabs; they're reachable via Play → the hamburger drawer
// nests them under Play.
export const NAV_LINKS: NavLink[] = [
  { to: "/", label: "Home" },
  { to: "/play", label: "Play" },
  { to: "/leaderboard", label: "Leaderboard", mobileLabel: "Ranks" },
  { to: "/store", label: "Store" },
];

/** Extra link shown only on the mobile bar (desktop puts Profile in the menu). */
export const MOBILE_EXTRA: NavLink[] = [{ to: "/profile", label: "Profile" }];

/** A nav link is "active" for exact match, or for the Play sub-tree under /play. */
export function isNavActive(linkTo: string, pathname: string): boolean {
  if (linkTo === "/") return pathname === "/";
  return pathname === linkTo || pathname.startsWith(linkTo + "/");
}
