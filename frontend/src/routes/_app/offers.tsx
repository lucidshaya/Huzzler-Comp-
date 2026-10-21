import { createFileRoute, redirect } from "@tanstack/react-router";

// Offers are now "Opportunities". Old links (emails, notifications, bookmarks) still work.
export const Route = createFileRoute("/_app/offers")({
  beforeLoad: () => {
    throw redirect({ to: "/opportunities", replace: true });
  },
});
