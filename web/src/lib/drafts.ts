/** Claim drafts saved while offline, replayed when the browser is back online. IndexedDB, no library. */
import type { NewClaim } from "./types";

const DB = "dealer-portal";
const STORE = "claim-drafts";

export type ClaimDraft = NewClaim & { id: number; savedAt: string };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore(STORE, {
        keyPath: "id",
        autoIncrement: true,
      });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const saveDraft = (claim: NewClaim) =>
  tx(
    "readwrite",
    (s) =>
      s.add({
        ...claim,
        savedAt: new Date().toISOString(),
      }) as IDBRequest<IDBValidKey>,
  );
export const listDrafts = () =>
  tx("readonly", (s) => s.getAll() as IDBRequest<ClaimDraft[]>);
export const deleteDraft = (id: number) => tx("readwrite", (s) => s.delete(id));
