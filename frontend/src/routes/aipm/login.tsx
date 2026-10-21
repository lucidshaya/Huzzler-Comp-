import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StaffLogin } from "@/components/staff/StaffLogin";

export const Route = createFileRoute("/aipm/login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "AI PM sign in · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: z.object({ username: z.string().max(64).optional() }),
  component: AipmLogin,
});

function AipmLogin() {
  return <StaffLogin portal="aipm" initialUsername={Route.useSearch().username} />;
}
