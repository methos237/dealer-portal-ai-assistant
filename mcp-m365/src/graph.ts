/**
 * Thin Microsoft Graph client: app-only token from @azure/identity, plain fetch, no Graph SDK.
 * Every call is scoped to drives (SharePoint document libraries or OneDrive); the app registration
 * holds Sites.Read.All and Files.Read.All only, so nothing here can write.
 */
import { ClientSecretCredential } from "@azure/identity";

export const GRAPH = "https://graph.microsoft.com/v1.0";
const MAX_PAGES = 10;

export interface Library {
  id: string;
  name: string;
  webUrl: string;
  driveType: string;
}

export interface DriveItem {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  webUrl?: string;
  file?: { mimeType?: string; hashes?: { quickXorHash?: string } };
  folder?: { childCount: number };
  parentReference?: { driveId?: string; path?: string };
  deleted?: { state: string };
}

export class GraphError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(`Graph ${status} ${code}: ${message}`);
  }
}

export type TokenProvider = () => Promise<string>;

export class Graph {
  constructor(
    private readonly token: TokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Client credentials from M365_TENANT_ID / M365_CLIENT_ID / M365_CLIENT_SECRET. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): Graph {
    const need = (k: string) => {
      const v = env[k];
      if (!v) throw new Error(`${k} is not set`);
      return v;
    };
    const credential = new ClientSecretCredential(
      need("M365_TENANT_ID"),
      need("M365_CLIENT_ID"),
      need("M365_CLIENT_SECRET"),
    );
    return new Graph(async () => {
      const t = await credential.getToken(
        "https://graph.microsoft.com/.default",
      );
      return t.token;
    });
  }

  async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(
      url.startsWith("http") ? url : `${GRAPH}${url}`,
      {
        ...init,
        headers: {
          ...init.headers,
          authorization: `Bearer ${await this.token()}`,
        },
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      throw new GraphError(
        res.status,
        body.error?.code ?? "unknown",
        body.error?.message ?? res.statusText,
      );
    }
    return res;
  }

  async json<T>(url: string): Promise<T> {
    return (await this.fetch(url)).json() as Promise<T>;
  }

  /** Follow @odata.nextLink; bounded so a huge library cannot pin the process. */
  async list<T>(url: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      const body: { value: T[]; "@odata.nextLink"?: string } =
        await this.json(next);
      out.push(...body.value);
      next = body["@odata.nextLink"];
    }
    return out;
  }

  /** `site` is a Graph site id or `hostname:/sites/name`; both work in the /sites/{} segment. */
  listLibraries(site: string): Promise<Library[]> {
    return this.list<Library>(
      `/sites/${site}/drives?$select=id,name,webUrl,driveType`,
    );
  }

  listDocuments(driveId: string, path = ""): Promise<DriveItem[]> {
    const root = path ? `/root:/${encodePath(path)}:` : "/root";
    return this.list<DriveItem>(
      `/drives/${driveId}${root}/children?$select=${ITEM_FIELDS}&$top=200`,
    );
  }

  getItem(driveId: string, itemId: string): Promise<DriveItem> {
    return this.json(
      `/drives/${driveId}/items/${itemId}?$select=${ITEM_FIELDS}`,
    );
  }

  async download(driveId: string, itemId: string): Promise<Buffer> {
    // Graph answers 302 to a pre-authenticated URL; fetch follows it and drops our auth header.
    const res = await this.fetch(`/drives/${driveId}/items/${itemId}/content`);
    return Buffer.from(await res.arrayBuffer());
  }

  search(driveId: string, query: string): Promise<DriveItem[]> {
    const q = encodeURIComponent(query.replace(/'/g, "''"));
    return this.list<DriveItem>(
      `/drives/${driveId}/root/search(q='${q}')?$select=${ITEM_FIELDS}`,
    );
  }
}

const ITEM_FIELDS =
  "id,name,size,lastModifiedDateTime,webUrl,file,folder,parentReference";

function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}
