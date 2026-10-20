import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { HuzzlerLoader } from "./components/app/Loader";
import { ApiError } from "./lib/api";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Client errors (expired session, not allowed, not found) won't fix themselves: show them now.
        retry: (count, err) =>
          !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Route transitions that wait on a loader show the branded loader after a short delay.
    defaultPendingComponent: () => <HuzzlerLoader fullScreen />,
    defaultPendingMs: 400,
    defaultPendingMinMs: 300,
  });

  return router;
};
