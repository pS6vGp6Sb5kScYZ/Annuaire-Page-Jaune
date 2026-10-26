import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import {
  ArrowLeft, Clock, Flag, Globe, Heart, Mail, MapPin, Phone, Share2, Star, Wallet,
} from "lucide-react";
import { AppShell, PhotoSlot } from "@/components/app/ui-bits";
import { Skeleton } from "@/components/ui/skeleton";
import { categoryLabel } from "@/data/listings";
import { mapPublicListing, mapPublicListingReview } from "@/lib/public-content";
import { fetchPublicListing, fetchPublicListingReviews } from "@/lib/supabase-data";
import phoneIcon from "../phone-solid-full.svg";
import routeIcon from "../route-solid-full.svg";
import whatsappIcon from "../whatsapp-brands-solid-full.svg";

export const Route = createFileRoute("/annuaire/$id")({
  loader: async ({ params }) => {
    const [row, reviewRows] = await Promise.all([
      fetchPublicListing(params.id),
      fetchPublicListingReviews(params.id),
    ]);
    if (!row) throw notFound();
    const listing = mapPublicListing(row);
    listing.reviews = reviewRows.map(mapPublicListingReview);
    return { listing };
  },
  pendingMs: 250,
  pendingComponent: () => (
    <AppShell>
      <div className="space-y-5" role="status" aria-label="Chargement de la fiche…">
        <span className="sr-only">Chargement de la fiche…</span>
        <Skeleton aria-hidden="true" className="h-64 w-full rounded-none" />
        <div className="space-y-3 px-5">
          <Skeleton aria-hidden="true" className="h-7 w-3/4 rounded-none" />
          <Skeleton aria-hidden="true" className="h-4 w-1/2 rounded-none" />
          <Skeleton aria-hidden="true" className="h-20 w-full rounded-none" />
          <Skeleton aria-hidden="true" className="h-32 w-full rounded-none" />
        </div>
      </div>
    </AppShell>
  ),
  head: ({ loaderData }) => {
    const l = loaderData?.listing;
    if (!l) return { meta: [{ title: "Fiche introuvable — Lubumbashi Connect" }, { name: "robots", content: "noindex" }] };
    const title = `${l.name} — ${l.subcategory} à ${l.commune} | Lubumbashi Connect`;
    return {
      meta: [
        { title },
        { name: "description", content: l.description },
        { property: "og:title", content: title },
        { property: "og:description", content: l.description },
      ],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            name: l.name,
            telephone: l.phone,
            address: { "@type": "PostalAddress", streetAddress: l.address, addressLocality: "Lubumbashi", addressCountry: "CD" },
            ...(l.gps ? { geo: { "@type": "GeoCoordinates", latitude: l.gps.lat, longitude: l.gps.lng } } : {}),
            ...(l.reviewsCount > 0 ? {
              aggregateRating: { "@type": "AggregateRating", ratingValue: l.rating, reviewCount: l.reviewsCount },
            } : {}),
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="px-5 pt-16 text-center">
        <h1 className="text-xl font-bold">Fiche introuvable</h1>
        <Link to="/annuaire" className="mt-4 inline-block font-semibold text-primary">Retour à l'annuaire</Link>
      </div>
    </AppShell>
  ),
  component: Fiche,
});

function Row({ icon: Icon, children }: { icon: typeof Phone; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.6} />
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

function Fiche() {
  const { listing: l } = Route.useLoaderData();
  const router = useRouter();
  const maps = l.gps
    ? `https://www.google.com/maps/search/?api=1&query=${l.gps.lat},${l.gps.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.address} ${l.commune}`)}`;
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) await navigator.share({ title: l.name, url }).catch(() => {});
    else window.open(`https://wa.me/?text=${encodeURIComponent(`${l.name} — ${url}`)}`, "_blank");
  };

  return (
    <AppShell>
      <div className="relative">
        <PhotoSlot label={l.name} className="h-64 border-b border-border/50" />
        <div className="absolute inset-x-0 top-0 flex justify-between p-4">
          <button onClick={() => router.history.back()} aria-label="Retour" className="glass-surface grid h-11 w-11 place-items-center rounded-full text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex gap-2">
            <button onClick={share} aria-label="Partager" className="glass-surface grid h-11 w-11 place-items-center rounded-full text-foreground"><Share2 className="h-5 w-5" /></button>
            <button aria-label="Ajouter aux favoris" className="glass-surface grid h-11 w-11 place-items-center rounded-full text-foreground"><Heart className="h-5 w-5" /></button>
          </div>
        </div>
        <div className="absolute bottom-10 left-4 flex gap-2">
          {[1, 2, 3].map((i) => <PhotoSlot key={i} label={`${l.name} ${i}`} className="h-12 w-12 rounded-lg border-2 border-card p-0 [&>span]:hidden" />)}
        </div>
      </div>

      <div className="relative -mt-7 rounded-t-[2rem] border-t border-border/60 bg-background px-5 pt-7">
        <h1 className="text-2xl font-bold leading-tight">{l.name}</h1>
        {l.isExample && <p className="mt-2 border border-amber-500/50 bg-amber-500/10 p-2 text-xs font-semibold text-amber-200">FICHE DE TEST — informations entièrement fictives, ne pas utiliser pour se rendre sur place.</p>}
        <p className="text-sm text-muted-foreground">{l.subcategory} · {categoryLabel(l.category)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {l.reviewsCount > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1 font-bold text-foreground"><Star className="h-3.5 w-3.5 fill-primary text-primary" />{l.rating.toFixed(1)}</span>}
          <span className="rounded-full bg-muted px-2.5 py-1 text-muted-foreground">{l.reviewsCount} avis</span>
          <span className={l.openNow === true ? "rounded-full bg-success/15 px-2.5 py-1 font-semibold text-success" : l.openNow === false ? "rounded-full bg-destructive/10 px-2.5 py-1 font-semibold text-destructive" : "rounded-full bg-muted px-2.5 py-1 font-semibold text-muted-foreground"}>{l.openNow === true ? "Ouvert maintenant" : l.openNow === false ? "Fermé" : "Horaires non renseignés"}</span>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{l.description}</p>
        {l.source === "openstreetmap" && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Données © contributeurs{" "}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="font-semibold text-primary underline">
              OpenStreetMap
            </a>{" "}
            (ODbL).
          </p>
        )}

        <section className="mt-5 divide-y divide-border/70 rounded-2xl border border-border/70 bg-card/85 px-4 shadow-soft">
          <Row icon={MapPin}>
            <p className="font-medium">{l.address}</p>
            <p className="text-muted-foreground">{l.quartier}, commune {l.commune}</p>
            <a href={maps} target="_blank" rel="noreferrer" className="mt-1 inline-block font-semibold text-primary">Voir sur Google Maps</a>
          </Row>
          {l.phone && <Row icon={Phone}><a href={`tel:${l.phone.replace(/\s/g, "")}`} className="font-medium">{l.phone}</a></Row>}
          {l.email && <Row icon={Mail}><a href={`mailto:${l.email}`}>{l.email}</a></Row>}
          {l.website && <Row icon={Globe}><a href={l.website}>Site web</a></Row>}
          <Row icon={Wallet}>
            <div className="flex flex-wrap gap-1.5">
              {l.payments.map((p) => <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{p}</span>)}
            </div>
          </Row>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Clock className="h-5 w-5 text-primary" /> Horaires</h2>
          <ul className="divide-y divide-border/60 rounded-2xl border border-border/70 bg-card/85 px-4 py-2 text-sm shadow-soft">
            {l.hours.length === 0 && <li className="py-2.5 text-muted-foreground">Horaires non renseignés</li>}
            {l.hours.map((h) => (
              <li key={h.day} className="flex justify-between py-2.5">
                <span>{h.day}</span>
                <span className={h.open ? "font-medium" : "text-muted-foreground"}>{h.open ?? "Fermé"}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Services et prix indicatifs</h2>
          <ul className="divide-y divide-border/70 rounded-2xl border border-border/70 bg-card/85 px-4 shadow-soft">
            {l.services.map((s) => (
              <li key={s.name} className="flex justify-between gap-3 py-3 text-sm">
                <span>{s.name}</span><span className="shrink-0 font-semibold text-primary">{s.price}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h2 className="mb-2 text-lg font-bold">Emplacement</h2>
          <a href={maps} target="_blank" rel="noreferrer" className="relative block h-40 overflow-hidden rounded-2xl bg-sand"
            style={{ backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)", backgroundSize: "28px 28px" }}>
            {l.gps && <MapPin className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-full fill-primary text-primary-foreground" />}
            <span className="absolute bottom-3 left-3 rounded-full bg-card px-3 py-1 text-xs font-semibold shadow-soft">Ouvrir l'itinéraire</span>
          </a>
        </section>

        <section className="mt-6">
          <div className="mb-2 flex items-end justify-between">
            <h2 className="text-lg font-bold">Avis</h2>
            <button className="text-sm font-semibold text-primary">Donner mon avis</button>
          </div>
          {l.reviews.length === 0 ? (
            <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground shadow-soft">Pas encore d'avis. Soyez le premier !</p>
          ) : (
            <div className="space-y-3">
              {l.reviews.map((r) => (
                <article key={r.author} className="rounded-2xl border border-border/70 bg-card/85 p-4 shadow-soft">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{r.author}</span>
                    <span className="text-xs text-muted-foreground">{r.date}</span>
                  </div>
                  <div className="mt-1 flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-accent text-accent" : "text-border"}`} />)}</div>
                  <p className="mt-2 text-sm">{r.text}</p>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="mt-6 flex gap-2 pb-28">
          <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium"><Flag className="h-4 w-4" /> Signaler une erreur</button>
          <button className="h-11 flex-1 rounded-xl border border-border text-sm font-medium">C'est ma fiche</button>
        </div>
      </div>

      {/* Actions toujours visibles */}
      <div className="fixed inset-x-0 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-md px-4">
        <div className="mx-auto flex w-fit items-center gap-5 rounded-full border border-border bg-card/95 px-5 py-3 shadow-soft backdrop-blur">
          {l.phone && (
            <a
              href={`tel:${l.phone.replace(/\s/g, "")}`}
              aria-label="Appeler"
              title="Appeler"
              className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <img src={phoneIcon} alt="" aria-hidden="true" className="h-5 w-5" />
            </a>
          )}
          {l.whatsapp && (
            <a
              href={`https://wa.me/${l.whatsapp}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Ouvrir WhatsApp"
              title="WhatsApp"
              className="grid h-11 w-11 place-items-center rounded-full bg-success text-success-foreground transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <img src={whatsappIcon} alt="" aria-hidden="true" className="h-5 w-5 brightness-0 invert" />
            </a>
          )}
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            aria-label="Ouvrir l'itinéraire"
            title="Itinéraire"
            className="grid h-11 w-11 place-items-center rounded-full bg-secondary text-secondary-foreground transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
          >
            <img src={routeIcon} alt="" aria-hidden="true" className="h-5 w-5 brightness-0 invert" />
          </a>
        </div>
      </div>
    </AppShell>
  );
}
