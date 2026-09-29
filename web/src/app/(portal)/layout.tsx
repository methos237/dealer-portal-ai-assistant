import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signOutAction } from "@/lib/auth-actions";
import { DraftReplayer } from "@/components/DraftReplayer";
import { Close, Mark, Menu } from "@/components/icons";
import { PortalNav, type NavLink } from "@/components/PortalNav";
import { ThemeToggle } from "@/components/ThemeToggle";

const links: NavLink[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/units", label: "Units" },
  { href: "/claims", label: "Claims" },
  { href: "/parts-orders", label: "Parts orders" },
  { href: "/reports", label: "Reports" },
  { href: "/documents", label: "Documents" },
  { href: "/assistant", label: "Assistant" },
];

const portalRoles = ["Dealer.User", "Dealer.Admin", "Thor.Admin"];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/");
  if (!session.roles.some((r) => portalRoles.includes(r))) {
    // The api would answer 403 to every call; say why instead of surfacing that as an error.
    return (
      <main className="mx-auto mt-16 max-w-xl px-4">
        <div className="card p-8">
          <h1 className="text-2xl">No portal role on this account</h1>
          <p className="mt-3 text-fg-muted">
            {session.user?.email ?? "This account"} signed in, but the token
            carries none of the roles Dealer.User, Dealer.Admin or Thor.Admin.
            Ask a THOR administrator to assign one, then sign out and back in.
          </p>
          <form action={signOutAction} className="mt-6">
            <button className="btn btn-primary">Sign out</button>
          </form>
        </div>
      </main>
    );
  }
  const isThorAdmin = session.roles.includes("Thor.Admin");
  const nav = isThorAdmin
    ? [
        ...links,
        {
          href: "/claims?status=PendingApproval",
          label: "Approvals",
          admin: true,
        },
      ]
    : links;
  const name = session.user?.name ?? "Signed in";
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const role = session.roles[0]?.replace(".", " ") ?? "No role";

  return (
    <>
      <header className="sticky top-0 z-20 px-3 pt-3 md:px-6 md:pt-4">
        <div className="card relative mx-auto flex max-w-7xl items-center gap-3 px-3 py-2 shadow-bar md:px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 pr-2 font-heading text-base font-semibold tracking-tight whitespace-nowrap"
          >
            <Mark className="text-primary" />
            Dealer Portal
          </Link>
          <PortalNav
            links={nav}
            className="hidden items-center gap-1 md:flex"
          />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <span
              className="hidden items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm whitespace-nowrap xl:flex"
              title={session.roles.join(", ") || "no role"}
            >
              <span className="flex size-7 items-center justify-center rounded-full bg-ink font-heading text-xs font-semibold text-ink-fg">
                {initials}
              </span>
              <span className="font-medium">{name}</span>
              <span className="text-fg-subtle">{role}</span>
            </span>
            <form action={signOutAction} className="hidden md:block">
              <button className="btn btn-ghost btn-sm">Sign out</button>
            </form>
            <details className="group md:hidden">
              <summary
                className="inline-flex size-10 cursor-pointer list-none items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 [&::-webkit-details-marker]:hidden"
                aria-label="Menu"
              >
                <Menu className="group-open:hidden" />
                <Close className="hidden group-open:block" />
              </summary>
              <div className="card absolute inset-x-0 top-full mt-2 p-3 shadow-bar">
                <PortalNav links={nav} className="flex flex-col gap-0.5" />
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm">
                  <span>
                    <span className="font-medium">{name}</span>{" "}
                    <span className="text-fg-subtle">{role}</span>
                  </span>
                  <form action={signOutAction}>
                    <button className="btn btn-ghost btn-sm">Sign out</button>
                  </form>
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 md:py-10">
        {children}
      </main>
      <DraftReplayer />
    </>
  );
}
