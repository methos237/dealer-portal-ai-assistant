/** Incremental parser for text/event-stream frames. Pure; unit tested. */
export type SseEvent = { event: string; data: string };

export function createSseParser() {
  let buffer = "";
  return function push(chunk: string): SseEvent[] {
    buffer += chunk;
    const events: SseEvent[] = [];
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) events.push({ event, data: data.join("\n") });
    }
    return events;
  };
}

/** Read a fetch Response body as SSE events. */
export async function* readSse(res: Response): AsyncGenerator<SseEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const push = createSseParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    yield* push(decoder.decode(value, { stream: true }));
  }
}
