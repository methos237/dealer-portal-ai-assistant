import { expect, test, vi } from "vitest";
import { ApiError, apiRequest } from "@/lib/api-client";

test("sends bearer token and JSON body, parses the response", async () => {
  const fetchImpl = vi.fn(async () =>
    Response.json({ id: 7 }, { status: 201 }),
  );
  const result = await apiRequest(
    "http://api",
    "tok",
    "/claims",
    { method: "POST", body: "{}" },
    fetchImpl,
  );
  expect(result).toEqual({ id: 7 });
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [
    string,
    RequestInit,
  ];
  expect(url).toBe("http://api/claims");
  expect(new Headers(init.headers).get("authorization")).toBe("Bearer tok");
  expect(new Headers(init.headers).get("content-type")).toBe(
    "application/json",
  );
});

test("turns problem details into ApiError with validation errors", async () => {
  const fetchImpl = vi.fn(async () =>
    Response.json(
      { title: "Unknown SKU", errors: { Lines: ["Unknown SKU 'NOPE-1'."] } },
      { status: 400, headers: { "content-type": "application/problem+json" } },
    ),
  );
  const err = (await apiRequest(
    "http://api",
    "tok",
    "/parts-orders",
    {},
    fetchImpl,
  ).catch((e) => e)) as ApiError;
  expect(err).toBeInstanceOf(ApiError);
  expect(err.status).toBe(400);
  expect(err.errors?.Lines[0]).toContain("NOPE-1");
});
