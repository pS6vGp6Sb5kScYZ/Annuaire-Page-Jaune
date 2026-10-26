import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, List, Map as MapIcon, MapPin, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, ListingCard, PublicListSkeleton } from "@/components/app/ui-bits";
import { CATEGORIES, COMMUNES, type Listing, type Payment } from "@/data/listings";
import { mapPublicListing } from "@/lib/public-content";
import { fetchPublicListings } from "@/lib/supabase-data";
import { cn } from "@/lib/utils";

type Search = { q?: string | undefined; commune?: string | undefined; cat?: string | undefined };

export const Route = createFileRoute("/annuaire/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s["q"] === "string" ? (s["q"] as string) : undefined,
    commune: typeof s["commune"] === "string" ? (s["commune"] as string) : undefined,
    cat: typeof s["cat"] === "string" ? (s["cat"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Annuaire de Lubumbashi — Lubumbashi Connect" },
      { name: "description", content: "Restaurants, santé, avocats, artisans, écoles… Explorez les adresses et services de Lubumbashi." },
      { property: "og:title", content: "Annuaire de Lubumbashi" },
      { property: "og:description", content: "Explorez les adresses et services de Lubumbashi." },
    ],
  }),
  component: Annuaire,
});

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const PAYMENTS: Payment[] = ["Cash", "Airtel Money", "M-Pesa", "Orange Money", "Carte"];
const LANGS = ["Français", "Swahili", "Lingala", "Anglais"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold transition duration-200",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-[0_5px_14px_-8px_var(--primary)]"
          : "border-border/80 bg-card/80 text-muted-foreground hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Annuaire() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annuaire/" });
  const q = search.q ?? "";
  const [openNow, setOpenNow] = useState(false);
  const [verified, setVerified] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [lang, setLang] = useState("");
  const [payment, setPayment] = useState("");
  const [view, setView] = useState<"liste" | "carte">("liste");
  const [showFilters, setShowFilters] = useState(false);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPublicListings()
      .then((rows) => {
        if (active) setListings(rows.map(mapPublicListing));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load published directory listings", error);
        setLoadError("Impossible de charger l’annuaire. Réessaie plus tard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const setParam = (patch: Search) => navigate({ search: (p) => ({ ...p, ...patch }), replace: true });

  const results = useMemo(() => {
    const nq = norm(q.trim());
    return listings.filter((l) => {
      if (nq && !norm(`${l.name} ${l.subcategory} ${l.description} ${l.quartier}`).includes(nq)) return false;
      if (search.cat && l.category !== search.cat) return false;
      if (search.commune && l.commune !== search.commune) return false;
      if (openNow && !l.openNow) return false;
      if (verified && !l.verified) return false;
      if (l.rating < minRating) return false;
      if (lang && !l.languages.includes(lang)) return false;
      if (payment && !l.payments.includes(payment as Payment)) return false;
      return true;
    }).sort((a, b) => Number(!!b.premium) - Number(!!a.premium));
  }, [listings, q, search.cat, search.commune, openNow, verified, minRating, lang, payment]);

  const activeCount = [q.trim(), search.cat, search.commune, openNow, verified, minRating, lang, payment].filter(Boolean).length;
  const activeFilters = [
    search.commune ? { label: search.commune, onClear: () => setParam({ commune: undefined }) } : null,
    openNow ? { label: "Ouvert", onClear: () => setOpenNow(false) } : null,
    verified ? { label: "Vérifié", onClear: () => setVerified(false) } : null,
    minRating ? { label: `${minRating}★ et plus`, onClear: () => setMinRating(0) } : null,
    lang ? { label: lang, onClear: () => setLang("") } : null,
    payment ? { label: payment, onClear: () => setPayment("") } : null,
  ].filter((filter): filter is { label: string; onClear: () => void } => filter !== null);
  const clearFilters = () => {
    setParam({ q: undefined, cat: undefined, commune: undefined });
    setOpenNow(false);
    setVerified(false);
    setMinRating(0);
    setLang("");
    setPayment("");
  };

  return (
    <AppShell>
      <header className="relative isolate overflow-hidden rounded-b-[2rem] border-b border-white/10 bg-forest px-5 pb-5 pt-4 text-secondary-foreground shadow-soft">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border border-primary/15" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button onClick={() => navigate({ to: "/" })} aria-label="Retour" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-secondary-foreground/10 transition hover:bg-secondary-foreground/15">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Lubumbashi Connect</p>
              <h1 className="mt-0.5 text-xl font-bold">Trouver une adresse</h1>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-semibold text-white/85">
            {listings.length} adresses
          </span>
        </div>
        <p className="relative mt-3 text-sm text-secondary-foreground/70">
          Explore les commerces et services près de toi.
        </p>
        <label className="relative mt-4 flex h-12 items-center gap-2 rounded-2xl border border-white/15 bg-background/95 px-4 text-card-foreground shadow-soft transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/30">
          <Search className="h-5 w-5 text-primary" />
          <input value={q} onChange={(e) => setParam({ q: e.target.value || undefined })} placeholder="Un service, un métier, un quartier…" aria-label="Rechercher dans l'annuaire"
            className="h-full w-full bg-transparent outline-none placeholder:text-muted-foreground" />
          {q && <button type="button" onClick={() => setParam({ q: undefined })} aria-label="Effacer la recherche" className="grid h-8 w-8 place-items-center rounded-full hover:bg-muted"><X className="h-4 w-4 text-muted-foreground" /></button>}
        </label>
      </header>
      <main>
        <section className="px-5 pt-5" aria-label="Catégories de l'annuaire">
          <div className="mb-2 flex items-end justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">Explorer</p>
              <h2 className="mt-0.5 text-base font-bold">Choisir une catégorie</h2>
            </div>
            {search.cat && (
              <button type="button" onClick={() => setParam({ cat: undefined })} className="text-xs font-semibold text-primary">
                Réinitialiser
              </button>
            )}
          </div>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <Chip active={!search.cat} onClick={() => setParam({ cat: undefined })}>Tout</Chip>
            {CATEGORIES.map((c) => (
              <Chip key={c.id} active={search.cat === c.id} onClick={() => setParam({ cat: search.cat === c.id ? undefined : c.id })}>
                {c.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="px-5 pt-4" aria-label="Filtres et affichage">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}
              className={cn("inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition", showFilters || activeCount > 0 ? "border-primary/50 bg-primary/10 text-primary" : "border-border bg-card shadow-sm hover:border-primary/50")}>
              <SlidersHorizontal className="h-4 w-4" /> Filtres{activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{activeCount}</span>}
            </button>
            <Chip active={openNow} onClick={() => setOpenNow((v) => !v)}>Ouvert</Chip>
            <div className="ml-auto flex rounded-full border border-border/70 bg-card p-1" role="tablist" aria-label="Affichage">
              {(["liste", "carte"] as const).map((v) => (
                <button key={v} role="tab" aria-selected={view === v} aria-label={`Vue ${v}`} onClick={() => setView(v)}
                  className={cn("grid h-8 w-9 place-items-center rounded-full transition", view === v ? "bg-primary text-primary-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
                  {v === "liste" ? <List className="h-4 w-4" /> : <MapIcon className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </div>

          {showFilters && (
            <div className="glass-surface fade-up mt-3 grid grid-cols-2 gap-2 rounded-2xl p-3">
              <select value={search.commune ?? ""} onChange={(e) => setParam({ commune: e.target.value || undefined })} aria-label="Commune" className="h-11 rounded-xl bg-muted px-3 text-sm">
                <option value="">Toutes communes</option>
                {COMMUNES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} aria-label="Note minimale" className="h-11 rounded-xl bg-muted px-3 text-sm">
                <option value={0}>Toutes notes</option>
                <option value={4}>4★ et plus</option>
                <option value={4.5}>4,5★ et plus</option>
              </select>
              <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Langue parlée" className="h-11 rounded-xl bg-muted px-3 text-sm">
                <option value="">Toutes langues</option>
                {LANGS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <select value={payment} onChange={(e) => setPayment(e.target.value)} aria-label="Moyen de paiement" className="h-11 rounded-xl bg-muted px-3 text-sm">
                <option value="">Tout paiement</option>
                {PAYMENTS.map((p) => <option key={p}>{p}</option>)}
              </select>
              <div className="col-span-2 flex items-center justify-between gap-3 border-t border-border/70 pt-2">
                <Chip active={verified} onClick={() => setVerified((value) => !value)}>Statut vérifié</Chip>
                <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary">
                  Tout effacer
                </button>
              </div>
            </div>
          )}
        </section>

        {activeFilters.length > 0 && (
          <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-3" aria-label="Filtres actifs">
            {activeFilters.map((filter) => (
              <button
                key={filter.label}
                type="button"
                onClick={filter.onClear}
                className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-3 text-xs font-medium text-primary"
              >
                {filter.label}<X className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        )}

        <section className="px-5 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              <span className="font-display text-2xl font-bold text-foreground">{results.length}</span>{" "}
              résultat{results.length > 1 ? "s" : ""}
            </p>
          </div>
          {activeCount > 0 && (
            <button type="button" onClick={clearFilters} className="rounded-full px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10">
              Tout effacer
            </button>
          )}
        </div>
        {loadError && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</p>}
        {loading ? (
          <PublicListSkeleton kind="listing" />
        ) : results.length === 0 ? (
          <div className="bg-card p-8 text-center">
            <Search className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 font-semibold">Aucune adresse publiée</p>
            <p className="mt-1 text-sm text-muted-foreground">Les adresses s’afficheront ici dès que des données réelles seront ajoutées.</p>
            <button type="button" onClick={clearFilters} className="mt-4 min-h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground">
              Effacer la recherche et les filtres
            </button>
          </div>
        ) : view === "liste" ? (
          <div className="space-y-3">{results.map((l) => <ListingCard key={l.id} l={l} />)}</div>
        ) : (
          <div className="relative h-[60vh] overflow-hidden bg-sand"
            style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "32px 32px" }}>
            {results.map((l, i) => (
              <button key={l.id} onClick={() => navigate({ to: "/annuaire/$id", params: { id: l.id } })}
                className="absolute -translate-x-1/2 -translate-y-full" aria-label={l.name}
                style={{ left: `${15 + ((i * 37) % 70)}%`, top: `${20 + ((i * 23) % 65)}%` }}>
                <span className="flex items-center gap-1 rounded-full bg-card px-2 py-1 text-xs font-semibold shadow-soft">
                  <MapPin className="h-4 w-4 text-primary" /> {l.name.split(" ").slice(0, 2).join(" ")}
                </span>
              </button>
            ))}
          </div>
        )}
        </section>
      </main>
    </AppShell>
  );
}
