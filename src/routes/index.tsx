import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";

const Workspace = lazy(() => import("@/components/research/Workspace"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ResearchGraph — Agentic Research Canvas" },
      { name: "description", content: "Map papers, datasets, notes and AI agent reasoning on an infinite research canvas." },
      { property: "og:title", content: "ResearchGraph — Agentic Research Canvas" },
      { property: "og:description", content: "Map papers, datasets, notes and AI agent reasoning on an infinite research canvas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const fallback = <div className="h-screen w-screen bg-canvas" />;
  return (
    <ClientOnly fallback={fallback}>
      <Suspense fallback={fallback}>
        <Workspace />
      </Suspense>
    </ClientOnly>
  );
}
