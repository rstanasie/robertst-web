import Link from "next/link";

import { requireUserOrRedirect } from "@/lib/auth/guard";
import { signOutAction } from "../actions";

/**
 * The authorization boundary for the whole tool.
 *
 * Everything rendered inside this layout has a session behind it. That is not
 * the only check — every server action verifies independently, because an
 * action is reachable without ever rendering a page — but it is what makes an
 * unauthenticated visit to any CMS route a redirect rather than a blank shell.
 */
export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserOrRedirect();

  return (
    <>
      <header className="cms-bar">
        <Link href="/admin" className="cms-bar__mark">
          Amphora CMS
        </Link>

        <nav aria-label="CMS sections">
          <Link href="/admin">Stories</Link>
          <Link href="/admin/collections">Collections</Link>
          <Link href="/admin/media">Media</Link>
          <Link href="/">View site</Link>
        </nav>

        <span className="cms-bar__who">{user.name ?? user.email}</span>

        <form action={signOutAction}>
          <button type="submit" className="cms-btn cms-btn--quiet" style={{ color: "#c8bda9" }}>
            Sign out
          </button>
        </form>
      </header>

      <main className="cms-main">{children}</main>
    </>
  );
}
