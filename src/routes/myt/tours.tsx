import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import MyToursPage from "@/myt/pages/MyTours";

export const Route = createFileRoute("/myt/tours")({
  head: () => ({ meta: [{ title: "My Tours - MYT" }] }),
  component: () => <AppShell><MyToursPage /></AppShell>,
});
