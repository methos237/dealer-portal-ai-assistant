/**
 * Power BI executeQueries over the Fabric semantic model, with the same dealer-portal-m365 client
 * credentials as Graph. Read-only DAX only (validateDax); the service principal holds Viewer + Build
 * on the model and nothing else.
 */
import { tokenFromEnv, type TokenProvider } from "./graph.js";

const POWERBI = "https://api.powerbi.com/v1.0/myorg";
export const MAX_ROWS = 500;

export class PowerBiError extends Error {
  constructor(
    status: number,
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}

/** null when the query is a single EVALUATE statement; otherwise the reason it is refused. */
export function validateDax(dax: string): string | null {
  const evaluates = dax.match(/\bEVALUATE\b/gi)?.length ?? 0;
  if (
    dax.length > 4000 ||
    evaluates !== 1 ||
    !/^\s*EVALUATE\b/i.test(dax) ||
    /\bDEFINE\b/i.test(dax)
  )
    return "Only a single EVALUATE query is allowed";
  return null;
}

export class PowerBi {
  constructor(
    private readonly token: TokenProvider,
    private readonly workspaceId: string,
    private readonly semanticModelId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Undefined when PowerBi__WorkspaceId / PowerBi__SemanticModelId are absent: the tool is then not offered. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): PowerBi | undefined {
    const workspace = env.PowerBi__WorkspaceId;
    const model = env.PowerBi__SemanticModelId;
    if (!workspace || !model) return undefined;
    return new PowerBi(
      tokenFromEnv("https://analysis.windows.net/powerbi/api/.default", env),
      workspace,
      model,
    );
  }

  async executeQueries(
    dax: string,
  ): Promise<{ rows: Record<string, unknown>[] }> {
    const res = await this.fetchImpl(
      `${POWERBI}/groups/${this.workspaceId}/datasets/${this.semanticModelId}/executeQueries`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${await this.token()}`,
        },
        body: JSON.stringify({
          queries: [{ query: dax }],
          serializerSettings: { includeNulls: true },
        }),
      },
    );
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
      results?: {
        error?: { code?: string; message?: string };
        tables?: { rows?: Record<string, unknown>[] }[];
      }[];
    };
    const error = body.error ?? body.results?.[0]?.error;
    if (!res.ok || error)
      throw new PowerBiError(
        res.status,
        error?.code ?? "unknown",
        error?.message ?? res.statusText,
      );
    return { rows: body.results?.[0]?.tables?.[0]?.rows ?? [] };
  }
}
