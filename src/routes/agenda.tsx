import { createFileRoute } from "@tanstack/react-router";
import { CalendarDays, Clock3, Dumbbell, ExternalLink, MapPin, Music2, Plus, Share2, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AppShell, PublicListSkeleton } from "@/components/app/ui-bits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import { fetchPublicEvents } from "@/lib/supabase-data";
import { mapPublicEvent } from "@/lib/public-content";

export type AgendaEvent = {
  id: string;
  category: string;
  title: string;
  dateLabel: string;
  start: string;
  end: string;
  time: string;
  location: string;
  price: string;
  description: string;
  organizer?: string;
  ticketUrl?: string;
  isExample?: boolean;
  icon: "culture" | "music" | "market" | "sport";
  tone: string;
};

const CATEGORIES = ["Tout", "Culture", "Musique", "Marché", "Sport"] as const;
type EventCategory = (typeof CATEGORIES)[number];

export const Route = createFileRoute("/agenda")({
  head: () => ({
    meta: [
      { title: "Agenda de Lubumbashi — Lubumbashi Connect" },
      {
        name: "description",
        content: "Découvrez les événements, sorties et rendez-vous à Lubumbashi.",
      },
      { property: "og:title", content: "Agenda de Lubumbashi — Lubumbashi Connect" },
      { property: "og:description", content: "Événements et sorties à Lubumbashi." },
    ],
  }),
  component: Agenda,
});

function calendarUrl(event: AgendaEvent) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${event.start}/${event.end}`,
    details: event.description,
    location: event.location,
    ctz: "Africa/Lubumbashi",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function Agenda() {
  const [category, setCategory] = useState<EventCategory>("Tout");
  const [selectedEvent, setSelectedEvent] = useState<AgendaEvent | null>(null);
  const [shareError, setShareError] = useState("");
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetchPublicEvents()
      .then((rows) => {
        if (active) setEvents(rows.map(mapPublicEvent));
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("Unable to load published events", error);
        setLoadError("Impossible de charger les événements. Réessaie plus tard.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const visibleEvents = useMemo(
    () => events.filter((event) => category === "Tout" || event.category.toLocaleLowerCase("fr") === category.toLocaleLowerCase("fr")),
    [category, events],
  );

  const shareEvent = async (event: AgendaEvent) => {
    setShareError("");
    const shareData = {
      title: event.title,
      text: `${event.title} — ${event.dateLabel}, ${event.location}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text} · ${shareData.url}`);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setShareError("Impossible de partager cet événement. Réessaie dans un instant.");
    }
  };

  return (
    <AppShell>
      <header className="relative isolate overflow-hidden rounded-b-[2rem] border-b border-white/10 bg-forest px-5 pb-6 pt-6 text-secondary-foreground shadow-soft">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full border border-primary/20" />
        <div className="pointer-events-none absolute -right-3 -top-7 h-32 w-32 rounded-full border border-primary/10" />
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_24px_-12px_var(--primary)]">
            <CalendarDays className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Sorties & rendez-vous</p>
            <h1 className="font-display text-2xl font-bold">Agenda de Lubumbashi</h1>
          </div>
        </div>
        <p className="mt-3 text-sm text-secondary-foreground/80">
          Les bons moments à ne pas manquer.
        </p>
      </header>

      <main className="px-5 pt-5">
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1" aria-label="Filtrer par catégorie">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={cn(
                "h-9 shrink-0 rounded-full border px-4 text-sm font-medium transition",
                category === item
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground",
              )}
            >
              {item}
            </button>
          ))}
        </div>

        {loadError && <p role="alert" className="mb-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{loadError}</p>}
        {loading ? (
          <div className="mt-4">
            <PublicListSkeleton kind="event" />
          </div>
        ) : <div className="mt-4 space-y-3">
          {visibleEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => {
                setShareError("");
                setSelectedEvent(event);
              }}
              className="interactive-card group flex w-full items-center gap-3 bg-card/90 p-3 text-left focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-xl", event.tone)}>
                {event.icon === "music" ? (
                  <Music2 className="h-6 w-6" />
                ) : event.icon === "market" ? (
                  <Ticket className="h-6 w-6" />
                ) : event.icon === "sport" ? (
                  <Dumbbell className="h-6 w-6" />
                ) : (
                  <CalendarDays className="h-6 w-6" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-primary">
                  {event.category} · {event.dateLabel}
                </span>
                {event.isExample && <span className="mt-1 inline-block border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">TEST — données fictives</span>}
                <span className="mt-1 block font-semibold leading-snug">{event.title}</span>
                <span className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {event.location}
                </span>
              </span>
              <span className="text-xl text-primary transition-transform group-hover:translate-x-1" aria-hidden="true">
                ›
              </span>
            </button>
          ))}
          {visibleEvents.length === 0 && (
            <p className="bg-card p-6 text-center text-sm text-muted-foreground">
              Aucun événement réel n’est publié pour le moment.
            </p>
          )}
        </div>}
      </main>

      <Dialog
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogContent className="max-w-md rounded-none border-0 bg-card [&>button]:rounded-none">
          {selectedEvent && (
            <>
              <DialogHeader className="pr-6 text-left">
                {selectedEvent.isExample && <p className="w-fit border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-300">Événement de test — fictif</p>}
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {selectedEvent.category}
                </p>
                <DialogTitle className="text-xl leading-snug">{selectedEvent.title}</DialogTitle>
                <DialogDescription>{selectedEvent.dateLabel}</DialogDescription>
              </DialogHeader>
              <p className="text-sm leading-relaxed">{selectedEvent.description}</p>
              <div className="space-y-2 bg-muted p-4 text-sm">
                <p className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 shrink-0 text-primary" />
                  <span>{selectedEvent.time}</span>
                </p>
                <p className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 shrink-0 text-primary" />
                  <span>{selectedEvent.location}</span>
                </p>
                <p className="flex items-center gap-2">
                  <Ticket className="h-4 w-4 shrink-0 text-primary" />
                  <span>{selectedEvent.price}</span>
                </p>
              </div>
              {selectedEvent.organizer && <p className="text-xs text-muted-foreground">Organisé par {selectedEvent.organizer}</p>}
              <div className="grid grid-cols-2 gap-2">
                <a
                  href={calendarUrl(selectedEvent)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-none bg-primary px-3 text-center text-xs font-semibold text-primary-foreground"
                >
                  <Plus className="h-4 w-4" /> Ajouter au calendrier
                </a>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedEvent.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-none px-3 text-center text-xs font-semibold"
                >
                  <MapPin className="h-4 w-4 text-primary" /> Itinéraire
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void shareEvent(selectedEvent);
                  }}
                  className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-none px-3 text-xs font-semibold"
                >
                  <Share2 className="h-4 w-4 text-primary" /> Partager l'événement
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
                {selectedEvent.ticketUrl && (
                  <a
                    href={selectedEvent.ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-none bg-primary px-3 text-xs font-semibold text-primary-foreground"
                  >
                    <Ticket className="h-4 w-4" /> Billetterie
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {shareError && <p role="alert" className="text-center text-xs text-destructive">{shareError}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
