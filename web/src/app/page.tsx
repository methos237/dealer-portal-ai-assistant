import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session) redirect("/dashboard");
  return (
    <main className="mx-auto max-w-md p-12 text-center">
      <h1 className="text-3xl font-semibold">Dealer Portal</h1>
      <p className="mt-2 text-slate-600">
        Units, warranty claims and parts orders for THOR dealers.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
        }}
      >
        <button className="mt-8 rounded bg-blue-700 px-5 py-2 font-medium text-white hover:bg-blue-800">
          Sign in with Microsoft
        </button>
      </form>
    </main>
  );
}
