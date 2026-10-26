import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, Building2, CalendarDays, Clock3, ExternalLink, MapPin, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PublicListSkeleton } from "@/components/app/ui-bits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fetchPublicJobs } from "@/lib/supabase-data";
import { mapPublicJob, type PublicJob } from "@/lib/public-content";

export const Route = createFileRoute("/emplois")({
  head: () => ({
    meta: [
      { title: "Offres d'emploi à Lubumbashi — Lubumbashi Connect" },
      {
        name: "description",
        content: "Consultez les offres d'emploi publiées au Katanga et accédez au portail officiel de candidature.",
      },
      { property: "og:title", content: "Offres d'emploi à Lubumbashi — Lubumbashi Connect" },
      {
        property: "og:description",
        content: "Offres d'emploi au Katanga et liens vers les portails officiels de candidature.",
      },
    ],
  }),
  component: Emplois,
});

function Emplois() {
  const [query, setQuery] = useState("");
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<PublicJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPublicJobs()
      .then((rows) => {
        if (active) setJobs(rows.map(mapPublicJob));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load published jobs", error);
        setLoadError("Impossible de charger les offres. Réessaie plus tard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    return jobs.filter(
      (job) =>
        !normalizedQuery ||
        `${job.title} ${job.organization} ${job.location} ${job.contractType}`
          .toLocaleLowerCase("fr")
          .includes(normalizedQuery),
    );
  }, [jobs, query]);

  return (
    <AppShell>
      <header className="relative isolate overflow-hidden rounded-b-[2rem] border-b border-white/10 bg-forest px-5 pb-6 pt-6 text-secondary-foreground shadow-soft">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-primary/20" />
        <div className="pointer-events-none absolute -right-3 -top-7 h-32 w-32 rounded-full border border-primary/10" />
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]">
            <BriefcaseBusiness className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Carrières</p>
            <h1 className="font-display text-2xl font-bold">Offres d'emploi</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-secondary-foreground/80">
          Consultez les opportunités d'emploi publiées au Katanga.
        </p>
        <label className="mt-4 flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-background px-4 text-foreground transition focus-within:ring-2 focus-within:ring-primary">
          <Search className="h-5 w-5 shrink-0 text-primary" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher un poste ou une référence…"
            aria-label="Rechercher une offre d'emploi"
            className="h-full w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      <main className="px-5 pt-5">
        {loadError && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</p>}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Offres disponibles</h2>
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-semibold text-primary">
            {filteredJobs.length} offre{filteredJobs.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <PublicListSkeleton kind="job" />
        ) : <div className="space-y-3">
          {filteredJobs.map((job) => (
            <button
              type="button"
              key={job.id}
              onClick={() => setSelectedJob(job)}
              aria-label={`Voir les détails de l’offre ${job.title}`}
              className="interactive-card group w-full bg-card/90 p-4 text-left"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <BriefcaseBusiness className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">{job.title}</span>
                  {job.isExample && <span className="mt-1 inline-block border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">TEST — offre fictive</span>}
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-primary" /> {job.location || "Katanga, RDC"}
                    </span>
                    <span>{job.organization}</span>
                    {job.contractType && <span>{job.contractType}</span>}
                  </span>
                </span>
              </div>
              <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                {job.description || "Consultez les détails de cette opportunité et les modalités de candidature."}
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                Voir la description complète <ExternalLink className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}
          {filteredJobs.length === 0 && (
            <div className="bg-card p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 font-semibold">
                {jobs.length === 0 ? "Aucune offre publiée pour le moment" : "Aucune offre trouvée"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {jobs.length === 0
                  ? "Les offres seront affichées ici lorsqu'elles proviendront d'une source réelle."
                  : "Essaie un autre intitulé ou une référence."}
              </p>
            </div>
          )}
        </div>}

        <aside className="mt-5 bg-primary/10 p-4">
          <h2 className="text-sm font-semibold">À savoir avant de postuler</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Vérifie les critères, la disponibilité du poste et les modalités de candidature auprès de
            l'employeur avant d’envoyer tes informations.
          </p>
        </aside>
      </main>

      <Dialog
        open={selectedJob !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedJob(null);
        }}
      >
        <DialogContent className="max-w-xl rounded-none border-0 bg-card p-0 sm:rounded-none">
          {selectedJob && (
            <>
              <div className="bg-forest px-5 py-6 pr-12 text-secondary-foreground sm:px-7">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Opportunité professionnelle
                </p>
                <DialogHeader className="mt-2 text-left">
                  <DialogTitle className="text-xl leading-snug sm:text-2xl">{selectedJob.title}</DialogTitle>
                  <DialogDescription className="text-secondary-foreground/75">
                    {selectedJob.organization}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-secondary-foreground/80">
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 text-primary" />
                    {selectedJob.location || "Kolwezi, RDC"}
                  </span>
                  {selectedJob.contractType && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5 text-primary" />
                      {selectedJob.contractType}
                    </span>
                  )}
                </div>
              </div>
              <div className="max-h-[min(55vh,520px)] space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
                <section>
                  <h3 className="text-sm font-semibold">Description du poste</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                    {selectedJob.description || "La description détaillée n’a pas été communiquée. Consultez le portail officiel de l’employeur pour obtenir les informations complètes."}
                  </p>
                </section>
                {selectedJob.requirements && (
                  <section>
                    <h3 className="text-sm font-semibold">Profil et exigences</h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {selectedJob.requirements}
                    </p>
                  </section>
                )}
                {(selectedJob.salary || selectedJob.expiresAt) && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 bg-muted p-3 text-sm">
                    {selectedJob.salary && <span className="font-semibold text-primary">{selectedJob.salary}</span>}
                    {selectedJob.expiresAt && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        Clôture : {new Date(selectedJob.expiresAt).toLocaleDateString("fr-FR")}
                      </span>
                    )}
                  </div>
                )}
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Building2 className="h-4 w-4 shrink-0 text-primary" />
                  Vérifie la disponibilité et les conditions directement auprès de {selectedJob.organization}.
                </p>
              </div>
              <div className="p-5 sm:px-7">
                {selectedJob.applicationUrl ? (
                  <a
                    href={selectedJob.applicationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-soft transition hover:brightness-95"
                  >
                    Apply / Postuler <ExternalLink className="h-4 w-4" />
                  </a>
                ) : selectedJob.applicationEmail ? (
                  <a
                    href={`mailto:${selectedJob.applicationEmail}`}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground shadow-soft transition hover:brightness-95"
                  >
                    Apply / Postuler <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <p className="text-center text-xs text-muted-foreground">
                    Les modalités de candidature ne sont pas disponibles pour cette offre.
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
