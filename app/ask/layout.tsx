// app/ask/page.tsx is a client component ("use client"), which can't export `metadata`
// itself — this server layout carries it instead.
import type { ReactNode } from "react";
import { routeMetadata } from "@/app/lib/seo";
import { JsonLd } from "@/app/components/JsonLd";
import { webPageJsonLd, jsonLdGraph } from "@/app/lib/json-ld";

export const metadata = routeMetadata({
  title: "Ask",
  description:
    "Ask anything about the current F1 weekend — podium odds, pit-stop strategy, tyre wear — " +
    "and get a straight answer with the reasoning attached.",
  path: "/ask",
});

export default function AskLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <JsonLd
        data={jsonLdGraph(
          webPageJsonLd({
            title: "Ask",
            description: metadata.description as string,
            path: "/ask",
          }),
        )}
      />
      {children}
    </>
  );
}
