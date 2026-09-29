"use client";

import { useEffect, useRef, useState } from "react";
import { readSse } from "@/lib/sse";
import { approveClaim, createClaim, createPartsOrder } from "@/lib/actions";
import type { NewClaim, NewPartsOrder } from "@/lib/types";
import { ArrowRight, Check, Close } from "./icons";

type Citation = {
  cited_text: string;
  document_title: string;
  source: {
    chunk_id: number;
    title: string;
    path: string;
    metadata: { section?: string; page?: number };
  } | null;
};
type Block = { type: "text"; text: string; citations: Citation[] };
type ToolCall = {
  name: string;
  input: Record<string, unknown>;
  is_error: boolean;
};
type Draft = {
  kind: "claim" | "parts_order" | "approve_claim";
  method: string;
  path: string;
  body: Record<string, unknown> | null;
  summary: string;
  status?: "pending" | "done" | "failed";
  result?: string;
};
type Message = {
  role: "user" | "assistant";
  blocks: Block[];
  tools?: ToolCall[];
  drafts?: Draft[];
  usage?: Record<string, number>;
  stopReason?: string;
};
type Conversation = { id: string; title: string; created_at: string };
type Cost = {
  turns: number;
  model: string;
  usage: Record<string, number>;
  cost_usd: Record<string, number> & { total: number };
};
type Chunk = {
  chunk_id: number;
  text: string;
  title: string;
  path: string;
  metadata: { section?: string; page?: number };
};

const api = (path: string, init?: RequestInit) =>
  fetch(`/api/assistant/${path}`, init);

/** showCost: Thor.Admin sees the running USD cost of the conversation (GET /conversations/{id}/cost). */
export function AssistantPanel({ showCost = false }: { showCost?: boolean }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [cost, setCost] = useState<Cost | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chunk, setChunk] = useState<Chunk | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api("conversations")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`assistant ${r.status}`)),
      )
      .then(setConversations)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function open(id: string) {
    setConversationId(id);
    setError(null);
    void loadCost(id);
    const detail = await api(`conversations/${id}`).then((r) => r.json());
    setMessages(
      detail.messages.map(
        (m: {
          role: Message["role"];
          content: Block[];
          usage?: Record<string, number>;
        }) => ({
          role: m.role,
          blocks: m.content.map((b) => ({
            ...b,
            citations: b.citations ?? [],
          })),
          usage: m.usage,
        }),
      ),
    );
  }

  function reset() {
    setConversationId(null);
    setMessages([]);
    setCost(null);
    setError(null);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    setInput("");
    setBusy(true);
    setError(null);
    setMessages((m) => [
      ...m,
      {
        role: "user",
        blocks: [{ type: "text", text: question, citations: [] }],
      },
      {
        role: "assistant",
        blocks: [{ type: "text", text: "", citations: [] }],
      },
    ]);
    try {
      const res = await api("chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: question,
        }),
      });
      if (!res.ok)
        throw new Error((await res.text()) || `assistant ${res.status}`);
      let currentId = conversationId;
      for await (const ev of readSse(res)) {
        const data = JSON.parse(ev.data);
        if (ev.event === "conversation") {
          currentId = data.id;
          if (!conversationId) {
            setConversationId(data.id);
            setConversations((c) =>
              c.some((x) => x.id === data.id)
                ? c
                : [
                    {
                      id: data.id,
                      title: question.slice(0, 80),
                      created_at: new Date().toISOString(),
                    },
                    ...c,
                  ],
            );
          }
        } else if (ev.event === "text") {
          setMessages((m) =>
            patchLast(m, (b) => ({ ...b, text: b.text + data.text })),
          );
        } else if (ev.event === "citation") {
          setMessages((m) =>
            patchLast(m, (b) => ({ ...b, citations: [...b.citations, data] })),
          );
        } else if (ev.event === "tool") {
          setMessages((m) => {
            const last = m[m.length - 1];
            return [
              ...m.slice(0, -1),
              {
                ...last,
                tools: [...(last.tools ?? []), data],
                blocks: [
                  ...last.blocks,
                  { type: "text", text: "", citations: [] },
                ],
              },
            ];
          });
        } else if (ev.event === "confirm") {
          setMessages((m) => {
            const last = m[m.length - 1];
            return [
              ...m.slice(0, -1),
              {
                ...last,
                drafts: [
                  ...(last.drafts ?? []),
                  { ...data, status: "pending" },
                ],
              },
            ];
          });
        } else if (ev.event === "done") {
          setMessages((m) => {
            const last = m[m.length - 1];
            return [
              ...m.slice(0, -1),
              { ...last, usage: data.usage, stopReason: data.stop_reason },
            ];
          });
          if (currentId) void loadCost(currentId);
        } else if (ev.event === "error") {
          setError(data.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(messageIndex: number, draftIndex: number) {
    const draft = messages[messageIndex].drafts![draftIndex];
    const result =
      draft.kind === "claim"
        ? await createClaim(draft.body as unknown as NewClaim)
        : draft.kind === "parts_order"
          ? await createPartsOrder(draft.body as unknown as NewPartsOrder)
          : await approveClaim(
              Number(draft.path.match(/\/claims\/(\d+)\/approve/)?.[1]),
            );
    setMessages((m) =>
      m.map((msg, i) =>
        i !== messageIndex
          ? msg
          : {
              ...msg,
              drafts: msg.drafts!.map((d, j) =>
                j !== draftIndex
                  ? d
                  : result.ok
                    ? {
                        ...d,
                        status: "done",
                        result: `Done. ${"id" in result.value ? `Record #${result.value.id}.` : ""}`,
                      }
                    : { ...d, status: "failed", result: result.error },
              ),
            },
      ),
    );
  }

  async function showChunk(id: number) {
    setChunk(await api(`chunks/${id}`).then((r) => r.json()));
  }

  async function loadCost(id: string) {
    if (showCost)
      setCost(await api(`conversations/${id}/cost`).then((r) => r.json()));
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <h1 className="page-title">Assistant</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Manuals, bulletins, warranty rules, parts. Every answer cites its
          source.
        </p>
        <button onClick={reset} className="btn btn-primary mt-5 w-full">
          New conversation
        </button>
        <ul className="mt-4 max-h-[50vh] space-y-0.5 overflow-y-auto text-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => open(c.id)}
                aria-current={c.id === conversationId ? "true" : undefined}
                className={`w-full truncate rounded-full px-3 py-1.5 text-left transition-colors hover:bg-surface-2 ${c.id === conversationId ? "bg-surface-2 font-medium" : "text-fg-muted"}`}
              >
                {c.title || "Untitled"}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="card flex min-h-[70vh] flex-col overflow-hidden">
        <div
          className="flex-1 space-y-5 overflow-y-auto p-4 md:p-6"
          data-testid="messages"
        >
          {messages.length === 0 && (
            <div className="m-auto max-w-md py-16 text-center">
              <h2 className="text-xl">What do you need to know?</h2>
              <p className="mt-2 text-sm text-fg-muted">
                Try “What is the tire pressure spec for a 2024 Axis?” or “Draft
                a claim for the slide-out motor on 1THRA24X0RN000001”.
              </p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[85%] text-left text-[15px] leading-relaxed whitespace-pre-wrap md:max-w-[75%] ${m.role === "user" ? "rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-ink-fg" : ""}`}
                data-testid={`message-${m.role}`}
              >
                {m.blocks.map((b, j) => (
                  <span key={j}>
                    {b.text}
                    {b.citations.map((c, k) => (
                      <button
                        key={k}
                        type="button"
                        title={c.cited_text}
                        onClick={() => c.source && showChunk(c.source.chunk_id)}
                        className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 align-super text-[11px] font-medium text-primary-ink hover:bg-primary hover:text-white"
                        data-testid="citation"
                      >
                        {k + 1}
                      </button>
                    ))}
                  </span>
                ))}
                {m.tools && m.tools.length > 0 && (
                  <ul
                    className="mt-3 space-y-1 text-xs text-fg-muted"
                    data-testid="tools"
                  >
                    {m.tools.map((t, k) => (
                      <li key={k} className="flex items-start gap-1.5">
                        {t.is_error ? (
                          <Close
                            width={14}
                            height={14}
                            className="mt-0.5 shrink-0 text-error"
                          />
                        ) : (
                          <Check
                            width={14}
                            height={14}
                            className="mt-0.5 shrink-0 text-success"
                          />
                        )}
                        <span>
                          <code className="font-medium text-fg">{t.name}</code>{" "}
                          <span className="font-mono">
                            {JSON.stringify(t.input)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {m.drafts?.map((d, k) => (
                  <div
                    key={k}
                    className="mt-3 rounded-2xl bg-warn-soft p-4 text-sm text-warn-ink"
                    data-testid="confirm-card"
                  >
                    <div className="font-heading font-semibold">
                      Confirm {d.kind.replace("_", " ")}
                    </div>
                    <p className="mt-1">{d.summary}</p>
                    {d.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => confirm(i, k)}
                        className="btn btn-ink btn-sm mt-3"
                      >
                        Confirm and send
                      </button>
                    )}
                    {d.status !== "pending" && (
                      <p
                        className={`mt-2 text-xs font-medium ${d.status === "failed" ? "text-error-ink" : "text-success-ink"}`}
                      >
                        {d.result ?? (d.status === "done" ? "Confirmed." : "")}
                      </p>
                    )}
                  </div>
                ))}
                {m.stopReason === "refusal" && (
                  <p className="mt-2 text-xs text-warn-ink">
                    The assistant declined to answer this request.
                  </p>
                )}
                {m.stopReason === "max_tokens" && (
                  <p className="mt-2 text-xs text-warn-ink">
                    The answer was cut off at the length limit.
                  </p>
                )}
              </div>
              {m.usage && (
                <div
                  className="mt-1 text-xs text-fg-subtle tabular-nums"
                  data-testid="usage"
                >
                  {m.usage.input_tokens} in · {m.usage.output_tokens} out ·{" "}
                  {m.usage.cache_read_input_tokens ?? 0} cached
                </div>
              )}
            </div>
          ))}
          {cost && (
            <p
              className="text-xs text-fg-subtle tabular-nums"
              data-testid="cost"
            >
              Conversation cost: ${cost.cost_usd.total.toFixed(4)} ·{" "}
              {cost.turns} {cost.turns === 1 ? "turn" : "turns"} · {cost.model}
            </p>
          )}
          <div ref={bottom} />
        </div>
        {error && (
          <p
            role="alert"
            className="border-t border-border bg-error-soft px-4 py-2 text-sm text-error-ink"
          >
            {error}
          </p>
        )}
        <form
          onSubmit={send}
          className="flex gap-2 border-t border-border bg-surface p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={busy ? "Thinking…" : "Ask the assistant"}
            aria-label="Message"
            className="field flex-1 rounded-full px-5"
          />
          <button
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="btn btn-primary size-11 shrink-0 p-0"
          >
            <ArrowRight />
          </button>
        </form>
      </section>
      {chunk && (
        <div
          role="dialog"
          aria-label="Source"
          className="card fixed inset-y-3 right-3 z-30 w-[min(440px,calc(100vw-1.5rem))] overflow-y-auto p-5 shadow-bar"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="tag tag-primary">Source</span>
              <h2 className="mt-2 text-lg">{chunk.title}</h2>
              <p className="mt-1 text-xs text-fg-muted">
                {chunk.path}
                {chunk.metadata.section ? ` · ${chunk.metadata.section}` : ""}
                {chunk.metadata.page ? ` · page ${chunk.metadata.page}` : ""}
              </p>
            </div>
            <button
              onClick={() => setChunk(null)}
              aria-label="Close"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <Close />
            </button>
          </div>
          <pre className="mt-4 border-t border-border pt-4 font-sans text-sm leading-relaxed whitespace-pre-wrap">
            {chunk.text}
          </pre>
        </div>
      )}
    </div>
  );
}

function patchLast(messages: Message[], fn: (b: Block) => Block): Message[] {
  const last = messages[messages.length - 1];
  const blocks = last.blocks.length
    ? [...last.blocks.slice(0, -1), fn(last.blocks[last.blocks.length - 1])]
    : [fn({ type: "text", text: "", citations: [] })];
  return [...messages.slice(0, -1), { ...last, blocks }];
}
