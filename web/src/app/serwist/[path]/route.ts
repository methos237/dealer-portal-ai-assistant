import { createSerwistRoute } from "@serwist/turbopack";

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    additionalPrecacheEntries: [
      { url: "/~offline", revision: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    ],
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
  });
