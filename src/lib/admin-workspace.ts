import { useEffect, useState } from "react";

const STORAGE_KEY = "lubumbashi-connect-admin-workspace-v2";
const STORAGE_VERSION = 1;

export type ReviewStatus = "pending" | "approved" | "rejected" | "changes-requested";
export type JobStatus = "published" | "paused" | "expired";
export type AdminRole = "Administrateur" | "Modérateur" | "Agent terrain";
export type WorkspaceEvent = { id: string; date: string; title: string; type: string };
export type WorkspaceJob = { id: string; title: string; organization: string; deadline: string };
export type WorkspaceMember = { id: string; name: string; email: string; role: AdminRole; active: boolean };

export type WorkspaceState = {
  reviewStatus: Record<string, ReviewStatus>;
  verifiedListingIds: string[];
  hiddenListingIds: string[];
  readNotificationIds: string[];
  jobStatus: Record<string, JobStatus>;
  jobs: WorkspaceJob[];
  events: WorkspaceEvent[];
  members: WorkspaceMember[];
  completedEventIds: string[];
  audit: { id: string; action: string; detail: string; at: string }[];
};

const initialState: WorkspaceState = {
  reviewStatus: {},
  verifiedListingIds: [],
  hiddenListingIds: [],
  readNotificationIds: [],
  jobStatus: {},
  jobs: [],
  events: [],
  members: [],
  completedEventIds: [],
  audit: [],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isWorkspaceState(value: unknown): value is WorkspaceState & { version: number } {
  if (!isObject(value)) return false;
  const data = value;
  const reviewStatuses = ["pending", "approved", "rejected", "changes-requested"];
  const jobStatuses = ["published", "paused", "expired"];
  const roles = ["Administrateur", "Modérateur", "Agent terrain"];
  const stringArray = (items: unknown) => Array.isArray(items) && items.every((item) => typeof item === "string");

  return (
    data.version === STORAGE_VERSION &&
    isObject(data.reviewStatus) &&
    Object.values(data.reviewStatus).every((status) => reviewStatuses.includes(String(status))) &&
    stringArray(data.verifiedListingIds) &&
    stringArray(data.hiddenListingIds) &&
    stringArray(data.readNotificationIds) &&
    isObject(data.jobStatus) &&
    Object.values(data.jobStatus).every((status) => jobStatuses.includes(String(status))) &&
    Array.isArray(data.jobs) &&
    data.jobs.every((job) => isObject(job) && ["id", "title", "organization", "deadline"].every((key) => typeof job[key] === "string")) &&
    Array.isArray(data.events) &&
    data.events.every((event) => isObject(event) && ["id", "date", "title", "type"].every((key) => typeof event[key] === "string")) &&
    Array.isArray(data.members) &&
    data.members.every((member) =>
      isObject(member) &&
      typeof member.id === "string" &&
      typeof member.name === "string" &&
      typeof member.email === "string" &&
      roles.includes(String(member.role)) &&
      typeof member.active === "boolean",
    ) &&
    stringArray(data.completedEventIds) &&
    Array.isArray(data.audit) &&
    data.audit.every((item) =>
      isObject(item) &&
      typeof item.id === "string" &&
      typeof item.action === "string" &&
      typeof item.detail === "string" &&
      typeof item.at === "string",
    )
  );
}

export function useAdminWorkspace() {
  const [state, setState] = useState<WorkspaceState>(initialState);
  const [ready, setReady] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [canPersist, setCanPersist] = useState(true);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (!isWorkspaceState(parsed)) {
          throw new Error("Le format des données locales est invalide.");
        }
        const { version: _version, ...workspace } = parsed;
        setState(workspace);
      }
    } catch (error) {
      console.error("Impossible de charger l’espace d’administration local.", error);
      setCanPersist(false);
      setPersistenceError("Les données locales sont illisibles. Les modifications ne seront pas enregistrées.");
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !canPersist) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: STORAGE_VERSION }));
      setPersistenceError("");
    } catch (error) {
      console.error("Impossible d’enregistrer l’espace d’administration local.", error);
      setCanPersist(false);
      setPersistenceError("Le navigateur n’a pas pu enregistrer les changements.");
    }
  }, [state, ready, canPersist]);

  const recordAction = (action: string, detail: string, update: (current: WorkspaceState) => WorkspaceState) => {
    setState((current) => ({
      ...update(current),
      audit: [
        { id: crypto.randomUUID(), action, detail, at: new Date().toISOString() },
        ...current.audit,
      ].slice(0, 100),
    }));
  };

  return { state, recordAction, persistenceError };
}
