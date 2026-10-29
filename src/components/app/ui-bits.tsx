import { Link, useLocation } from "@tanstack/react-router";
import { BadgeCheck, Briefcase, CalendarDays, ChevronRight, Crown, Grid2x2, Home, MapPin, Star, Store } from "lucide-react";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { categoryLabel, type Listing } from "@/data/listings";
import lubumbashiImage from "../../lubumbashi-evening.jpg";

type BadgeKind = "verifie" | "premium" | "nouveau" | "urgent" | "gratuit";

export function Pill({ kind, children }: { kind: BadgeKind; children?: ReactNode }) {
  const styles: Record<BadgeKind, string> = {
    verifie: "bg-success/12 text-success",
    premium: "bg-accent text-accent-foreground",
    nouveau: "bg-primary/12 text-primary",
    urgent: "bg-destructive text-destructive-foreground",
    gratuit: "bg-secondary/12 text-secondary dark:text-secondary-foreground",
  };
  const labels: Record<BadgeKind, string> = {
    verifie: "Vérifié",
    premium: "Premium",
    nouveau: "Nouveau",
    urgent: "Urgent",
    gratuit: "Gratuit",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", styles[kind])}>
      {kind === "verifie" && <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} />}
      {kind === "premium" && <Crown className="h-3 w-3" strokeWidth={2} />}
      {children ?? labels[kind]}
    </span>
  );
}

/** Illustration locale de Lubumbashi utilisée tant qu'aucune photo propre à la fiche n'existe. */
export function PhotoSlot({ label, className, imageUrl }: { label: string; className?: string; imageUrl?: string }) {
  return (
    <div
      role="img"
      aria-label={`Illustration de Lubumbashi pour ${label}`}
      className={cn("bg-cover bg-center", className)}
      style={{
        backgroundImage:
          `linear-gradient(0deg, rgb(0 0 0 / 55%), rgb(0 0 0 / 5%) 70%), url("${imageUrl ?? lubumbashiImage}")`,
      }}
    />
  );
}

export function ListingCard({ l }: { l: Listing }) {
  return (
    <Link
      to="/annuaire/$id"
      params={{ id: l.id }}
      className="fade-up group flex items-center gap-4 bg-card/90 p-3.5 focus-visible:outline-2 focus-visible:outline-ring"
    >
      <PhotoSlot label={l.name} imageUrl={l.imageUrl} className="h-24 w-24 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-bold">{l.name}</h3>
            {l.isExample && <span className="mt-1 inline-block border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">TEST — données fictives</span>}
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {l.subcategory} <span aria-hidden="true">·</span> {categoryLabel(l.category)}
            </p>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" /> {l.rating.toFixed(1)}
            <span className="font-normal text-muted-foreground">({l.reviewsCount})</span>
          </span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-border" />
          <span className="inline-flex min-w-0 items-center gap-1 truncate">
            <MapPin className="h-3.5 w-3.5 shrink-0" /> {l.quartier}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-semibold", l.openNow === true ? "text-success" : "text-muted-foreground")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", l.openNow === true ? "bg-success" : "bg-muted-foreground/60")} />
            {l.openNow === true ? "Ouvert" : l.openNow === false ? "Fermé" : "Horaires non renseignés"}
          </span>
          <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </div>
    </Link>
  );
}

type PublicListSkeletonKind = "listing" | "event" | "job";

export function PublicListSkeleton({ kind, count = 4, compact = false }: { kind: PublicListSkeletonKind; count?: number; compact?: boolean }) {
  const label = kind === "listing" ? "Chargement de l’annuaire…" : kind === "event" ? "Chargement de l’agenda…" : "Chargement des offres…";

  return (
    <div className="space-y-3" role="status" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={cn("flex items-center gap-3 bg-card/90 p-3", kind === "job" && "items-start p-4", compact && "p-3")}
        >
          <Skeleton
            className={cn(
              "shrink-0",
              kind === "listing"
                ? compact
                  ? "h-10 w-10"
                  : "h-24 w-24"
                : kind === "job" || compact
                  ? "h-10 w-10"
                  : "h-14 w-14",
            )}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-3/4" />
            {kind !== "listing" && <Skeleton className="h-3 w-1/2" />}
            <Skeleton className="h-3 w-2/3" />
            {kind === "job" && <Skeleton className="mt-3 h-3 w-full" />}
          </div>
        </div>
      ))}
    </div>
  );
}

const NAV = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/annuaire", label: "Annuaire", icon: Store },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/emplois", label: "Emplois", icon: Briefcase },
  { to: "/plus", label: "Plus", icon: Grid2x2 },
] as const;

export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2"
    >
      <ul className="glass-surface mx-auto grid max-w-md grid-cols-5 rounded-2xl p-1.5">
        {NAV.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to}>
              <Link
                to={to}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold transition-colors",
                  active ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                )}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto min-h-screen max-w-md overflow-x-clip bg-background pb-28 shadow-[0_0_80px_-55px_rgba(0,0,0,0.6)]">
      {children}
      <BottomNav />
    </div>
  );
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <AppShell>
      <div className="flex min-h-[75vh] flex-col justify-center px-6">
        <div className="glass-surface rounded-[2rem] p-7 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/15 text-primary">
            <Grid2x2 className="h-7 w-7" />
          </span>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Bientôt disponible</p>
          <h1 className="mt-2 text-2xl font-bold">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Cette rubrique arrive dans la prochaine étape de Lubumbashi Connect.
          </p>
          <Link to="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-95">
            Retour à l'accueil
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
