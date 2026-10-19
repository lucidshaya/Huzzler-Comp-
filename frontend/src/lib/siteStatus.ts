import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MAINTENANCE_EVENT } from "./api";

export type SiteStatus = { maintenance: { enabled: boolean; message: string; eta: string | null } };


const STAFF_KEY = "huzzler-staff-preview";
/** Browsers that have signed in to a staff portal can still browse the site during maintenance. */
export const markStaffBrowser = () => {
  try {
    localStorage.setItem(STAFF_KEY, "1");
  } catch {
    // storage blocked: staff just see the maintenance page like everyone else
  }
};
export const isStaffBrowser = () => {
  try {
    return localStorage.getItem(STAFF_KEY) === "1";
  } catch {
    return false;
  }
};

export function useSiteStatus() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["site-status"],
    queryFn: () => api<SiteStatus>("/status", { auth: false }),
    refetchInterval: 60_000,
    staleTime: 15_000,
    retry: 1,
  });
  useEffect(() => {
    const on = () => void qc.invalidateQueries({ queryKey: ["site-status"] });
    window.addEventListener(MAINTENANCE_EVENT, on);
    return () => window.removeEventListener(MAINTENANCE_EVENT, on);
  }, [qc]);
  return q;
}
