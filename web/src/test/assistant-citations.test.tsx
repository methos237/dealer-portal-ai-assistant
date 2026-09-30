import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { AssistantPanel } from "@/components/AssistantPanel";

// Server actions pull in server-only modules; the panel only calls them on confirm.
vi.mock("@/lib/actions", () => ({
  createClaim: vi.fn(),
  createPartsOrder: vi.fn(),
  approveClaim: vi.fn(),
}));

const source = {
  chunk_id: 47,
  title: "Trailhead Owners Manual (2025)",
  path: "owner-manual-trailhead.md",
  metadata: { section: "Warranty" },
};
const cite = (text: string) => ({
  cited_text: text,
  document_title: source.title,
  source,
});
const detail = {
  messages: [
    {
      role: "user",
      content: [{ type: "text", text: "Warranty?", citations: [] }],
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "THOR warrants the frame.",
          citations: [cite("a")],
        },
        {
          type: "text",
          text: " Tires are excluded.",
          citations: [cite("b"), cite("c")],
        },
        {
          type: "text",
          text: " Claims go through dealers.",
          citations: [cite("d")],
        },
      ],
    },
  ],
};

// jsdom has no layout; the panel scrolls to the newest message on every render.
Element.prototype.scrollIntoView = vi.fn();

afterEach(() => vi.unstubAllGlobals());

test("citations to one chunk share one footnote number and one source row", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/conversations")
          ? [{ id: "c1", title: "Warranty", created_at: "2026-09-29" }]
          : detail,
    })),
  );
  render(<AssistantPanel />);
  fireEvent.click(await screen.findByRole("button", { name: "Warranty" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("citation")).toHaveLength(3),
  );
  for (const chip of screen.getAllByTestId("citation"))
    expect(chip.textContent).toContain("1");
  expect(screen.getByTestId("sources").querySelectorAll("li")).toHaveLength(1);
  expect(screen.getByTestId("sources").textContent).toContain(
    "Trailhead Owners Manual (2025) · Warranty",
  );
});
