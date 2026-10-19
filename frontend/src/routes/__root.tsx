import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SessionExpiredDialog, resolveError, goToSignIn } from "../components/app/Feedback";
import { HzToaster } from "../components/app/Toast";
import { DialogHost } from "../components/app/Dialogs";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  const r = resolveError(error);
  const expired = r.action?.run === "signin";
  const Icon = r.icon;
  const retry = () => {
    router.invalidate();
    reset();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="hz-fade-up flex max-w-md flex-col items-center text-center">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary ring-4 ring-primary/10">
          <Icon className="h-8 w-8" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold tracking-tight">
          {expired ? r.title : "This page didn't load"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {expired ? r.message : "Something went wrong on our end. Try again — and if it keeps happening, head back to your dashboard."}
        </p>
        {import.meta.env.DEV && !expired && (
          <pre className="mt-4 max-h-40 w-full overflow-auto rounded-lg bg-muted p-3 text-left text-xs text-red-500">{error instanceof Error ? error.message : String(error)}</pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {expired ? (
            <button onClick={() => void goToSignIn()} className="btn-duo !py-2.5 !px-5 text-sm">
              Sign in again
            </button>
          ) : (
            <button onClick={retry} className="btn-duo !py-2.5 !px-5 text-sm">
              Try again
            </button>
          )}
          <a href="/dashboard" className="btn-duo-outline !py-2.5 !px-5 text-sm">
            Go to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { property: "og:site_name", content: "Huzzler" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Huzzler",
          url: "/",
          description:
            "Experience-as-a-service for young African tech talent: prove your skills, join a real team, ship five projects and earn a verifiable certificate.",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <SessionExpiredDialog />
      <DialogHost />
      <HzToaster />
    </QueryClientProvider>
  );
}
