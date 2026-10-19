import { createFileRoute } from "@tanstack/react-router";
import { StaffLogin } from "@/components/staff/StaffLogin";

export const Route = createFileRoute("/aipm/login")({
  ssr: false,
  head: () => ({
    meta: [{ title: "AI PM sign in · Huzzler" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <StaffLogin portal="aipm" />,
});
