import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type TeamMember = {
  id: string;
  user_id: string | null;
  role_id: string;
  is_standin: boolean;
  standin_name: string | null;
  profile: { full_name: string | null; username: string | null } | null;
};
export type TeamData = {
  team: {
    id: string;
    name: string;
    current_level: number;
    persona: { name: string; mission: string; product_brief?: string; culture?: string };
  };
  members: TeamMember[];
  myRole: string;
} | null;
export type WorkspaceTask = {
  id: string;
  milestone_id: string | null;
  role_id: string;
  assignee_id: string | null;
  assignee_member_id: string | null;
  title: string;
  description?: string;
  status: string;
  due_at: string | null;
};
export type WorkspaceData = {
  project: {
    id: string;
    level: number;
    status: string;
    due_at: string;
    started_at: string;
    repo_url: string | null;
    template: { title: string; brief: string };
  } | null;
  milestones: Array<{ id: string; title: string; due_at: string; status: string }>;
  tasks: WorkspaceTask[];
  checkedInToday: boolean;
  results: Array<{ project_instance_id: string; total: number; passed: boolean }>;
} | null;

export const useTeam = (enabled = true) =>
  useQuery({
    queryKey: ["team"],
    queryFn: () => api<TeamData>("/team"),
    enabled,
    staleTime: 30_000,
    // Not on a squad yet (or being re-seated): check again shortly instead of waiting for a reload.
    refetchInterval: (q) => (q.state.data ? false : 10_000),
  });
export const useWorkspace = (enabled = true) =>
  useQuery({
    queryKey: ["workspace"],
    queryFn: () => api<WorkspaceData>("/workspace"),
    enabled,
    refetchInterval: 30_000,
  });

export const memberName = (m: TeamMember | undefined) =>
  !m ? "Unassigned" : m.is_standin ? "Stand-in" : (m.profile?.full_name ?? "Teammate");
