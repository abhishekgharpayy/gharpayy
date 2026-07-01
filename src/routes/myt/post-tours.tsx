import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import PostTours from "@/myt/pages/PostTours";

export const Route = createFileRoute("/myt/post-tours")({
  head: () => ({ meta: [{ title: "Post Tours - MYT" }] }),
  component: () => <AppShell><PostTours /></AppShell>,
});
