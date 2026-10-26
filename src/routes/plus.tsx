import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  BusFront,
  ChevronRight,
  CircleHelp,
  ExternalLink,
  HeartPulse,
  Landmark,
  MapPin,
  Radio,
  Search,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/app/ui-bits";

const PRACTICAL_LINKS = [
  {
    title: "Se déplacer",
    description: "Repérer les points de transport et préparer un itinéraire.",
    label: "Explorer la carte",
    href: "https://www.google.com/maps/search/?api=1&query=transport+Lubumbashi",
    icon: BusFront,
    tone: "bg-primary/15 text-primary",
  },
  {
    title: "Services publics",
    description: "Rechercher une administration ou un service près de vous.",
    label: "Trouver un service",
    href: "https://www.google.com/maps/search/?api=1&query=administration+publique+Lubumbashi",
    icon: Landmark,
    tone: "bg-sky-500/15 text-sky-400",
  },
  {
    title: "Santé & pharmacies",
    description: "Consulter les établissements de santé de l'annuaire.",
    label: "Voir l'annuaire santé",
    to: "/annuaire",
    search: { cat: "sante" },
    icon: HeartPulse,
    tone: "bg-emerald-500/15 text-emerald-400",
  },
  {
    title: "Eau & électricité",
    description: "Retrouver les contacts et informations utiles quand ils sont confirmés.",
    label: "Rechercher sur la carte",
    href: "https://www.google.com/maps/search/?api=1&query=services+eau+electricite+Lubumbashi",
    icon: Zap,
    tone: "bg-amber-500/15 text-amber-400",
  },
] as const;

export const Route = createFileRoute("/plus")({
  head: () => ({
    meta: [
      { title: "Infos pratiques — Lubumbashi Connect" },
      {
        name: "description",
        content: "Accédez aux informations pratiques, transports, services publics et santé à Lubumbashi.",
      },
      { property: "og:title", content: "Infos pratiques — Lubumbashi Connect" },
      {
        property: "og:description",
        content: "Les repères utiles pour se déplacer et trouver un service à Lubumbashi.",
      },
    ],
  }),
  component: Plus,
});

function Plus() {
  return (
    <AppShell>
      <header className="relative isolate overflow-hidden rounded-b-[2rem] border-b border-white/10 bg-forest px-5 pb-7 pt-6 text-secondary-foreground shadow-soft">
        <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full border border-primary/20" />
        <div className="pointer-events-none absolute -right-2 -top-6 h-32 w-32 rounded-full border border-primary/10" />
        <div className="relative">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]">
            <MapPin className="h-6 w-6" />
          </span>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Les bons repères
          </p>
          <h1 className="mt-1 font-display text-3xl font-bold">Infos pratiques</h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-secondary-foreground/75">
            Les services utiles pour mieux vivre et se déplacer à Lubumbashi.
          </p>
        </div>
      </header>

      <main className="px-5 pt-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">À portée de main</p>
            <h2 className="mt-1 text-xl font-bold">Explorer les services</h2>
          </div>
          <span className="mb-0.5 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <ArrowUpRight className="h-5 w-5" />
          </span>
        </div>

        <div className="grid gap-3">
          {PRACTICAL_LINKS.map((item) => {
            const Icon = item.icon;
            const content = (
              <>
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${item.tone}`}>
                  <Icon className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{item.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    {item.label}
                    {"href" in item ? (
                      <ExternalLink className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                </span>
              </>
            );

            return "href" in item ? (
              <a
                key={item.title}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="interactive-card flex items-start gap-3 bg-card/90 p-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {content}
              </a>
            ) : (
              <Link
                key={item.title}
                to={item.to}
                search={item.search}
                className="interactive-card flex items-start gap-3 bg-card/90 p-4 focus-visible:outline-2 focus-visible:outline-ring"
              >
                {content}
              </Link>
            );
          })}
        </div>

        <aside className="mt-5 bg-primary/8 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
              <Radio className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Infos locales vérifiées</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Les horaires, contacts et avis de service seront publiés ici après vérification de leur source.
                Pour l'instant, utilisez les liens de recherche et confirmez les détails avant de vous déplacer.
              </p>
            </div>
          </div>
        </aside>

        <Link
          to="/annuaire"
          className="mt-4 flex items-center gap-3 bg-card/60 p-4 transition"
        >
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Search className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Vous cherchez autre chose ?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Parcourir tout l'annuaire</span>
          </span>
          <ChevronRight className="h-5 w-5 text-primary" />
        </Link>

        <div className="mb-4 mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <CircleHelp className="h-3.5 w-3.5" />
          <span>Les recherches externes s'ouvrent dans un nouvel onglet.</span>
        </div>
      </main>
    </AppShell>
  );
}
