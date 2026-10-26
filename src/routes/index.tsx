import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight, Briefcase, Bus, CalendarDays, ChevronRight, Cross, GraduationCap, Hammer,
  Hotel, MapPin, Moon, Palette, Scale, Search, Sun, Tag, Utensils,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, PublicListSkeleton } from "@/components/app/ui-bits";
import type { Listing } from "@/data/listings";
import { categoryColors } from "@/lib/category-colors";
import { mapPublicEvent, mapPublicListing } from "@/lib/public-content";
import { fetchFeaturedPublicEvents, fetchFeaturedPublicListings } from "@/lib/supabase-data";
import lubumbashiImage from "../lubumbashi-evening.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lubumbashi Connect — Tout Lubumbashi, au même endroit" },
      { name: "description", content: "Trouvez un service, une sortie, un emploi ou une info utile à Lubumbashi avec Lubumbashi Connect." },
      { property: "og:title", content: "Lubumbashi Connect" },
      { property: "og:description", content: "Explorez l'annuaire, l'agenda, les emplois et les infos pratiques de Lubumbashi." },
    ],
  }),
  component: Index,
});

const SHORTCUTS = [
  { label: "Restaurants", icon: Utensils, cat: "restaurants" },
  { label: "Santé", icon: Cross, cat: "sante" },
  { label: "Transport", icon: Bus, cat: "transport" },
  { label: "Droit", icon: Scale, cat: "droit" },
  { label: "Artisans", icon: Hammer, cat: "artisans" },
  { label: "Écoles", icon: GraduationCap, cat: "ecoles" },
  { label: "Commerces", icon: Tag, cat: "commerces" },
  { label: "Hôtels", icon: Hotel, cat: "hotels" },
  { label: "Culture", icon: Palette, cat: "culture" },
] as const;

const CITY_GUIDE = [
  {
    title: "Agenda",
    description: "Événements et sorties",
    icon: CalendarDays,
    to: "/agenda",
    tone: "bg-primary/15 text-primary",
  },
  {
    title: "Emplois",
    description: "Offres et candidatures",
    icon: Briefcase,
    to: "/emplois",
    tone: "bg-sky-500/15 text-sky-400",
  },
  {
    title: "Infos pratiques",
    description: "Transports et services",
    icon: Bus,
    to: "/plus",
    tone: "bg-emerald-500/15 text-emerald-400",
  },
] as const;

function ThemeToggle() {
  const [dark, setDark] = useState(true);
  return (
    <button
      aria-label={dark ? "Activer le mode clair" : "Activer le mode sombre"}
      onClick={() => {
        document.documentElement.classList.toggle("dark");
        setDark((d) => !d);
      }}
      className="grid h-10 w-10 place-items-center rounded-full bg-secondary-foreground/10"
    >
      {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function Section({ title, link, children }: { title: string; link?: { to: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="mt-9 px-5">
      <div className="mb-3 flex items-end justify-between">
        <h2 className="relative pl-3 text-lg font-bold before:absolute before:bottom-1 before:left-0 before:top-1 before:w-1 before:rounded-full before:bg-primary">
          {title}
        </h2>
        {link && (
          <Link to={link.to} className="flex items-center text-sm font-semibold text-primary">
            {link.label} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Index() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [featuredListings, setFeaturedListings] = useState<Listing[]>([]);
  const [featuredEvents, setFeaturedEvents] = useState<ReturnType<typeof mapPublicEvent>[]>([]);
  const [listingsLoading, setListingsLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [contentError, setContentError] = useState("");

  useEffect(() => {
    let active = true;
    fetchFeaturedPublicListings()
      .then((rows) => {
        if (active) setFeaturedListings(rows.map(mapPublicListing));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load featured listings", error);
        setContentError("Certain contenus n’ont pas pu être chargés. Réessaie plus tard.");
      })
      .finally(() => {
        if (active) setListingsLoading(false);
      });
    fetchFeaturedPublicEvents()
      .then((rows) => {
        if (active) setFeaturedEvents(rows.map(mapPublicEvent));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load featured events", error);
        setContentError("Certain contenus n’ont pas pu être chargés. Réessaie plus tard.");
      })
      .finally(() => {
        if (active) setEventsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <AppShell>
      {/* En-tête */}
      <header
        className="relative isolate overflow-hidden rounded-b-[2rem] border-b border-white/10 bg-forest px-5 pb-7 pt-5 text-secondary-foreground shadow-soft"
        style={{
          backgroundImage:
            `linear-gradient(180deg, rgb(8 9 11 / 72%), rgb(8 9 11 / 58%) 55%, rgb(8 9 11 / 90%)), url("${lubumbashiImage}")`,
          backgroundPosition: "center 58%",
          backgroundSize: "cover",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="font-display text-lg font-bold leading-tight">
              Lubumbashi<br /><span className="text-accent">Connect</span>
            </p>
          </div>
          <ThemeToggle />
        </div>

        <p className="mt-6 max-w-[17rem] font-display text-base font-semibold leading-relaxed text-white">
          Votre ville, vos découvertes,<br />
          <span className="text-accent">vos bonnes adresses.</span>
        </p>
        <p className="mt-2 flex items-center gap-1.5 text-xs text-white/75">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          Lubumbashi · Haut-Katanga
        </p>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            navigate({ to: "/annuaire", search: { q: q || undefined } });
          }}
        >
          <div className="flex h-12 items-center gap-3 rounded-xl border border-white/15 bg-background/95 px-4 text-card-foreground shadow-soft transition focus-within:ring-2 focus-within:ring-primary">
            <Search className="h-5 w-5 shrink-0 text-primary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Une adresse, un service…"
              aria-label="Rechercher"
              className="h-full w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              aria-label="Lancer la recherche"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-95"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </form>
        <Link
          to="/annuaire"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-white/90 transition hover:text-accent"
        >
          Parcourir tout l’annuaire <ChevronRight className="h-4 w-4" />
        </Link>
      </header>

      <Section title="Explorer par catégorie" link={{ to: "/annuaire", label: "Tout voir" }}>
        <div className="grid grid-cols-3 gap-3">
          {SHORTCUTS.map((item) => {
            const Icon = item.icon;
            const colors = categoryColors(item.cat);
            return (
              <Link
                key={item.label}
                to="/annuaire"
                search={{ cat: item.cat }}
                className={`interactive-card group flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center ${colors.tile}`}
              >
                <span className={`grid h-11 w-11 place-items-center rounded-xl transition ${colors.icon}`}>
                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="text-xs font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </Section>

      <Section title="Aujourd'hui à Lubumbashi" link={{ to: "/agenda", label: "Tout voir" }}>
        {eventsLoading ? (
          <PublicListSkeleton kind="event" count={2} compact />
        ) : featuredEvents.length ? (
          <div className="space-y-2">
            {featuredEvents.map((event) => (
              <Link key={event.id} to="/agenda" className="flex items-center gap-3 bg-card/90 p-3">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${event.tone}`}>
                  <CalendarDays className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{event.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{event.dateLabel} · {event.location}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-primary" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun événement publié pour le moment.
          </p>
        )}
      </Section>

      {contentError && <p role="alert" className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{contentError}</p>}

      <Section title="Adresses à découvrir" link={{ to: "/annuaire", label: "Tout voir" }}>
        {listingsLoading ? (
          <PublicListSkeleton kind="listing" count={2} compact />
        ) : featuredListings.length ? (
          <div className="space-y-2">
            {featuredListings.map((listing) => (
              <Link
                key={listing.id}
                to="/annuaire/$id"
                params={{ id: listing.id }}
                className="flex items-center gap-3 bg-card/90 p-3"
              >
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg text-sm font-bold ${categoryColors(listing.category).icon}`}>
                  {listing.name.split(" ").slice(0, 2).map((part) => part[0]).join("")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{listing.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{listing.subcategory} · {listing.quartier}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-primary" />
              </Link>
            ))}
          </div>
        ) : (
          <p className="bg-card p-6 text-center text-sm text-muted-foreground">
            Aucune adresse publiée pour le moment.
          </p>
        )}
      </Section>

      <Section title="Le guide de la ville">
        <div className="space-y-2">
          {CITY_GUIDE.map(({ title, description, icon: Icon, to, tone }) => (
            <Link
              key={title}
              to={to}
              className="flex items-center gap-3 bg-card/90 p-3"
            >
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-primary" />
            </Link>
          ))}
        </div>
      </Section>

      {/* Pied de page */}
      <footer className="mt-10 border-t border-border/70 bg-card/30 px-5 pb-6 pt-6 text-sm text-muted-foreground">
        <p className="font-display font-bold text-foreground">Lubumbashi Connect</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {["Liens utiles", "Contact", "Mentions légales", "Confidentialité", "Facebook", "WhatsApp"].map((x) => (
            <a key={x} href="#" className="py-1">{x}</a>
          ))}
        </div>
        <p className="mt-4 text-xs">© {new Date().getFullYear()} Lubumbashi Connect</p>
      </footer>
    </AppShell>
  );
}
