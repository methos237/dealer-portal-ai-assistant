import { auth } from "@/auth";

const assistantUrl = process.env.ASSISTANT_URL ?? "http://localhost:8000";

/** Forwards /api/assistant/* to the assistant with the user's API token; streams the body through. */
async function proxy(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await auth();
  if (!session) return new Response("Unauthorized", { status: 401 });
  const { path } = await params;
  const url = new URL(req.url);
  let res: Response;
  try {
    res = await fetch(`${assistantUrl}/${path.join("/")}${url.search}`, {
      method: req.method,
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": req.headers.get("content-type") ?? "application/json",
        accept: req.headers.get("accept") ?? "*/*",
      },
      body: req.method === "GET" ? undefined : await req.text(),
      cache: "no-store",
    });
  } catch {
    return new Response("The assistant is unreachable.", { status: 503 });
  }
  return new Response(res.body, {
    status: res.status,
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/json",
      "cache-control": "no-cache",
    },
  });
}

export { proxy as GET, proxy as POST };
