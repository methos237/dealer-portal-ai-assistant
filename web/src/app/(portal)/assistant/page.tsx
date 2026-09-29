import { auth } from "@/auth";
import { AssistantPanel } from "@/components/AssistantPanel";

export const metadata = { title: "Assistant" };

export default async function AssistantPage() {
  const session = await auth();
  return (
    <AssistantPanel showCost={session?.roles.includes("Thor.Admin") ?? false} />
  );
}
