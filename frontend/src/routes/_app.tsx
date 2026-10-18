import { useEffect, useState } from "react";
import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase, signOutIntent } from "@/lib/supabase";
import { SESSION_EXPIRED_EVENT } from "@/lib/api";
import { useMe } from "@/lib/journey";
import { AppShell } from "@/components/app/AppShell";
import { Spinner, ErrorNote } from "@/components/app/ui";

// Authenticated app area. Client-rendered: it depends on the browser session.
export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppLayout,
});

function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<boolean | null>(null);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: sub } = sb.auth.onAuthStateChange((event, s) => {
      // Token refresh failed or the session was revoked elsewhere: keep the page and ask to sign in again.
      if (event === "SIGNED_OUT" && !signOutIntent.current) {
        window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
        return;
      }
      setSession(Boolean(s));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === false) navigate({ to: "/auth", search: { mode: "login", next: pathname } });
  }, [session, navigate, pathname]);

  const { data: me, error, isLoading } = useMe(session === true);

  useEffect(() => {
    if (me && (!me.flags.profile_ready || !me.profile.role_id)) navigate({ to: "/setup" });
  }, [me, navigate]);

  if (session !== true || isLoading) return <Spinner fullScreen />;
  if (error || !me)
    return (
      <div className="mx-auto max-w-md p-8">
        <ErrorNote error={error ?? new Error("Couldn't load your account")} />
      </div>
    );
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}
