import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState, type ErrorComponentProps } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Home,
  LogOut,
  LayoutDashboard,
  MapPin,
  Menu,
  MoreHorizontal,
  Search,
  Settings2,
  Store,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { categoryLabel, CATEGORIES } from "@/data/listings";
import { DEVICE_CATEGORIES, fetchDeviceMetrics, fetchTrafficMetrics, type DeviceCategory, type DeviceMetric, type TrafficMetric } from "@/lib/device-analytics";
import { reportAdminError } from "@/lib/admin-users";
import { getAuthenticatedAdmin, signOut } from "@/lib/supabase-auth";
import {
  fetchAdminDashboardEvents,
  fetchAdminDashboardJobs,
  fetchAdminDashboardListings,
  fetchAdminDashboardActivity,
  fetchAdminEditorialCalendar,
  fetchAdminEditorialTasks,
  fetchAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  type SupabaseRow,
} from "@/lib/supabase-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const admin = await getAuthenticatedAdmin();
    if (!admin) throw redirect({ to: "/login" });
  },
  errorComponent: AdminAccessError,
  head: () => ({
    meta: [
      { title: "Administration — Lubumbashi Connect" },
      { name: "description", content: "Tableau de bord d’administration de Lubumbashi Connect." },
    ],
  }),
  component: AdminDashboard,
});

function AdminAccessError({ error, reset }: ErrorComponentProps) {
  return (
    <main className="admin-dashboard flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg border border-border bg-card p-6">
        <h1 className="font-display text-xl font-bold">Impossible de vérifier l’accès administrateur</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {error.message || "La vérification de la session Supabase a échoué."}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="h-10 bg-primary px-4 text-sm font-semibold text-primary-foreground">
            Réessayer
          </button>
          <Link to="/login" className="inline-flex h-10 items-center border border-border px-4 text-sm font-semibold">
            Aller à la connexion
          </Link>
        </div>
      </section>
    </main>
  );
}

type DashboardActivity = {
  id: string;
  action: string;
  entityType: string;
  summary: string;
  createdAt: string;
  actorName: string;
};
type CalendarDashboardEvent = {
  id: string;
  title: string;
  startsAt: string;
  color: string;
};
type DashboardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

type DashboardListing = {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  quartier: string | null;
  commune: string | null;
  rating: number | null;
  reviewsCount: number;
  verified: boolean;
  status: string;
};

const number = (value: number) => new Intl.NumberFormat("fr-FR").format(value);

function calendarDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function calendarEventDateKey(startsAt: string) {
  const date = new Date(startsAt);
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Lubumbashi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  const day = parts.find(({ type }) => type === "day")?.value;
  if (!year || !month || !day) throw new Error("Calendar event has an invalid start date");
  return `${year}-${month}-${day}`;
}

function formatCalendarEventTime(startsAt: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Lubumbashi",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function formatActivityTime(createdAt: string) {
  const date = new Date(createdAt);
  if (!Number.isFinite(date.getTime())) return "Date inconnue";
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
  return formatter.format(Math.round(hours / 24), "day");
}

function activityActionLabel(action: string) {
  switch (action) {
    case "INSERT": return "a créé";
    case "UPDATE": return "a modifié";
    case "DELETE": return "a supprimé";
    case "ERROR": return "a signalé une erreur";
    default: return "a effectué une activité sur";
  }
}

function activityEntityLabel(entityType: string) {
  const labels: Record<string, string> = {
    listings: "une fiche annuaire",
    events: "un événement",
    jobs: "une offre d’emploi",
    editorial_tasks: "une tâche éditoriale",
    editorial_calendar: "un élément du calendrier",
    listing_reviews: "un avis",
    job_applications: "une candidature",
    application_error: "une erreur de l’application",
    profiles: "un profil",
    user_roles: "un rôle d’équipe",
  };
  return labels[entityType] ?? entityType.replaceAll("_", " ");
}

function calendarEventColor(itemType: string) {
  if (itemType === "event") return "bg-sky-400";
  if (itemType === "job") return "bg-emerald-400";
  if (itemType === "moderation") return "bg-rose-400";
  if (itemType === "team") return "bg-violet-400";
  return "bg-primary";
}

function displayTaskDueDate(dueAt: string | null) {
  if (!dueAt) return "Sans échéance";
  const date = new Date(dueAt);
  if (!Number.isFinite(date.getTime())) return "Échéance invalide";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lubumbashi",
  }).format(date);
}

function formatMetricDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" })
    .format(new Date(`${value}T12:00:00`));
}

const categoryColors = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-orange-400",
  "bg-rose-400",
  "bg-cyan-400",
];

const categoryChartColors = ["#1abc9c", "#3498db", "#f39c12", "#27ae60", "#9b59b6", "#e74c3c"];

const devicePresentation: Record<DeviceCategory, { label: string; color: string }> = {
  android: { label: "Android", color: "#36a2eb" },
  mobile_web: { label: "Web mobile", color: "#e8ba36" },
  desktop: { label: "Ordinateur", color: "#a84bd4" },
  ios: { label: "iOS", color: "#e74c3c" },
  other: { label: "Autre", color: "#7c8fa6" },
};

const categoryBadgeColors: Record<string, string> = {
  restaurants: "bg-orange-400/15 text-orange-300",
  transport: "bg-sky-400/15 text-sky-300",
  sante: "bg-emerald-400/15 text-emerald-300",
  droit: "bg-violet-400/15 text-violet-300",
  artisans: "bg-amber-400/15 text-amber-300",
  ecoles: "bg-sky-400/15 text-sky-300",
  associations: "bg-rose-400/15 text-rose-300",
  commerces: "bg-cyan-400/15 text-cyan-300",
  hotels: "bg-fuchsia-400/15 text-fuchsia-300",
  culture: "bg-lime-400/15 text-lime-300",
};

function AdminDashboard() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [accessState, setAccessState] = useState<"checking" | "allowed" | "error">("checking");
  const [accessError, setAccessError] = useState("");
  const [authCheckAttempt, setAuthCheckAttempt] = useState(0);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("7 jours");
  const [traffic, setTraffic] = useState<TrafficMetric[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(true);
  const [trafficError, setTrafficError] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<SupabaseRow[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [notificationsError, setNotificationsError] = useState("");
  const [notificationRefreshAttempt, setNotificationRefreshAttempt] = useState(0);
  const [dashboardListings, setDashboardListings] = useState<DashboardListing[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarDashboardEvent[]>([]);
  const [dashboardActivity, setDashboardActivity] = useState<DashboardActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState(false);
  const [editorialTasks, setEditorialTasks] = useState<DashboardTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [tasksError, setTasksError] = useState(false);
  const [publishedJobsCount, setPublishedJobsCount] = useState<number | null>(null);
  const [publishedEventsCount, setPublishedEventsCount] = useState<number | null>(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [contentError, setContentError] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState(new Date().getDate());
  const trafficDays = Number.parseInt(period, 10);

  useEffect(() => {
    let active = true;
    setAccessState("checking");
    setAccessError("");

    getAuthenticatedAdmin()
      .then((admin) => {
        if (!active) return;
        if (!admin) {
          void navigate({ to: "/login", replace: true });
          return;
        }
        setAccessState("allowed");
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to verify admin access", error);
        setAccessError(error instanceof Error ? error.message : "La vérification de la session a échoué.");
        setAccessState("error");
      });

    return () => {
      active = false;
    };
  }, [authCheckAttempt, navigate]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error("Supabase sign-out failed", error);
    }
    await navigate({ to: "/login" });
  };

  const visibleListings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return dashboardListings.filter((listing) =>
      `${listing.name} ${listing.category} ${listing.subcategory} ${listing.quartier}`
        .toLocaleLowerCase("fr")
        .includes(query),
    ).slice(0, 5);
  }, [dashboardListings, search]);

  const pending = dashboardListings.filter((listing) => listing.status === "pending" || listing.status === "draft").length;
  const verifiedListingsCount = dashboardListings.filter((listing) => listing.verified).length;
  const otherListingStatusesCount = dashboardListings.length - verifiedListingsCount - pending;
  const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
  const startOffset = (calendarMonth.getDay() + 6) % 7;
  const calendarCells = Array.from(
    { length: Math.ceil((startOffset + daysInMonth) / 7) * 7 },
    (_, index) => {
      const day = index - startOffset + 1;
      return day > 0 && day <= daysInMonth ? day : null;
    },
  );
  const selectedDateKey = calendarDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth(), selectedDay);
  const calendarEventDateKeys = new Set(calendarEvents.map((event) => calendarEventDateKey(event.startsAt)));
  const selectedEvent = calendarEvents.find((event) => calendarEventDateKey(event.startsAt) === selectedDateKey);
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;
  const completedSessions = traffic.reduce((total, day) => total + day.completedSessions, 0);
  const sessionDurationSeconds = traffic.reduce((total, day) => total + day.sessionDurationSeconds, 0);
  const averageSessionMinutes = completedSessions > 0
    ? (sessionDurationSeconds / completedSessions / 60).toLocaleString("fr-FR", { maximumFractionDigits: 1 })
    : "—";

  useEffect(() => {
    if (accessState !== "allowed") return;
    const loadNotifications = async () => {
      try {
        const rows = await fetchAdminNotifications();
        setNotifications(rows);
        setNotificationsError("");
      } catch (error) {
        console.error("Unable to load admin notifications", error);
        setNotificationsError(error instanceof Error ? error.message : "Impossible de charger les notifications.");
      } finally {
        setNotificationsLoading(false);
      }
    };

    void loadNotifications();
    const intervalId = window.setInterval(() => void loadNotifications(), 30_000);
    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") void loadNotifications();
    };
    document.addEventListener("visibilitychange", refreshOnFocus);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshOnFocus);
    };
  }, [accessState, notificationRefreshAttempt]);

  useEffect(() => {
    if (accessState !== "allowed") return;
    const onWindowError = (event: ErrorEvent) => {
      void reportAdminError(
        `runtime ${window.location.pathname}`,
        event.error instanceof Error ? event.error : event.message,
      );
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void reportAdminError(`promise ${window.location.pathname}`, event.reason);
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, [accessState]);

  const markNotificationRead = async (notification: SupabaseRow) => {
    const id = typeof notification.id === "string" ? notification.id : "";
    if (!id || notification.read_at) return;
    try {
      await markAdminNotificationRead(id);
      setNotifications((current) => current.map((item) => item.id === id
        ? { ...item, read_at: new Date().toISOString() }
        : item));
    } catch (error) {
      console.error("Unable to mark admin notification as read", error);
      setNotificationsError(error instanceof Error ? error.message : "Impossible de mettre à jour la notification.");
      void reportAdminError("dashboard.notifications.mark_read", error);
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await markAllAdminNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((item) => item.read_at ? item : { ...item, read_at: readAt }));
    } catch (error) {
      console.error("Unable to mark all admin notifications as read", error);
      setNotificationsError(error instanceof Error ? error.message : "Impossible de mettre à jour les notifications.");
      void reportAdminError("dashboard.notifications.mark_all_read", error);
    }
  };

  useEffect(() => {
    if (accessState !== "allowed") return;
    let active = true;
    Promise.all([fetchAdminDashboardListings(), fetchAdminDashboardEvents(), fetchAdminDashboardJobs()])
      .then(([listingRows, eventRows, jobRows]) => {
        if (!active) return;
        setDashboardListings(listingRows.map((row: SupabaseRow) => ({
          id: String(row.id),
          name: String(row.name ?? ""),
          category: String(row.category_id ?? ""),
          subcategory: String(row.subcategory_id ?? ""),
          quartier: typeof row.quartier === "string" ? row.quartier : null,
          commune: typeof row.commune === "string" ? row.commune : null,
          rating: null,
          reviewsCount: 0,
          verified: row.status === "verified",
          status: String(row.status ?? ""),
        })));
        setPublishedEventsCount(eventRows.filter((row) => row.status === "published").length);
        setPublishedJobsCount(jobRows.filter((row) => row.status === "published").length);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load dashboard content from Supabase", error);
        void reportAdminError("dashboard.content.load", error);
        setContentError("Les contenus du dashboard n’ont pas pu être chargés depuis Supabase.");
      })
      .finally(() => {
        if (active) setContentLoading(false);
      });
    return () => {
      active = false;
    };
  }, [accessState]);

  useEffect(() => {
    if (accessState !== "allowed") return;
    let active = true;
    setActivityLoading(true);
    setActivityError(false);

    const loadActivity = async () => {
      try {
        const rows = await fetchAdminDashboardActivity();
        if (!active) return;
        setDashboardActivity(rows.map((row) => ({
          id: String(row.activity_id),
          action: String(row.action ?? ""),
          entityType: String(row.entity_type ?? ""),
          summary: String(row.summary ?? ""),
          createdAt: String(row.created_at ?? ""),
          actorName: String(row.actor_name ?? "Membre de l’équipe"),
        })));
        setActivityError(false);
      } catch (error) {
        if (!active) return;
        console.error("Unable to load recent admin activity", error);
        void reportAdminError("dashboard.activity.load", error);
        setActivityError(true);
      } finally {
        if (active) setActivityLoading(false);
      }
    };

    void loadActivity();
    const intervalId = window.setInterval(() => void loadActivity(), 30_000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [accessState]);

  useEffect(() => {
    if (accessState !== "allowed") return;
    let active = true;
    setTasksLoading(true);
    setTasksError(false);

    fetchAdminEditorialTasks()
      .then((rows) => {
        if (!active) return;
        setEditorialTasks(rows.map((row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
          status: String(row.status ?? ""),
          priority: String(row.priority ?? ""),
          dueAt: typeof row.due_at === "string" ? row.due_at : null,
        })));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load editorial tasks", error);
        void reportAdminError("dashboard.tasks.load", error);
        setTasksError(true);
      })
      .finally(() => {
        if (active) setTasksLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessState]);

  useEffect(() => {
    if (accessState !== "allowed") return;
    let active = true;
    setCalendarLoading(true);
    setCalendarError(false);
    setCalendarEvents([]);
    const start = `${calendarDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)}T00:00:00+02:00`;
    const end = `${calendarDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)}T00:00:00+02:00`;

    fetchAdminEditorialCalendar(start, end)
      .then((rows) => {
        if (!active) return;
        setCalendarEvents(rows.map((row) => ({
          id: String(row.id),
          title: String(row.title ?? ""),
          startsAt: String(row.starts_at ?? ""),
          color: calendarEventColor(String(row.item_type ?? "")),
        })));
        setCalendarError(false);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load editorial calendar", error);
        void reportAdminError("dashboard.editorial_calendar.load", error);
        setCalendarError(true);
      })
      .finally(() => {
        if (active) setCalendarLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessState, calendarMonth]);

  useEffect(() => {
    if (accessState !== "allowed") return;
    if (pathname.startsWith("/admin/workspace")) return;
    let active = true;
    setTrafficLoading(true);
    setTrafficError(false);
    setTraffic([]);

    fetchTrafficMetrics(trafficDays)
      .then((metrics) => {
        if (active) setTraffic(metrics);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load dashboard traffic metrics", error);
        void reportAdminError("dashboard.traffic.load", error);
        setTraffic([]);
        setTrafficError(true);
      })
      .finally(() => {
        if (active) setTrafficLoading(false);
      });

    return () => {
      active = false;
    };
  }, [accessState, pathname, trafficDays]);

  const shiftMonth = (amount: number) => {
    setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1));
    setSelectedDay(1);
  };

  if (accessState === "checking") {
    return (
      <main className="admin-dashboard relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 text-foreground">
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 animate-pulse bg-primary/10 blur-3xl" />
        <div role="status" aria-label="Vérification de votre accès administrateur" className="relative flex flex-col items-center gap-4">
          <span aria-hidden="true" className="relative grid h-14 w-14 place-items-center">
            <span className="absolute inset-0 animate-ping border border-primary/35 motion-reduce:animate-none" />
            <span className="h-10 w-10 animate-spin border-2 border-primary/20 border-t-primary motion-reduce:animate-none" />
            <span className="absolute h-1.5 w-1.5 bg-primary shadow-[0_0_14px_4px_hsl(var(--primary)/0.5)]" />
          </span>
          <p className="text-sm font-medium text-foreground">Vérification de votre accès…</p>
        </div>
      </main>
    );
  }
  if (accessState === "error") {
    return (
      <main className="admin-dashboard flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
        <section className="w-full max-w-lg border border-border bg-card p-6">
          <h1 className="font-display text-xl font-bold">Accès refusé</h1>
          <p role="alert" className="mt-3 text-sm leading-relaxed text-muted-foreground">{accessError}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => setAuthCheckAttempt((attempt) => attempt + 1)} className="h-10 bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Réessayer
            </button>
            <Link to="/login" className="inline-flex h-10 items-center border border-border px-4 text-sm font-semibold">
              Aller à la connexion
            </Link>
          </div>
        </section>
      </main>
    );
  }
  if (pathname.startsWith("/admin/workspace")) return <Outlet />;

  return (
    <div className="admin-dashboard min-h-screen bg-background text-foreground">
      {mobileSidebarOpen && (
        <button
          aria-label="Fermer la navigation"
          onClick={() => setMobileSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[258px] flex-col border-r border-border bg-card transition-[width,transform] duration-200 lg:translate-x-0",
          sidebarCollapsed ? "lg:w-[68px]" : "lg:w-[258px]",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className={cn("flex h-14 shrink-0 items-center border-b border-border px-4", sidebarCollapsed && "lg:justify-center lg:px-0")}>
          <Link to="/" className="flex min-w-0 items-center gap-2.5" aria-label="Lubumbashi Connect, accueil">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-primary text-sm font-black text-primary-foreground">L</span>
            <span className={cn("min-w-0 leading-tight", sidebarCollapsed && "lg:hidden")}>
              <span className="block truncate font-display text-xs font-bold">Lubumbashi Connect</span>
              <span className="mt-0.5 block text-[9px] text-muted-foreground">Administration</span>
            </span>
          </Link>
          <button onClick={() => setMobileSidebarOpen(false)} className="ml-auto grid h-8 w-8 place-items-center rounded text-muted-foreground hover:bg-muted lg:hidden" aria-label="Fermer la navigation">
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav aria-label="Navigation d’administration" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <SidebarGroup title="Général" collapsed={sidebarCollapsed}>
            <SidebarLink href="#dashboard" icon={LayoutDashboard} label="Dashboard" active collapsed={sidebarCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
            <SidebarLink href="/admin/workspace#directory" icon={Store} label="Annuaire" collapsed={sidebarCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
            <SidebarLink href="/admin/workspace#events" icon={CalendarDays} label="Agenda" collapsed={sidebarCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
            <SidebarLink href="/admin/workspace#jobs" icon={BriefcaseBusiness} label="Emplois" collapsed={sidebarCollapsed} onNavigate={() => setMobileSidebarOpen(false)} />
          </SidebarGroup>
        </nav>

        <div className={cn("flex h-[58px] shrink-0 items-center gap-2.5 border-t border-border px-4", sidebarCollapsed && "lg:justify-center lg:px-0")}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">A</span>
          <span className={cn("min-w-0 flex-1 leading-tight", sidebarCollapsed && "lg:hidden")}>
            <span className="block truncate text-[10px] font-semibold">Administrateur</span>
            <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">Lubumbashi Connect</span>
          </span>
          <button className={cn("rounded p-1 text-muted-foreground hover:bg-muted", sidebarCollapsed && "lg:hidden")} aria-label="Options du compte"><MoreHorizontal className="h-4 w-4" /></button>
        </div>
      </aside>

      <div className={cn("min-h-screen transition-[padding] duration-200", sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-[258px]")}>
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <button
              onClick={() => setMobileSidebarOpen(true)}
              className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              className="hidden h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:grid"
              aria-label={sidebarCollapsed ? "Développer la barre latérale" : "Réduire la barre latérale"}
              aria-expanded={!sidebarCollapsed}
            >
              <Menu className="h-4 w-4" />
            </button>
            <span className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
              Administration <ChevronRight className="h-3 w-3" /> <span className="text-foreground">Dashboard</span>
            </span>
            <span className="font-display text-xs font-bold sm:hidden">Dashboard</span>
          </div>
          <label className="relative mx-3 hidden w-full max-w-[280px] sm:block">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une fiche…"
              aria-label="Rechercher une fiche"
              className="h-9 w-full rounded-md border border-border bg-background pl-8 pr-2 text-[10px] outline-none placeholder:text-muted-foreground focus:border-primary/70"
            />
          </label>
          <div className="flex items-center gap-1.5">
            <Link to="/" className="hidden h-9 items-center gap-1.5 rounded border border-border px-3 text-[10px] font-semibold text-primary hover:bg-muted md:inline-flex">
              <LayoutDashboard className="h-3.5 w-3.5" /> Site public
            </Link>
            <div className="relative" id="notifications">
              <button
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative grid h-9 w-9 place-items-center rounded text-muted-foreground hover:bg-muted"
                aria-label={`Notifications${unreadCount ? `, ${unreadCount} non lues` : ""}`}
                aria-expanded={notificationsOpen}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && <span className={`absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full px-1 text-[8px] font-bold text-white ${notifications.some((item) => !item.read_at && item.notification_type === "system_error") ? "bg-destructive" : "bg-primary"}`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-10 z-50 w-[min(90vw,340px)] overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
                  <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                    <div><p className="text-xs font-semibold">Notifications</p><p className="text-[9px] text-muted-foreground">{unreadCount} non lue{unreadCount === 1 ? "" : "s"}</p></div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setNotificationRefreshAttempt((attempt) => attempt + 1)} className="text-[9px] font-semibold text-muted-foreground hover:underline">Actualiser</button>
                      <button type="button" onClick={() => void markAllNotificationsRead()} disabled={!unreadCount} className="text-[9px] font-semibold text-primary hover:underline disabled:opacity-50">Tout lire</button>
                    </div>
                  </div>
                  {notificationsError && <p role="alert" className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-[9px] text-destructive">{notificationsError}</p>}
                  <div className="max-h-[min(65vh,420px)] overflow-y-auto">
                    {notifications.map((notification) => {
                      const id = typeof notification.id === "string" ? notification.id : "";
                      const isError = notification.notification_type === "system_error";
                      const title = typeof notification.title === "string" ? notification.title : "Notification";
                      const detail = typeof notification.body === "string" ? notification.body : "";
                      const createdAt = typeof notification.created_at === "string" ? notification.created_at : "";
                      const time = createdAt && Number.isFinite(Date.parse(createdAt))
                        ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(createdAt))
                        : "";
                      return (
                        <button key={id} type="button" onClick={() => void markNotificationRead(notification)} className={`flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-0 hover:bg-muted/50 ${!notification.read_at ? "bg-muted/20" : ""}`}>
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-md ${isError ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                            {isError ? <AlertTriangle className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={`block text-[10px] font-semibold ${isError ? "text-destructive" : ""}`}>{title}</span>
                            <span className="mt-0.5 block whitespace-normal break-words text-[9px] text-muted-foreground">{detail}</span>
                            {time && <span className="mt-1 block text-[9px] text-muted-foreground">{time}</span>}
                          </span>
                          {!notification.read_at && <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${isError ? "bg-destructive" : "bg-primary"}`} />}
                        </button>
                      );
                    })}
                  </div>
                  {notificationsLoading && notifications.length === 0 && <p className="px-3 py-5 text-center text-[9px] text-muted-foreground">Chargement des notifications…</p>}
                  {!notificationsLoading && notifications.length === 0 && !notificationsError && <p className="px-3 py-5 text-center text-[9px] text-muted-foreground">Aucune notification disponible.</p>}
                </div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground outline-none ring-offset-background transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" aria-label="Ouvrir le menu du compte administrateur">
                  A
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-60 border-border bg-card p-1.5 text-foreground shadow-xl">
                <DropdownMenuLabel className="px-2.5 py-2 font-normal">
                  <span className="block text-xs font-semibold text-foreground">Administrateur</span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">Gestion de Lubumbashi Connect</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/profile"><Users className="h-4 w-4 text-muted-foreground" /> Mon profil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/profile"><Settings2 className="h-4 w-4 text-muted-foreground" /> Paramètres du compte</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuLabel className="px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pages de Lubumbashi Connect
                </DropdownMenuLabel>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/annuaire"><Store className="h-4 w-4 text-muted-foreground" /> Annuaire</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/agenda"><CalendarDays className="h-4 w-4 text-muted-foreground" /> Agenda</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/emplois"><BriefcaseBusiness className="h-4 w-4 text-muted-foreground" /> Offres d’emploi</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/plus"><CircleHelp className="h-4 w-4 text-muted-foreground" /> Infos pratiques & aide</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/"><Home className="h-4 w-4 text-muted-foreground" /> Retour au site public</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2 text-xs focus:bg-muted focus:text-foreground">
                  <Link to="/signup"><Users className="h-4 w-4 text-muted-foreground" /> Créer un compte</Link>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => { void handleSignOut(); }}
                  className="cursor-pointer gap-2.5 py-2 text-xs text-primary focus:bg-primary/10 focus:text-primary"
                >
                  <LogOut className="h-4 w-4" /> Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

      <main id="dashboard" className="mx-auto max-w-[1400px] px-4 pb-8 pt-5 sm:px-6 xl:px-7">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-muted-foreground">Aperçu · Lubumbashi Connect</p>
            <h1 className="mt-0.5 font-display text-lg font-bold leading-tight">Dashboard</h1>
          </div>
          <a href="/admin/workspace#directory" className="inline-flex h-9 items-center gap-1.5 rounded bg-primary px-3 text-[9px] font-bold text-primary-foreground transition hover:brightness-95"><Store className="h-3.5 w-3.5" /> Gérer l’annuaire</a>
        </div>

        <div className="mb-3 flex items-start gap-2 rounded border border-border bg-card/70 px-3 py-2 text-[9px] leading-relaxed text-muted-foreground">
          <CircleHelp className="mt-px h-3 w-3 shrink-0 text-primary" />
          <p><strong className="text-foreground">État des données :</strong> les fiches, événements et offres viennent de Supabase. Les indicateurs d’audience dépendent du déploiement de la fonction de collecte.</p>
        </div>
        {contentError && <p role="alert" className="mb-3 border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{contentError}</p>}

        <section aria-label="Indicateurs clés" className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <StatCard icon={Users} label="Sessions de la période" value={trafficLoading ? "…" : trafficError ? "—" : number(traffic.reduce((total, day) => total + day.sessions, 0))} change="" description={trafficError ? "Statistiques indisponibles" : "Sessions estimées"} color="teal" />
          <StatCard icon={Clock3} label="Durée moyenne de visite" value={trafficLoading || trafficError ? "—" : averageSessionMinutes} unit="min" change="" description={trafficError ? "Statistiques indisponibles" : completedSessions ? "Moyenne des sessions terminées" : "En attente de sessions terminées"} color="blue" />
          <StatCard icon={Store} label="Fiches publiées" value={contentLoading ? "…" : number(dashboardListings.filter((listing) => listing.verified).length)} change="" description="Annuaire Supabase" color="gold" />
          <StatCard icon={BriefcaseBusiness} label="Offres publiées" value={publishedJobsCount === null ? "…" : number(publishedJobsCount)} change="" description="Emplois Supabase" color="green" />
          <StatCard icon={CalendarDays} label="Événements publiés" value={publishedEventsCount === null ? "…" : number(publishedEventsCount)} change="" description="Agenda Supabase" color="red" />
          <StatCard icon={MapPin} label="Fiches consultées" value={trafficLoading ? "…" : trafficError ? "—" : number(traffic.reduce((total, day) => total + day.listingViews, 0))} change="" description={trafficError ? "Statistiques indisponibles" : "Consultations estimées"} color="purple" />
        </section>

        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <div className="grid content-start gap-3">
            <section id="analytics" className="overflow-hidden rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2.5">
              <div><h2 className="text-[11px] font-bold">Fréquentation de Lubumbashi Connect</h2><p className="mt-0.5 text-[9px] text-muted-foreground">Sessions et consultations des fiches</p></div>
              <div className="flex rounded bg-background p-0.5">
                {["7 jours", "30 jours", "90 jours"].map((label) => <button key={label} onClick={() => setPeriod(label)} className={cn("rounded px-2 py-1 text-[8px] transition", period === label ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}>{label}</button>)}
              </div>
            </div>
            <div className="px-3 pt-2.5">
              <div className="font-display text-lg font-bold">
                {trafficLoading ? "…" : trafficError || !traffic.some((day) => day.sessions || day.listingViews) ? "—" : number(traffic.reduce((total, day) => total + day.sessions, 0))}
              </div>
              <p className="text-[9px] text-muted-foreground">
                {trafficLoading ? "Chargement des statistiques…" : trafficError ? "Statistiques temporairement indisponibles" : `Sessions sur ${period}`}
              </p>
            </div>
            <div className="relative h-[180px] px-1 pt-1 sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={traffic} margin={{ top: 8, right: 10, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sessions-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8ba36" stopOpacity={0.2} /><stop offset="100%" stopColor="#e8ba36" stopOpacity={0} /></linearGradient>
                    <linearGradient id="pages-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36a2eb" stopOpacity={0.18} /><stop offset="100%" stopColor="#36a2eb" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 8 }} tickFormatter={(date: string) => formatMetricDate(date)} interval="preserveStartEnd" dy={7} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 8 }} />
                  <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }} labelFormatter={(date) => formatMetricDate(String(date))} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--foreground)", fontSize: 9 }} />
                  <Area type="monotone" dataKey="sessions" name="Sessions" stroke="#e8ba36" strokeWidth={2} fill="url(#sessions-gradient)" activeDot={{ r: 4 }} isAnimationActive={!trafficLoading} animationDuration={700} animationEasing="ease-out" />
                  <Area type="monotone" dataKey="listingViews" name="Fiches consultées" stroke="#36a2eb" strokeWidth={1.5} strokeDasharray="4 3" fill="url(#pages-gradient)" activeDot={{ r: 4 }} isAnimationActive={!trafficLoading} animationDuration={700} animationEasing="ease-out" />
                </AreaChart>
              </ResponsiveContainer>
              {!trafficLoading && !trafficError && !traffic.some((day) => day.sessions || day.listingViews) && <p className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">Aucune donnée de fréquentation</p>}
              {!trafficLoading && trafficError && <p className="pointer-events-none absolute inset-0 grid place-items-center text-[10px] text-muted-foreground">Impossible de charger le graphique</p>}
            </div>
            <div className="flex gap-4 border-t border-border px-3 py-2 text-[8px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 bg-primary" /> Sessions</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-0.5 w-3 border-t border-dashed border-sky-400" /> Fiches consultées</span>
              <span className="ml-auto inline-flex items-center gap-1"><Clock3 className="h-2.5 w-2.5" /> {period}</span>
            </div>
            </section>
            <div className="grid gap-3 sm:grid-cols-2">
              <DeviceUsage period={period} />
              <DirectoryCategoryChart listings={dashboardListings} loading={contentLoading} error={Boolean(contentError)} />
            </div>
          </div>

          <section className="rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <PanelHeader title="Activité récente" action={<button aria-label="Options d’activité" className="text-muted-foreground hover:text-foreground"><MoreHorizontal className="h-3.5 w-3.5" /></button>} />
            <div className="divide-y divide-border px-3">
              {dashboardActivity.map((item, index) => (
                <div key={item.id} className="flex items-center gap-2 py-2">
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[8px] font-bold text-primary-foreground", index % 2 === 1 && "bg-muted text-foreground")}>{item.actorName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("fr")}</span>
                  <p className="min-w-0 flex-1 text-[9px] leading-relaxed text-muted-foreground"><strong className="font-semibold text-foreground">{item.actorName}</strong> {activityActionLabel(item.action)} <strong className="font-semibold text-foreground">{item.summary || activityEntityLabel(item.entityType)}</strong><span className="block text-[8px]">{formatActivityTime(item.createdAt)}</span></p>
                </div>
              ))}
              {activityLoading && dashboardActivity.length === 0 && <p className="py-8 text-center text-[9px] text-muted-foreground">Chargement de l’activité…</p>}
              {activityError && dashboardActivity.length === 0 && <p role="alert" className="py-8 text-center text-[9px] text-destructive">Impossible de charger l’activité récente.</p>}
              {!activityLoading && !activityError && dashboardActivity.length === 0 && <p className="py-8 text-center text-[9px] text-muted-foreground">Aucune activité enregistrée.</p>}
            </div>
          </section>
        </div>

        <div className="mt-3 grid items-start gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <section id="annuaire" className="scroll-mt-16 overflow-hidden rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <PanelHeader title="Fiches récentes de l’annuaire" subtitle="Établissements de Lubumbashi" action={<a href="/admin/workspace#directory" className="rounded border border-border px-2 py-1 text-[8px] font-semibold text-muted-foreground hover:bg-muted">Tout afficher →</a>} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px] text-left">
                <thead><tr className="border-b border-border bg-background/50 text-[8px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Établissement</th><th className="px-2 py-2 font-semibold">Catégorie</th><th className="px-2 py-2 font-semibold">Quartier</th><th className="px-2 py-2 font-semibold">Note</th><th className="px-2 py-2 font-semibold">Statut</th>
                </tr></thead>
                <tbody className="divide-y divide-border">
                  {visibleListings.map((listing) => (
                    <tr key={listing.id} className="text-[9px] hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5"><span className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">{listing.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("")}</span><span className="min-w-0"><strong className="block max-w-[150px] truncate text-foreground">{listing.name}</strong><span className="text-[8px] text-muted-foreground">{listing.subcategory}</span></span></span></td>
                      <td className="px-2 py-2.5"><span className={cn("inline-flex whitespace-nowrap rounded px-1.5 py-0.5 text-[8px] font-medium", categoryBadgeColors[listing.category] ?? "bg-muted text-muted-foreground")}>{categoryLabel(listing.category)}</span></td>
                      <td className="px-2 py-2.5 text-muted-foreground">{listing.quartier ?? "—"}</td>
                      <td className="px-2 py-2.5 whitespace-nowrap text-foreground">{listing.rating === null ? "—" : <><span className="text-amber-400">★</span> {listing.rating.toFixed(1)} <span className="text-muted-foreground">({listing.reviewsCount})</span></>}</td>
                      <td className="px-2 py-2.5"><span className={cn("whitespace-nowrap", listing.verified ? "text-emerald-400" : "text-amber-400")}>● {listing.verified ? "Vérifiée" : "À vérifier"}</span></td>
                    </tr>
                  ))}
                  {visibleListings.length === 0 && <tr><td colSpan={5} className="px-3 py-7 text-center text-[9px] text-muted-foreground">
                    {contentLoading
                      ? "Chargement des fiches…"
                      : contentError
                        ? "Impossible de charger les fiches."
                        : dashboardListings.length === 0
                          ? "Aucune fiche disponible."
                          : "Aucune fiche ne correspond à la recherche."}
                  </td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <div className="grid content-start gap-3 self-start sm:grid-cols-2 lg:grid-cols-1">
            <section className="self-start rounded-md border border-border bg-card shadow-lg shadow-black/10">
              <PanelHeader title="Annuaire par catégorie" subtitle={dashboardListings.length ? `${dashboardListings.length} fiches au total` : "Aucune donnée disponible"} />
              <div className="px-3 pb-3">
                <div className="flex h-2 overflow-hidden rounded-full bg-background">
                  {CATEGORIES.map((category, index) => {
                    const count = dashboardListings.filter((listing) => listing.category === category.id).length;
                    return count ? <span key={category.id} className={categoryColors[index % categoryColors.length]} style={{ width: `${(count / dashboardListings.length) * 100}%` }} title={`${categoryLabel(category.id)} : ${count}`} /> : null;
                  })}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  {dashboardListings.length === 0 && <p className="col-span-2 py-2 text-center text-[8px] text-muted-foreground">Aucune fiche disponible.</p>}
                  {CATEGORIES.filter((category) => dashboardListings.some((listing) => listing.category === category.id)).slice(0, 6).map((category, index) => (
                    <div key={category.id} className="flex items-center gap-1.5 text-[8px] text-muted-foreground"><i className={cn("h-1.5 w-1.5 rounded-full", categoryColors[index % categoryColors.length])} /> <span className="min-w-0 flex-1 truncate">{category.label}</span><strong className="text-foreground">{dashboardListings.filter((listing) => listing.category === category.id).length}</strong></div>
                  ))}
                </div>
              </div>
            </section>
            <section className="self-start rounded-md border border-border bg-card shadow-lg shadow-black/10">
              <PanelHeader title="Suivi des vérifications" subtitle={contentLoading ? "Chargement…" : `${dashboardListings.length} fiches dans l’annuaire`} />
              {contentLoading ? (
                <p className="px-3 py-5 text-center text-[8px] text-muted-foreground">Chargement des statuts…</p>
              ) : contentError ? (
                <p role="alert" className="px-3 py-5 text-center text-[8px] text-destructive">Impossible de charger les statuts.</p>
              ) : dashboardListings.length === 0 ? (
                <p className="px-3 py-5 text-center text-[8px] text-muted-foreground">Aucune fiche à vérifier.</p>
              ) : (
                <div className="px-3 pb-3 pt-2">
                  <div className="flex h-2 overflow-hidden rounded-full bg-background" aria-label={`${number(verifiedListingsCount)} fiches vérifiées sur ${number(dashboardListings.length)}`}>
                    <span className="bg-emerald-400" style={{ width: `${(verifiedListingsCount / dashboardListings.length) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${(pending / dashboardListings.length) * 100}%` }} />
                    <span className="bg-slate-500" style={{ width: `${(otherListingStatusesCount / dashboardListings.length) * 100}%` }} />
                  </div>
                  <div className="mt-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-[8px]">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><i className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Vérifiées</span>
                      <strong className="text-foreground">{number(verifiedListingsCount)}</strong>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[8px]">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" /> À traiter</span>
                      <strong className="text-foreground">{number(pending)}</strong>
                    </div>
                    {otherListingStatusesCount > 0 && (
                      <div className="flex items-center justify-between gap-2 text-[8px]">
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground"><i className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Autres statuts</span>
                        <strong className="text-foreground">{number(otherListingStatusesCount)}</strong>
                      </div>
                    )}
                  </div>
                  <a href="/admin/workspace#directory" className="mt-3 inline-flex h-7 w-full items-center justify-center rounded border border-border text-[8px] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground">Gérer les fiches →</a>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <section className="rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <PanelHeader title="Fiches par commune" />
            <div className="space-y-2 px-3 pb-3">
              {dashboardListings.length === 0 && <p className="py-4 text-center text-[9px] text-muted-foreground">Aucune donnée disponible.</p>}
              {[...new Set(dashboardListings.map((listing) => listing.commune).filter((commune): commune is string => Boolean(commune?.trim())))].slice(0, 6).map((commune, index) => {
                const count = dashboardListings.filter((listing) => listing.commune === commune).length;
                const percent = dashboardListings.length ? Math.round((count / dashboardListings.length) * 100) : 0;
                const communeColors = ["bg-sky-400", "bg-emerald-400", "bg-violet-400", "bg-amber-400", "bg-rose-400", "bg-cyan-400"];
                return <div key={commune} className="flex items-center gap-2 text-[8px]"><MapPin className="h-2.5 w-2.5 shrink-0 text-muted-foreground" /><span className="w-20 truncate text-muted-foreground">{commune}</span><strong className="w-5 text-right text-foreground">{count}</strong><span className="h-1 flex-1 overflow-hidden rounded bg-background"><i className={cn("block h-full rounded", communeColors[index % communeColors.length])} style={{ width: `${percent}%` }} /></span></div>;
              })}
            </div>
          </section>

          <section id="tasks" className="scroll-mt-16 rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <PanelHeader title="À traiter" subtitle={tasksLoading ? "Chargement…" : tasksError ? "Indisponible" : `${editorialTasks.length} tâche${editorialTasks.length === 1 ? "" : "s"} ouverte${editorialTasks.length === 1 ? "" : "s"}`} />
            <div className="divide-y divide-border px-3">
              {editorialTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2 py-2">
                  <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0", task.priority === "urgent" ? "bg-destructive" : task.priority === "high" ? "bg-amber-400" : "bg-primary")} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[9px] font-semibold text-foreground">{task.title}</p>
                    <p className="mt-0.5 text-[8px] text-muted-foreground">{task.status === "in_progress" ? "En cours" : "À commencer"} · {displayTaskDueDate(task.dueAt)}</p>
                  </div>
                </div>
              ))}
              {tasksLoading && editorialTasks.length === 0 && <p className="py-5 text-center text-[9px] text-muted-foreground">Chargement des tâches…</p>}
              {tasksError && editorialTasks.length === 0 && <p role="alert" className="py-5 text-center text-[9px] text-destructive">Impossible de charger les tâches éditoriales.</p>}
              {!tasksLoading && !tasksError && editorialTasks.length === 0 && <p className="py-5 text-center text-[9px] text-muted-foreground">Aucune tâche enregistrée.</p>}
            </div>
          </section>

          <section id="agenda" className="scroll-mt-16 rounded-md border border-border bg-card shadow-lg shadow-black/10">
            <PanelHeader
              title="Calendrier éditorial"
              action={<span className="flex gap-0.5"><button onClick={() => shiftMonth(-1)} aria-label="Mois précédent" className="rounded p-0.5 hover:bg-muted"><ChevronLeft className="h-3 w-3" /></button><button onClick={() => shiftMonth(1)} aria-label="Mois suivant" className="rounded p-0.5 hover:bg-muted"><ChevronRight className="h-3 w-3" /></button></span>}
            />
            <div className="px-3 pb-3">
              <p className="mb-1.5 text-center text-[9px] font-semibold capitalize">{calendarMonth.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</p>
              <div className="grid grid-cols-7 text-center">
                {["L", "M", "M", "J", "V", "S", "D"].map((day, index) => <span key={`${day}${index}`} className="pb-1 text-[8px] text-muted-foreground">{day}</span>)}
                {calendarCells.map((day, index) => {
                  const hasEvent = day !== null && calendarEventDateKeys.has(calendarDateKey(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                  return <span key={index} className="grid h-6 place-items-center">{day && <button onClick={() => setSelectedDay(day)} aria-pressed={selectedDay === day} aria-label={`${day} ${calendarMonth.toLocaleDateString("fr-FR", { month: "long" })}`} className={cn("relative grid h-5 w-5 place-items-center rounded-full text-[8px]", selectedDay === day ? "bg-primary font-bold text-primary-foreground" : "hover:bg-muted", hasEvent && selectedDay !== day && "font-bold text-primary")}>{day}{hasEvent && <i className={cn("absolute bottom-0.5 h-0.5 w-0.5 rounded-full", selectedDay === day ? "bg-primary-foreground" : "bg-primary")} />}</button>}</span>;
                })}
              </div>
              {selectedEvent && <p className="mt-1 flex items-center gap-1.5 truncate border-t border-border pt-2 text-[8px] text-muted-foreground"><i className={cn("h-1.5 w-1.5 shrink-0 rounded-full", selectedEvent.color)} />{formatCalendarEventTime(selectedEvent.startsAt)} · {selectedEvent.title}</p>}
              {calendarLoading && <p className="mt-1 border-t border-border pt-2 text-center text-[8px] text-muted-foreground">Chargement du calendrier éditorial…</p>}
              {calendarError && <p role="alert" className="mt-1 border-t border-border pt-2 text-center text-[8px] text-destructive">Impossible de charger le calendrier éditorial.</p>}
              {!calendarLoading && !calendarError && calendarEvents.length === 0 && <p className="mt-1 border-t border-border pt-2 text-center text-[8px] text-muted-foreground">Aucun élément éditorial ce mois-ci.</p>}
            </div>
          </section>

          <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-1">
            <section className="rounded-md border border-border bg-card shadow-lg shadow-black/10">
              <PanelHeader title="Disponibilité des services" />
              <div className="px-3 py-3 text-[9px] leading-relaxed text-muted-foreground">
                La supervision réelle n’est pas configurée. Consultez <a href="/admin/workspace#insights" className="font-semibold text-primary hover:underline">Qualité & suivi</a> pour connaître les intégrations manquantes.
              </div>
            </section>
            <section id="settings" className="scroll-mt-16 rounded-md border border-border bg-card shadow-lg shadow-black/10">
              <PanelHeader title="Accès rapide" />
              <div className="space-y-2 px-3 py-3">
                <a href="/admin/workspace#team" className="block border border-border px-3 py-2 text-[9px] font-semibold hover:bg-muted">Gérer les rôles d’équipe →</a>
                <a href="/admin/workspace#audit" className="block border border-border px-3 py-2 text-[9px] font-semibold hover:bg-muted">Consulter le journal d’audit →</a>
                <p className="text-[8px] leading-relaxed text-muted-foreground">Les préférences de compte seront activées après la connexion d’un service d’authentification.</p>
              </div>
            </section>
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2.5 text-[8px] text-muted-foreground">
          <span>© {new Date().getFullYear()} Lubumbashi Connect · Tableau de bord administrateur</span>
          <a href="/admin/workspace#insights" className="inline-flex items-center gap-1.5 hover:text-foreground"><i className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Supervision non configurée</a>
        </footer>
      </main>
      </div>
    </div>
  );
}

function SidebarGroup({
  title,
  collapsed,
  children,
}: {
  title: string;
  collapsed: boolean;
  children: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className={cn("mb-2 flex items-center justify-between px-2", collapsed && "lg:justify-center lg:px-0")}>
        <p className={cn("text-[8px] font-bold uppercase tracking-[0.14em] text-muted-foreground", collapsed && "lg:hidden")}>{title}</p>
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground", collapsed && "lg:hidden")} />
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SidebarLink({
  href,
  icon: Icon,
  label,
  badge,
  active = false,
  collapsed,
  onNavigate,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  badge?: string;
  active?: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex min-h-10 items-center gap-3 rounded-md px-2.5 text-[10px] transition-colors",
        collapsed && "lg:justify-center lg:px-0",
        active
          ? "bg-primary/12 font-semibold text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.8} />
      <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{label}</span>
      {badge && <span className={cn("rounded bg-muted px-1.5 py-0.5 text-[8px] tabular-nums text-muted-foreground", collapsed && "lg:hidden")}>{badge}</span>}
      {active && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary lg:hidden" />}
    </a>
  );
}

type StatColor = "teal" | "blue" | "gold" | "green" | "red" | "purple";

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  change,
  description,
  color,
  bars,
  progress,
  down = false,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  unit?: string;
  change: string;
  description: string;
  color: StatColor;
  bars?: number[];
  progress?: number;
  down?: boolean;
}) {
  const colors: Record<StatColor, { icon: string; accent: string; bar: string }> = {
    teal: { icon: "bg-teal-500/15 text-teal-400", accent: "text-teal-400", bar: "bg-teal-500" },
    blue: { icon: "bg-sky-500/15 text-sky-400", accent: "text-sky-400", bar: "bg-sky-500" },
    gold: { icon: "bg-amber-500/15 text-amber-400", accent: "text-amber-400", bar: "bg-amber-500" },
    green: { icon: "bg-emerald-500/15 text-emerald-400", accent: "text-emerald-400", bar: "bg-emerald-500" },
    red: { icon: "bg-rose-500/15 text-rose-400", accent: "text-rose-400", bar: "bg-rose-500" },
    purple: { icon: "bg-fuchsia-500/15 text-fuchsia-400", accent: "text-fuchsia-400", bar: "bg-fuchsia-500" },
  };
  const palette = colors[color];

  return (
    <article className="min-w-0 rounded-md border border-border bg-card px-4 py-3 shadow-lg shadow-black/10">
      <div className="flex items-center gap-3">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-md", palette.icon)}><Icon className="h-[18px] w-[18px]" strokeWidth={1.8} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="font-display text-[21px] font-bold leading-none tabular-nums">{value}{unit && <small className="ml-0.5 text-[10px] font-medium text-muted-foreground">{unit}</small>}</span>
            {change && <span className={cn("inline-flex items-center text-[8px] font-bold", down ? "text-rose-400" : palette.accent)}>{down ? <ArrowDownRight className="h-2.5 w-2.5" /> : <ArrowUpRight className="h-2.5 w-2.5" />}{change}</span>}
          </div>
          <p className="mt-1 truncate text-[9px] text-muted-foreground">{description}</p>
        </div>
        {bars && <div className="hidden h-8 w-[68px] shrink-0 items-end gap-[2px] sm:flex" aria-hidden="true">{bars.map((height, index) => <i key={index} className={cn("flex-1 rounded-t-[2px] opacity-70", palette.bar)} style={{ height: `${height}%` }} />)}</div>}
      </div>
      {progress !== undefined && <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-background"><i className={cn("block h-full rounded-full", palette.bar)} style={{ width: `${progress}%` }} /></div>}
    </article>
  );
}

function PanelHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[37px] items-center justify-between gap-2 border-b border-border px-3 py-2">
      <div className="min-w-0"><h2 className="truncate text-[10px] font-bold">{title}</h2>{subtitle && <p className="mt-0.5 text-[8px] text-muted-foreground">{subtitle}</p>}</div>
      {action}
    </div>
  );
}

function DeviceUsage({ period }: { period: string }) {
  const [metrics, setMetrics] = useState<DeviceMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const days = Number.parseInt(period, 10);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setHasError(false);
    setMetrics([]);

    fetchDeviceMetrics(days)
      .then((results) => {
        if (!active) return;
        const metricsByDevice = new Map<DeviceCategory, number>();
        results.forEach(({ device, sessions }) => metricsByDevice.set(device, sessions));
        setMetrics(DEVICE_CATEGORIES.map((device) => ({
          device,
          sessions: metricsByDevice.get(device) ?? 0,
        })));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load device metrics for the dashboard", error);
        void reportAdminError("dashboard.device_metrics.load", error);
        setHasError(true);
        setMetrics([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  const totalSessions = metrics.reduce((total, metric) => total + metric.sessions, 0);
  let position = 0;
  const gradient = metrics
    .filter(({ sessions }) => sessions > 0)
    .map(({ device, sessions }) => {
      const start = position;
      position += (sessions / totalSessions) * 100;
      return `${devicePresentation[device].color} ${start}% ${position}%`;
    })
    .join(", ");
  const chartGradient = totalSessions > 0 ? gradient : "var(--muted) 0% 100%";
  const formatter = new Intl.NumberFormat("fr-FR");

  return (
    <section className="rounded-md border border-border bg-card shadow-lg shadow-black/10">
      <PanelHeader title="Visites par appareil" subtitle={`${period} · sessions estimées`} />
      <div className="flex items-center justify-around gap-3 px-3 py-3">
        <div className="relative grid h-[94px] w-[94px] shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${chartGradient})` }}>
          <div className="grid h-[60px] w-[60px] place-content-center rounded-full bg-card text-center"><strong className="text-sm leading-tight">{loading ? "…" : hasError ? "—" : formatter.format(totalSessions)}</strong><span className="text-[7px] text-muted-foreground">sessions</span></div>
        </div>
        <div className="min-w-[90px] flex-1 space-y-1.5">
          {DEVICE_CATEGORIES.map((device) => {
            const sessions = metrics.find((metric) => metric.device === device)?.sessions ?? 0;
            const share = totalSessions ? Math.round((sessions / totalSessions) * 100) : 0;
            return (
              <div key={device} className="flex items-center gap-1.5 text-[8px]">
                <i className="h-1.5 w-1.5 rounded-[2px]" style={{ background: devicePresentation[device].color }} />
                <span className="flex-1 text-muted-foreground">{devicePresentation[device].label}</span>
                <strong className="text-foreground">{loading ? "…" : hasError ? "—" : totalSessions ? `${formatter.format(sessions)} · ${share}%` : "—"}</strong>
              </div>
            );
          })}
        </div>
      </div>
      {!loading && <p className="px-3 pb-3 text-center text-[8px] text-muted-foreground">
        {hasError
          ? "Statistiques temporairement indisponibles."
          : totalSessions
            ? "Répartition calculée à partir des sessions enregistrées."
            : "Aucune visite enregistrée sur cette période."}
      </p>}
    </section>
  );
}

function DirectoryCategoryChart({
  listings,
  loading,
  error,
}: {
  listings: DashboardListing[];
  loading: boolean;
  error: boolean;
}) {
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    listings.forEach(({ category }) => {
      const key = category || "uncategorized";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    });
    return [...counts.entries()]
      .map(([id, count]) => ({
        id,
        label: id === "uncategorized" ? "Non classées" : categoryLabel(id),
        shortLabel: id === "uncategorized"
          ? "Non classées"
          : ({
            commerces: "Commerces",
            restaurants: "Restaurants",
            transport: "Transport",
            sante: "Santé",
            droit: "Juridique",
            artisans: "Artisans",
            entreprises: "Entreprises",
            ecoles: "Éducation",
            associations: "Associations",
            hotels: "Hôtels",
            administrations: "Services publics",
            culture: "Culture",
            "anciens-eleves": "Étudiants",
          }[id] ?? categoryLabel(id).slice(0, 14)),
        count,
      }))
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "fr"))
      .slice(0, 5);
  }, [listings]);

  return (
    <section className="rounded-md border border-border bg-card shadow-lg shadow-black/10">
      <PanelHeader
        title="Fiches par catégorie"
        subtitle="Annuaire · nombre de fiches par catégorie"
      />
      {loading ? (
        <p className="px-3 py-8 text-center text-[9px] text-muted-foreground">Chargement des fiches…</p>
      ) : error ? (
        <p role="alert" className="px-3 py-8 text-center text-[9px] text-destructive">Impossible de charger les catégories.</p>
      ) : categoryCounts.length === 0 ? (
        <p className="px-3 py-8 text-center text-[9px] text-muted-foreground">Aucune fiche à représenter.</p>
      ) : (
        <div className="h-[220px] px-2 py-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={categoryCounts} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 5" vertical={false} />
              <XAxis
                dataKey="shortLabel"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                interval={0}
                tickMargin={6}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 8 }}
                tickCount={5}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.25 }}
                formatter={(value) => [`${number(Number(value))} fiche${Number(value) === 1 ? "" : "s"}`, "Annuaire"]}
                labelFormatter={(_, payload) => payload[0]?.payload?.label ?? ""}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 5, color: "var(--foreground)", fontSize: 9 }}
              />
              <Bar dataKey="count" name="Fiches" radius={[4, 4, 0, 0]} maxBarSize={34} isAnimationActive={false}>
                {categoryCounts.map((category, index) => (
                  <Cell key={category.id} fill={categoryChartColors[index % categoryChartColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
