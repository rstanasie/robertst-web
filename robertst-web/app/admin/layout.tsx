import type { Metadata } from "next";

import "./admin.css";

/**
 * The CMS shell. Deliberately shallow: the authorization boundary is one level
 * down, in the (workspace) group, so that /admin/login can share this styling
 * without sharing the guard.
 */
export const metadata: Metadata = {
  title: "CMS",
  // Belt and braces alongside the robots route: nothing under /admin is public,
  // so nothing under /admin should ever be indexed.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="cms">{children}</div>;
}
