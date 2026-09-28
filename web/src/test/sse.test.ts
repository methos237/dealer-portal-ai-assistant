import { expect, test } from "vitest";
import { createSseParser } from "@/lib/sse";

test("parses complete frames and keeps partial ones buffered", () => {
  const push = createSseParser();
  expect(push('event: text\ndata: {"text":"Hel')).toEqual([]);
  expect(
    push('lo"}\n\nevent: done\ndata: {"a":1}\n\nevent: text\ndata: '),
  ).toEqual([
    { event: "text", data: '{"text":"Hello"}' },
    { event: "done", data: '{"a":1}' },
  ]);
  expect(push("x\n\n")).toEqual([{ event: "text", data: "x" }]);
});

test("defaults the event name and joins multi-line data", () => {
  const push = createSseParser();
  expect(push("data: a\ndata: b\n\n")).toEqual([
    { event: "message", data: "a\nb" },
  ]);
});
