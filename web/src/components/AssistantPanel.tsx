"use client";

import { useEffect, useRef, useState } from "react";
import { readSse } from "@/lib/sse";
import { approveClaim, createClaim, createPartsOrder } from "@/lib/actions";
import type { NewClaim, NewPartsOrder } from "@/lib/types";

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
type Chunk = {
  chunk_id: number;
  text: string;
  title: string;
  path: string;
  metadata: { section?: string; page?: number };
};

const api = (path: string, init?: RequestInit) =>
  fetch(`/api/assistant/${path}`, init);

export function AssistantPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
      for await (const ev of readSse(res)) {
        const data = JSON.parse(ev.data);
        if (ev.event === "conversation") {
          if (!conversationId) {
            setConversationId(data.id);
            setConversations((c) => [
              {
                id: data.id,
                title: question.slice(0, 80),
                created_at: new Date().toISOString(),
              },
              ...c,
            ]);
          }
        } else if (ev.event === "text") {
          setMessages((m) =>
            patchLast(m, (b) => ({ ...b, text: b.text + data.text })),
          );
        } else if (ev.event === "citation") {
          setMessages((m) =>
            patchLast(m, (b) => ({ ...b, citations: [...b.citations, data] })),
          );
        } else if (ev.event === "done") {
          setMessages((m) => {
            const last = m[m.length - 1];
            return [
              ...m.slice(0, -1),
              { ...last, usage: data.usage, stopReason: data.stop_reason },
            ];
          });
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

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      <aside>
        <button
          onClick={reset}
          className="w-full rounded bg-blue-700 px-3 py-2 text-sm text-white"
        >
          New conversation
        </button>
        <ul className="mt-3 space-y-1 text-sm">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => open(c.id)}
                className={`w-full truncate rounded px-2 py-1 text-left hover:bg-slate-100 ${c.id === conversationId ? "bg-slate-200" : ""}`}
              >
                {c.title || "Untitled"}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex min-h-[70vh] flex-col rounded border bg-white">
        <div
          className="flex-1 space-y-4 overflow-y-auto p-4"
          data-testid="messages"
        >
          {messages.length === 0 && (
            <p className="text-sm text-slate-500">
              Ask about owner manuals, service bulletins, warranty rules or
              parts. Answers cite their source.
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "text-right" : ""}>
              <div
                className={`inline-block max-w-[80%] whitespace-pre-wrap rounded px-3 py-2 text-left text-sm ${m.role === "user" ? "bg-blue-50" : "bg-slate-50"}`}
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
                        className="ml-1 rounded-full border border-blue-300 bg-white px-1.5 text-xs text-blue-800 align-super hover:bg-blue-50"
                        data-testid="citation"
                      >
                        {k + 1}
                      </button>
                    ))}
                  </span>
                ))}
                {m.tools && m.tools.length > 0 && (
                  <ul
                    className="mt-2 space-y-0.5 text-xs text-slate-500"
                    data-testid="tools"
                  >
                    {m.tools.map((t, k) => (
                      <li key={k}>
                        {t.is_error ? "✕" : "✓"} <code>{t.name}</code>{" "}
                        {JSON.stringify(t.input)}
                      </li>
                    ))}
                  </ul>
                )}
                {m.drafts?.map((d, k) => (
                  <div
                    key={k}
                    className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm"
                    data-testid="confirm-card"
                  >
                    <div className="font-medium text-amber-900">
                      Confirm: {d.kind.replace("_", " ")}
                    </div>
                    <p className="mt-1">{d.summary}</p>
                    {d.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => confirm(i, k)}
                        className="mt-2 rounded bg-amber-700 px-3 py-1 text-white hover:bg-amber-800"
                      >
                        Confirm and send
                      </button>
                    )}
                    {d.status !== "pending" && (
                      <p
                        className={`mt-1 text-xs ${d.status === "failed" ? "text-red-700" : "text-green-800"}`}
                      >
                        {d.result ?? (d.status === "done" ? "Confirmed." : "")}
                      </p>
                    )}
                  </div>
                ))}
                {m.stopReason === "refusal" && (
                  <p className="mt-1 text-xs text-amber-800">
                    The assistant declined to answer this request.
                  </p>
                )}
                {m.stopReason === "max_tokens" && (
                  <p className="mt-1 text-xs text-amber-800">
                    The answer was cut off at the length limit.
                  </p>
                )}
              </div>
              {m.usage && (
                <div
                  className="mt-0.5 text-xs text-slate-400"
                  data-testid="usage"
                >
                  {m.usage.input_tokens} in · {m.usage.output_tokens} out ·{" "}
                  {m.usage.cache_read_input_tokens ?? 0} cached
                </div>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>
        {error && (
          <p role="alert" className="border-t px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <form onSubmit={send} className="flex gap-2 border-t p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the assistant"
            aria-label="Message"
            className="flex-1 rounded border px-3 py-2 text-sm"
          />
          <button
            disabled={busy}
            className="rounded bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </section>
      {chunk && (
        <div
          role="dialog"
          aria-label="Source"
          className="fixed inset-y-0 right-0 w-[420px] overflow-y-auto border-l bg-white p-4 shadow-xl"
        >
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold">{chunk.title}</h2>
              <p className="text-xs text-slate-500">
                {chunk.path}
                {chunk.metadata.section ? ` · ${chunk.metadata.section}` : ""}
                {chunk.metadata.page ? ` · page ${chunk.metadata.page}` : ""}
              </p>
            </div>
            <button
              onClick={() => setChunk(null)}
              aria-label="Close"
              className="px-2"
            >
              ✕
            </button>
          </div>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm">
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
