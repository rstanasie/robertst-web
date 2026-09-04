import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";
import SignInForm from "@/components/cms/SignInForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (await getSessionUser()) {
    redirect("/admin");
  }

  const { next } = await searchParams;

  // Only ever return somewhere inside the CMS, so a crafted ?next= cannot turn
  // the sign-in form into an open redirect.
  const target = next && next.startsWith("/admin") ? next : "/admin";

  return (
    <div className="cms-signin">
      <SignInForm next={target} />
    </div>
  );
}
