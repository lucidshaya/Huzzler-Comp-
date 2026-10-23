import { createFileRoute, redirect } from "@tanstack/react-router";

// Settings now lives in Profile → Account & privacy. Old links still work.
export const Route = createFileRoute("/_app/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", search: { tab: "account" }, replace: true });
  },
});
