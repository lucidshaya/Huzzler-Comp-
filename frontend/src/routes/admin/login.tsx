import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { StaffLogin } from "@/components/staff/StaffLogin";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Staff sign in · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: z.object({ username: z.string().max(64).optional() }),
  component: AdminLogin,
});

function AdminLogin() {
  return <StaffLogin portal="admin" initialUsername={Route.useSearch().username} />;
}
