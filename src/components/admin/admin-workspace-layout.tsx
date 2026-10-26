import type { ReactNode } from "react";
import {
  BriefcaseBusiness,
  CalendarDays,
  LayoutDashboard,
  Store,
  Users,
} from "lucide-react";

const sections = [
  { id: "directory", label: "Annuaire", icon: Store },
  { id: "events", label: "Agenda public", icon: CalendarDays },
  { id: "jobs", label: "Offres d’emploi", icon: BriefcaseBusiness },
  { id: "users", label: "Utilisateurs", icon: Users },
];

export function AdminWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-dashboard min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[250px] flex-col border-r border-border bg-card md:flex">
        <a href="/admin" className="flex h-16 items-center gap-3 border-b border-border px-5">
          <span className="grid h-9 w-9 place-items-center bg-primary font-display text-lg font-black text-primary-foreground">L</span>
          <span>
            <strong className="block text-sm">Lubumbashi Connect</strong>
            <span className="text-xs text-muted-foreground">Espace administration</span>
          </span>
        </a>
        <nav aria-label="Navigation de gestion" className="flex-1 space-y-1 overflow-y-auto p-3">
          <a href="/admin" className="mb-4 flex min-h-10 items-center gap-3 px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            <LayoutDashboard className="h-4 w-4" /> Vue d’ensemble
          </a>
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`} className="flex min-h-10 items-center gap-3 px-3 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground">
              <Icon className="h-4 w-4" /> {label}
            </a>
          ))}
        </nav>
        <div className="border-t border-border p-4 text-xs leading-relaxed text-muted-foreground">
          Accès réservé aux administrateurs Supabase. Les politiques RLS protègent aussi les données en base.
        </div>
      </aside>

      <div className="md:pl-[250px]">
        <header className="sticky top-0 z-20 border-b border-border bg-card/95 px-4 py-3 backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Administration locale</p>
              <h1 className="font-display text-lg font-bold">Gestion & pilotage</h1>
            </div>
            <a href="/admin" className="border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Dashboard</a>
          </div>
          <nav aria-label="Sections de gestion" className="no-scrollbar mt-3 flex gap-2 overflow-x-auto md:hidden">
            {sections.map(({ id, label }) => (
              <a key={id} href={`#${id}`} className="shrink-0 border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">{label}</a>
            ))}
            <a href="#jobs" className="shrink-0 border border-border px-3 py-2 text-xs text-muted-foreground">Offres</a>
          </nav>
        </header>
        <main className="mx-auto max-w-[1400px] space-y-8 px-4 py-6 sm:px-6 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
