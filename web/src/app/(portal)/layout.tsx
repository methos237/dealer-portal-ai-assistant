import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { DraftReplayer } from "@/components/DraftReplayer";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/units", label: "Units" },
  { href: "/claims", label: "Claims" },
  { href: "/parts-orders", label: "Parts orders" },
  { href: "/reports", label: "Reports" },
  { href: "/documents", label: "Documents" },
  { href: "/assistant", label: "Assistant" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");
  const isThorAdmin = session.roles.includes("Thor.Admin");
  return (
    <>
      <header className="border-b bg-white">
        <nav
          className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3"
          aria-label="Main"
        >
          <Link href="/dashboard" className="font-semibold text-blue-900">
            Dealer Portal
          </Link>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm text-slate-700 hover:text-blue-800"
            >
              {l.label}
            </Link>
          ))}
          {isThorAdmin && (
            <Link
              href="/claims?status=PendingApproval"
              className="text-sm text-amber-800 hover:text-amber-900"
            >
              Approvals
            </Link>
          )}
          <span className="ml-auto text-sm text-slate-500">
            {session.user?.name} · {session.roles.join(", ") || "no role"}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="text-sm text-slate-600 underline">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-6">{children}</main>
      <DraftReplayer />
    </>
  );
}
