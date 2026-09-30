import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Only build assets are cached. Pages and /api/* carry per-user data and always go to the network;
// the document route exists so the /~offline fallback applies when that network call fails.
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request }) => request.destination === "document",
      handler: new NetworkOnly(),
    },
    {
      matcher: ({ sameOrigin, url }) =>
        sameOrigin &&
        (url.pathname.startsWith("/_next/static/") ||
          url.pathname.startsWith("/icons/")),
      handler: new CacheFirst({ cacheName: "static-assets" }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();
