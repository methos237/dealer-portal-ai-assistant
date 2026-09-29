import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Mark } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative flex flex-col justify-between bg-ink px-6 py-8 text-ink-fg md:px-12 md:py-10">
        <div className="flex items-center gap-2 font-heading text-base font-semibold tracking-tight">
          <Mark className="text-primary" />
          Dealer Portal
        </div>
        <div className="py-16 lg:py-0">
          <h1 className="max-w-[12ch] text-[2.75rem] leading-[1.05] font-semibold tracking-[-0.03em] md:text-6xl">
            Every coach on your lot, one place.
          </h1>
          <p className="mt-6 max-w-md text-lg text-ink-fg/75">
            Units, warranty claims and parts orders for THOR dealers, with an
            assistant that reads the manuals so you don&apos;t have to.
          </p>
        </div>
        <div aria-hidden className="space-y-3">
          <div className="border-t border-dashed border-ink-fg/30" />
          <div className="border-t border-ink-fg/30" />
        </div>
      </section>
      <section className="flex flex-col px-6 py-8 md:px-12 md:py-10">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className="m-auto w-full max-w-sm">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-2 text-fg-muted">
            Use the Microsoft account your dealership gave you. Your role
            decides what you can see.
          </p>
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
            }}
            className="mt-8"
          >
            <button className="btn btn-primary w-full">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <rect x="1" y="1" width="7.5" height="7.5" fill="#f25022" />
                <rect x="9.5" y="1" width="7.5" height="7.5" fill="#7fba00" />
                <rect x="1" y="9.5" width="7.5" height="7.5" fill="#00a4ef" />
                <rect x="9.5" y="9.5" width="7.5" height="7.5" fill="#ffb900" />
              </svg>
              Sign in with Microsoft
            </button>
          </form>
        </div>
        <p className="text-sm text-fg-subtle">
          Works offline for claim drafts. Install it from your browser menu.
        </p>
      </section>
    </main>
  );
}
