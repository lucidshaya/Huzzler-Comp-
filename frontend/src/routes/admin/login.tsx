import { createFileRoute } from "@tanstack/react-router";
import { StaffLogin } from "@/components/staff/StaffLogin";

export const Route = createFileRoute("/admin/login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Staff sign in · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <StaffLogin portal="admin" />,
});
