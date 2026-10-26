import { createFileRoute } from "@tanstack/react-router";
import { BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, CreditCard, Eye, EyeOff, Languages, Pencil, RefreshCw, Store, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { AdminWorkspaceLayout } from "@/components/admin/admin-workspace-layout";
import { AdminUserManagement } from "@/components/admin/admin-user-management";
import { COMMUNES } from "@/data/listings";
import { reportAdminError } from "@/lib/admin-users";
import {
  createAdminEvent,
  createAdminJob,
  createAdminListing,
  deleteAdminEvent,
  deleteAdminJob,
  deleteAdminListing,
  fetchAdminEvents,
  fetchAdminListingDetails,
  fetchAdminJobs,
  fetchAdminListings,
  fetchListingTaxonomy,
  setAdminListingStatus,
  updateAdminEvent,
  updateAdminJob,
  updateAdminListing,
  type SupabaseRow,
} from "@/lib/supabase-data";

export const Route = createFileRoute("/admin/workspace")({
  head: () => ({
    meta: [
      { title: "Gestion — Lubumbashi Connect" },
      { name: "description", content: "Gérer les fiches, événements et offres publiés sur Lubumbashi Connect." },
    ],
  }),
  component: AdminWorkspacePage,
});

const inputClass = "mt-1 h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary";
const categories = ["Culture", "Musique", "Marché", "Sport", "Communauté", "Autre"];
const weekdays = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const eventTimeZone = "Africa/Lubumbashi";
const paymentOptions = [
  ["cash", "Espèces"],
  ["airtel_money", "Airtel Money"],
  ["m_pesa", "M-Pesa"],
  ["orange_money", "Orange Money"],
  ["card", "Carte"],
];
const languageOptions = ["Français", "Swahili", "Lingala", "Anglais"];
const initialListingForm = {
  name: "",
  category_id: "",
  subcategory_id: "",
  description: "",
  address: "",
  commune: "",
  quartier: "",
  latitude: "",
  longitude: "",
  phone: "",
  whatsapp: "",
  email: "",
  website: "",
  facebook: "",
  instagram: "",
  keywords: "",
};
const initialEventForm = {
  title: "",
  category: "Culture",
  description: "",
  startsAt: "",
  endsAt: "",
  venue: "",
  address: "",
  commune: "",
  quartier: "",
  latitude: "",
  longitude: "",
  price: "",
  ticketUrl: "",
  organizer: "",
};
const initialJobForm = {
  title: "",
  organization: "",
  description: "",
  requirements: "",
  location: "",
  commune: "",
  contractType: "",
  salaryMin: "",
  salaryMax: "",
  salaryCurrency: "USD",
  applicationUrl: "",
  applicationEmail: "",
  sourceUrl: "",
  expiresAt: "",
};

function text(row: SupabaseRow, key: string) {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function dateTimeToIso(value: string) {
  if (!value) return null;
  const date = new Date(`${value}:00Z`);
  if (!Number.isFinite(date.getTime())) throw new Error("La date et l’heure indiquées sont invalides.");
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: eventTimeZone,
    timeZoneName: "longOffset",
  }).formatToParts(date).find((part) => part.type === "timeZoneName")?.value;
  if (!offset) throw new Error("Impossible de déterminer le fuseau horaire de Lubumbashi.");
  const match = offset.match(/^GMT(?:([+-])(\d{2}):?(\d{2}))?$/);
  if (!match) throw new Error(`Fuseau horaire non reconnu : ${offset}.`);
  const offsetMinutes = match[1]
    ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
    : 0;
  return new Date(date.getTime() - offsetMinutes * 60_000).toISOString();
}

function isoToDateTimeLocal(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Map(new Intl.DateTimeFormat("en-CA", {
    timeZone: eventTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Les coordonnées et les salaires doivent être des nombres valides.");
  return number;
}

function slug(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return `${normalized || "publication"}-${crypto.randomUUID().slice(0, 8)}`;
}

function SectionTitle({ icon: Icon, title, description, count }: {
  icon: typeof Store;
  title: string;
  description: string;
  count?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center bg-primary/15 text-primary"><Icon className="h-5 w-5" /></span>
        <div><h2 className="font-display text-lg font-bold">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>
      </div>
      {count && <span className="border border-border px-2.5 py-1 text-xs text-muted-foreground">{count}</span>}
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-xs font-medium ${className}`}>{label}{children}</label>;
}

function AdminWorkspacePage() {
  const [listings, setListings] = useState<SupabaseRow[]>([]);
  const [events, setEvents] = useState<SupabaseRow[]>([]);
  const [jobs, setJobs] = useState<SupabaseRow[]>([]);
  const [taxonomy, setTaxonomy] = useState<{ categories: SupabaseRow[]; subcategories: SupabaseRow[] }>({ categories: [], subcategories: [] });
  const [listingForm, setListingForm] = useState(initialListingForm);
  const [eventForm, setEventForm] = useState(initialEventForm);
  const [jobForm, setJobForm] = useState(initialJobForm);
  const [hours, setHours] = useState(() => weekdays.map((_, day_of_week) => ({
    day_of_week,
    is_closed: false,
    opens_at: "",
    closes_at: "",
  })));
  const [payments, setPayments] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [editingListingId, setEditingListingId] = useState("");
  const [editingEventId, setEditingEventId] = useState("");
  const [editingJobId, setEditingJobId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [listingRows, eventRows, jobRows, categoriesAndSubs] = await Promise.all([
        fetchAdminListings(),
        fetchAdminEvents(),
        fetchAdminJobs(),
        fetchListingTaxonomy(),
      ]);
      setListings(listingRows);
      setEvents(eventRows);
      setJobs(jobRows);
      setTaxonomy(categoriesAndSubs);
    } catch (cause) {
      console.error("Unable to load admin content from Supabase", cause);
      void reportAdminError("admin_workspace.content.load", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de charger les données Supabase.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredSubcategories = useMemo(
    () => taxonomy.subcategories.filter((subcategory) => text(subcategory, "category_id") === listingForm.category_id),
    [listingForm.category_id, taxonomy.subcategories],
  );

  const editListing = async (id: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const details = await fetchAdminListingDetails(id);
      const row = details.listing;
      const socialLinks = typeof row.social_links === "object" && row.social_links !== null
        ? row.social_links as Record<string, unknown>
        : {};
      const savedHours = weekdays.map((_, day_of_week) => {
        const saved = details.hours.find((hour) => Number(hour.day_of_week) === day_of_week);
        return {
          day_of_week,
          is_closed: saved?.is_closed === true,
          opens_at: text(saved ?? {}, "opens_at").slice(0, 5),
          closes_at: text(saved ?? {}, "closes_at").slice(0, 5),
        };
      });
      setEditingListingId(id);
      setListingForm({
        name: text(row, "name"),
        category_id: text(row, "category_id"),
        subcategory_id: text(row, "subcategory_id"),
        description: text(row, "description"),
        address: text(row, "address"),
        commune: text(row, "commune"),
        quartier: text(row, "quartier"),
        latitude: row.latitude == null ? "" : String(row.latitude),
        longitude: row.longitude == null ? "" : String(row.longitude),
        phone: text(row, "phone"),
        whatsapp: text(row, "whatsapp"),
        email: text(row, "email"),
        website: text(row, "website"),
        facebook: text(socialLinks, "facebook"),
        instagram: text(socialLinks, "instagram"),
        keywords: details.keywords.map((keyword) => text(keyword, "keyword")).join(", "),
      });
      setHours(savedHours);
      setPayments(details.payments.map((payment) => text(payment, "payment_method")));
      setLanguages(details.languages.map((language) => text(language, "language")));
      setNotice("Fiche chargée dans le formulaire. Les changements ne modifieront pas son statut.");
    } catch (cause) {
      console.error("Unable to load listing for editing", cause);
      void reportAdminError("admin_workspace.listing.load", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de charger cette fiche.");
    } finally {
      setSaving(false);
    }
  };

  const editEvent = (row: SupabaseRow) => {
    setEditingEventId(text(row, "id"));
    setEventForm({
      title: text(row, "title"),
      category: text(row, "category") || "Autre",
      description: text(row, "description"),
      startsAt: isoToDateTimeLocal(text(row, "starts_at")),
      endsAt: isoToDateTimeLocal(text(row, "ends_at")),
      venue: text(row, "venue"),
      address: text(row, "address"),
      commune: text(row, "commune"),
      quartier: text(row, "quartier"),
      latitude: row.latitude == null ? "" : String(row.latitude),
      longitude: row.longitude == null ? "" : String(row.longitude),
      price: text(row, "price_label"),
      ticketUrl: text(row, "ticket_url"),
      organizer: text(row, "organizer_name"),
    });
    setError("");
    setNotice("Événement chargé dans le formulaire.");
  };

  const editJob = (row: SupabaseRow) => {
    setEditingJobId(text(row, "id"));
    setJobForm({
      title: text(row, "title"),
      organization: text(row, "organization"),
      description: text(row, "description"),
      requirements: text(row, "requirements"),
      location: text(row, "location"),
      commune: text(row, "commune"),
      contractType: text(row, "contract_type"),
      salaryMin: row.salary_min == null ? "" : String(row.salary_min),
      salaryMax: row.salary_max == null ? "" : String(row.salary_max),
      salaryCurrency: text(row, "salary_currency") || "USD",
      applicationUrl: text(row, "application_url"),
      applicationEmail: text(row, "application_email"),
      sourceUrl: text(row, "source_url"),
      expiresAt: text(row, "expires_at") ? isoToDateTimeLocal(text(row, "expires_at")).slice(0, 10) : "",
    });
    setError("");
    setNotice("Offre chargée dans le formulaire.");
  };

  const submitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const schedule = hours.flatMap((hour) => {
        if (hour.is_closed) return [{ ...hour, opens_at: null, closes_at: null }];
        if (!hour.opens_at && !hour.closes_at) return [];
        if (!hour.opens_at || !hour.closes_at) {
          throw new Error(`Renseigne les deux heures ou coche « Fermé » pour ${weekdays[hour.day_of_week].toLocaleLowerCase("fr")}.`);
        }
        return [{ ...hour, opens_at: hour.opens_at, closes_at: hour.closes_at }];
      });
      const keywords = listingForm.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean);
      const listing = {
        name: listingForm.name.trim(),
        category_id: listingForm.category_id,
        subcategory_id: listingForm.subcategory_id,
        description: listingForm.description,
        address: listingForm.address,
        commune: listingForm.commune,
        quartier: listingForm.quartier,
        latitude: optionalNumber(listingForm.latitude),
        longitude: optionalNumber(listingForm.longitude),
        phone: listingForm.phone,
        whatsapp: listingForm.whatsapp,
        email: listingForm.email,
        website: listingForm.website,
        social_links: { facebook: listingForm.facebook, instagram: listingForm.instagram },
      };
      const savedId = editingListingId;
      if (savedId) {
        await updateAdminListing(savedId, listing, schedule, payments, languages, keywords);
      } else {
        await createAdminListing(listing, schedule, payments, languages, keywords);
      }
      setEditingListingId("");
      setListingForm(initialListingForm);
      setHours(weekdays.map((_, day_of_week) => ({ day_of_week, is_closed: false, opens_at: "", closes_at: "" })));
      setPayments([]);
      setLanguages([]);
      setNotice(savedId ? "Fiche mise à jour." : "Fiche publiée avec succès.");
      await refresh();
    } catch (cause) {
      console.error("Unable to save public listing", cause);
      void reportAdminError("admin_workspace.listing.save", cause);
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer la fiche.");
    } finally {
      setSaving(false);
    }
  };

  const submitEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const startsAt = dateTimeToIso(eventForm.startsAt);
      if (!startsAt) throw new Error("La date de début est obligatoire.");
      const eventData = {
        title: eventForm.title.trim(),
        category: eventForm.category,
        description: eventForm.description,
        starts_at: startsAt,
        ends_at: dateTimeToIso(eventForm.endsAt),
        timezone: eventTimeZone,
        venue: eventForm.venue,
        address: eventForm.address,
        commune: eventForm.commune,
        quartier: eventForm.quartier,
        latitude: optionalNumber(eventForm.latitude),
        longitude: optionalNumber(eventForm.longitude),
        price_label: eventForm.price,
        ticket_url: eventForm.ticketUrl,
        organizer_name: eventForm.organizer,
        source_details: "KISHANGA NETWORK : https://kishanga.net/article/slam-poesie-symphonie-jonathan-ntumba-donne-rendez-vous-a-lubumbashi-le-31-octobre",
      };
      const savedId = editingEventId;
      let eventTitle = eventForm.title.trim();
      if (savedId) {
        await updateAdminEvent(savedId, eventData);
      } else {
        await createAdminEvent({
          ...eventData,
          slug: slug(eventForm.title),
          status: "published",
          published_at: new Date().toISOString(),
          is_example: false,
        });
      }
      setEditingEventId("");
      setEventForm(initialEventForm);
      setNotice(savedId ? "Événement mis à jour." : `Événement « ${eventTitle} » publié sur le site.`);
      await refresh();
    } catch (cause) {
      console.error("Unable to publish event", cause);
      void reportAdminError("admin_workspace.event.save", cause);
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer l’événement.");
    } finally {
      setSaving(false);
    }
  };

  const submitJob = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const jobData = {
        title: jobForm.title.trim(),
        organization: jobForm.organization.trim(),
        description: jobForm.description,
        requirements: jobForm.requirements,
        location: jobForm.location,
        commune: jobForm.commune,
        contract_type: jobForm.contractType,
        salary_min: optionalNumber(jobForm.salaryMin),
        salary_max: optionalNumber(jobForm.salaryMax),
        salary_currency: jobForm.salaryCurrency,
        application_url: jobForm.applicationUrl,
        application_email: jobForm.applicationEmail,
        source_url: jobForm.sourceUrl,
        expires_at: jobForm.expiresAt ? new Date(`${jobForm.expiresAt}T23:59:59`).toISOString() : null,
      };
      const savedId = editingJobId;
      if (savedId) {
        await updateAdminJob(savedId, jobData);
      } else {
        const row = await createAdminJob({
          ...jobData,
          slug: slug(jobForm.title),
          source: "declared_by_owner",
          status: "published",
          published_at: new Date().toISOString(),
          is_example: false,
        });
        setNotice(`Offre « ${text(row, "title")} » publiée sur le site.`);
      }
      setEditingJobId("");
      setJobForm(initialJobForm);
      if (savedId) setNotice("Offre mise à jour.");
      await refresh();
    } catch (cause) {
      console.error("Unable to publish job", cause);
      void reportAdminError("admin_workspace.job.save", cause);
      setError(cause instanceof Error ? cause.message : "Impossible d’enregistrer l’offre.");
    } finally {
      setSaving(false);
    }
  };

  const changeEventStatus = async (row: SupabaseRow) => {
    const id = text(row, "id");
    const nextStatus = text(row, "status") === "published" ? "archived" : "published";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateAdminEvent(id, {
        status: nextStatus,
        published_at: nextStatus === "published" ? new Date().toISOString() : row.published_at,
      });
      setNotice(nextStatus === "published" ? "Événement republié." : "Événement retiré du site.");
      await refresh();
    } catch (cause) {
      console.error("Unable to update event status", cause);
      void reportAdminError("admin_workspace.event.update", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de modifier l’événement.");
    } finally {
      setSaving(false);
    }
  };

  const changeJobStatus = async (row: SupabaseRow) => {
    const id = text(row, "id");
    const nextStatus = text(row, "status") === "published" ? "paused" : "published";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await updateAdminJob(id, {
        status: nextStatus,
        published_at: nextStatus === "published" ? new Date().toISOString() : row.published_at,
      });
      setNotice(nextStatus === "published" ? "Offre publiée." : "Offre suspendue.");
      await refresh();
    } catch (cause) {
      console.error("Unable to update job status", cause);
      void reportAdminError("admin_workspace.job.update", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de modifier l’offre.");
    } finally {
      setSaving(false);
    }
  };

  const changeListingStatus = async (row: SupabaseRow) => {
    const id = text(row, "id");
    const nextStatus = text(row, "status") === "verified" ? "suspended" : "verified";
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await setAdminListingStatus(id, nextStatus);
      setNotice(nextStatus === "verified" ? "Fiche publiée." : "Fiche masquée du site.");
      await refresh();
    } catch (cause) {
      console.error("Unable to update listing status", cause);
      void reportAdminError("admin_workspace.listing.status", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de modifier la fiche.");
    } finally {
      setSaving(false);
    }
  };

  const removeListing = async (row: SupabaseRow) => {
    const name = text(row, "name") || "cette fiche";
    if (!window.confirm(`Supprimer définitivement « ${name} » et ses informations associées ? Cette action est irréversible.`)) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await deleteAdminListing(text(row, "id"));
      if (editingListingId === text(row, "id")) {
        setEditingListingId("");
        setListingForm(initialListingForm);
        setHours(weekdays.map((_, day_of_week) => ({ day_of_week, is_closed: false, opens_at: "", closes_at: "" })));
        setPayments([]);
        setLanguages([]);
      }
      setNotice(`« ${name} » a été supprimé de l’annuaire.`);
      await refresh();
    } catch (cause) {
      console.error("Unable to delete listing", cause);
      void reportAdminError("admin_workspace.listing.delete", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cette fiche.");
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (row: SupabaseRow) => {
    const id = text(row, "id");
    const title = text(row, "title") || "cet événement";
    if (!window.confirm(`Supprimer définitivement « ${title} » et les données qui lui sont liées ? Cette action est irréversible.`)) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await deleteAdminEvent(id);
      if (editingEventId === id) {
        setEditingEventId("");
        setEventForm(initialEventForm);
      }
      setNotice(`« ${title} » a été supprimé de l’agenda.`);
      await refresh();
    } catch (cause) {
      console.error("Unable to delete event", cause);
      void reportAdminError("admin_workspace.event.delete", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cet événement.");
    } finally {
      setSaving(false);
    }
  };

  const removeJob = async (row: SupabaseRow) => {
    const id = text(row, "id");
    const title = text(row, "title") || "cette offre";
    if (!window.confirm(`Supprimer définitivement « ${title} » et ses candidatures associées ? Cette action est irréversible.`)) return;

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await deleteAdminJob(id);
      if (editingJobId === id) {
        setEditingJobId("");
        setJobForm(initialJobForm);
      }
      setNotice(`« ${title} » a été supprimé des offres d’emploi.`);
      await refresh();
    } catch (cause) {
      console.error("Unable to delete job", cause);
      void reportAdminError("admin_workspace.job.delete", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer cette offre.");
    } finally {
      setSaving(false);
    }
  };

  const toggleChoice = (values: string[], value: string, setValues: (values: string[]) => void) => {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };

  return (
    <AdminWorkspaceLayout>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-wider text-primary">Contenu du site</p><h1 className="mt-1 font-display text-2xl font-bold">Gestion des publications</h1></div>
        <button type="button" onClick={() => void refresh()} disabled={loading || saving} className="inline-flex h-10 items-center gap-2 border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"><RefreshCw className="h-4 w-4" /> Actualiser</button>
      </div>
      <p className="mb-5 border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        Les publications sont enregistrées dans Supabase. Les fiches, événements et offres marqués « Publié » deviennent visibles sur le site public. Les actions ne réussissent que si Supabase confirme leur enregistrement.
      </p>
      {error && <p role="alert" className="mb-4 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mb-4 border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}
      {loading && <p className="mb-4 text-sm text-muted-foreground">Chargement des données Supabase…</p>}

      <AdminUserManagement />

      <section id="directory" className="scroll-mt-24 border border-border bg-card p-4 sm:p-6">
        <SectionTitle icon={Store} title="Annuaire" description="Chaque ligne est un établissement enregistré. Crée une fiche réelle, modifie-la, publie-la, masque-la ou supprime-la." count={`${listings.length} fiche${listings.length === 1 ? "" : "s"}`} />
        <form onSubmit={submitListing} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Nom de l’établissement"><input required minLength={2} maxLength={180} value={listingForm.name} onChange={(e) => setListingForm({ ...listingForm, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Catégorie"><select required value={listingForm.category_id} onChange={(e) => setListingForm({ ...listingForm, category_id: e.target.value, subcategory_id: "" })} className={inputClass}><option value="">Choisir…</option>{taxonomy.categories.map((item) => <option key={text(item, "id")} value={text(item, "id")}>{text(item, "name")}</option>)}</select></Field>
          <Field label="Sous-catégorie"><select required value={listingForm.subcategory_id} onChange={(e) => setListingForm({ ...listingForm, subcategory_id: e.target.value })} className={inputClass}><option value="">Choisir…</option>{filteredSubcategories.map((item) => <option key={text(item, "id")} value={text(item, "id")}>{text(item, "name")}</option>)}</select></Field>
          <Field label="Description"><textarea maxLength={4000} value={listingForm.description} onChange={(e) => setListingForm({ ...listingForm, description: e.target.value })} className={`${inputClass} h-24 py-2`} /></Field>
          <Field label="Adresse"><input maxLength={300} value={listingForm.address} onChange={(e) => setListingForm({ ...listingForm, address: e.target.value })} className={inputClass} /></Field>
          <Field label="Commune"><select value={listingForm.commune} onChange={(e) => setListingForm({ ...listingForm, commune: e.target.value })} className={inputClass}><option value="">Choisir…</option>{COMMUNES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Quartier"><input maxLength={120} value={listingForm.quartier} onChange={(e) => setListingForm({ ...listingForm, quartier: e.target.value })} className={inputClass} /></Field>
          <Field label="Latitude"><input type="number" step="any" min="-90" max="90" value={listingForm.latitude} onChange={(e) => setListingForm({ ...listingForm, latitude: e.target.value })} className={inputClass} /></Field>
          <Field label="Longitude"><input type="number" step="any" min="-180" max="180" value={listingForm.longitude} onChange={(e) => setListingForm({ ...listingForm, longitude: e.target.value })} className={inputClass} /></Field>
          <Field label="Téléphone"><input type="tel" maxLength={32} value={listingForm.phone} onChange={(e) => setListingForm({ ...listingForm, phone: e.target.value })} className={inputClass} /></Field>
          <Field label="WhatsApp"><input type="tel" maxLength={32} value={listingForm.whatsapp} onChange={(e) => setListingForm({ ...listingForm, whatsapp: e.target.value })} className={inputClass} /></Field>
          <Field label="E-mail"><input type="email" maxLength={254} value={listingForm.email} onChange={(e) => setListingForm({ ...listingForm, email: e.target.value })} className={inputClass} /></Field>
          <Field label="Site web"><input type="url" maxLength={500} value={listingForm.website} onChange={(e) => setListingForm({ ...listingForm, website: e.target.value })} className={inputClass} /></Field>
          <Field label="Facebook"><input type="url" maxLength={500} value={listingForm.facebook} onChange={(e) => setListingForm({ ...listingForm, facebook: e.target.value })} className={inputClass} /></Field>
          <Field label="Instagram"><input type="url" maxLength={500} value={listingForm.instagram} onChange={(e) => setListingForm({ ...listingForm, instagram: e.target.value })} className={inputClass} /></Field>
          <Field label="Mots-clés (séparés par des virgules)"><input value={listingForm.keywords} onChange={(e) => setListingForm({ ...listingForm, keywords: e.target.value })} className={inputClass} /></Field>

          <fieldset className="border border-border/80 bg-background/40 p-4 sm:col-span-2 sm:p-5 xl:col-span-3">
            <legend className="px-2">
              <span className="inline-flex items-center gap-2 border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold">
                <Clock3 className="h-3.5 w-3.5 text-primary" />
                Horaires
                <span className="font-normal text-muted-foreground">· optionnels</span>
              </span>
            </legend>
            <p className="mb-4 text-xs text-muted-foreground">Indique les heures d’ouverture pour chaque jour, ou coche « Fermé ».</p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {hours.map((item, index) => (
                <div key={item.day_of_week} className={`border p-3 transition-colors ${item.is_closed ? "border-border/60 bg-muted/20" : "border-border/80 bg-card hover:border-primary/40"}`}>
                  <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/70 pb-2">
                    <span className="text-xs font-semibold">{weekdays[item.day_of_week]}</span>
                    <label className={`inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 text-[10px] transition-colors ${item.is_closed ? "border-border bg-muted text-muted-foreground" : "border-border/70 bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}>
                      <input
                        type="checkbox"
                        checked={item.is_closed}
                        onChange={(e) => setHours(hours.map((hour, i) => i === index ? { ...hour, is_closed: e.target.checked, opens_at: "", closes_at: "" } : hour))}
                        className="h-4 w-4 shrink-0 cursor-pointer rounded-none accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
                      />
                      Fermé
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="min-w-0 text-[9px] font-medium text-muted-foreground">
                      Ouverture
                      <input aria-label={`${weekdays[item.day_of_week]} ouverture`} type="time" disabled={item.is_closed} value={item.opens_at} onChange={(e) => setHours(hours.map((hour, i) => i === index ? { ...hour, opens_at: e.target.value } : hour))} className="mt-1 h-10 w-full min-w-0 appearance-none border border-border bg-background px-2 text-sm tabular-nums text-foreground scheme-dark outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40" />
                    </label>
                    <label className="min-w-0 text-[9px] font-medium text-muted-foreground">
                      Fermeture
                      <input aria-label={`${weekdays[item.day_of_week]} fermeture`} type="time" disabled={item.is_closed} value={item.closes_at} onChange={(e) => setHours(hours.map((hour, i) => i === index ? { ...hour, closes_at: e.target.value } : hour))} className="mt-1 h-10 w-full min-w-0 appearance-none border border-border bg-background px-2 text-sm tabular-nums text-foreground scheme-dark outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-40" />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <fieldset className="border border-border/80 bg-background/40 p-4">
            <legend className="px-2">
              <span className="inline-flex items-center gap-2 border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold">
                <CreditCard className="h-3.5 w-3.5 text-primary" />
                Paiements acceptés
              </span>
            </legend>
            <p className="mb-3 text-xs text-muted-foreground">Moyens disponibles sur place.</p>
            <div className="grid grid-cols-2 gap-2">
              {paymentOptions.map(([value, label]) => (
                <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-2 border px-2.5 text-xs transition-colors ${payments.includes(value) ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                  <input type="checkbox" checked={payments.includes(value)} onChange={() => toggleChoice(payments, value, setPayments)} className="h-4 w-4 shrink-0 cursor-pointer rounded-none accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background" />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="border border-border/80 bg-background/40 p-4">
            <legend className="px-2">
              <span className="inline-flex items-center gap-2 border border-border/80 bg-card px-3 py-1.5 text-xs font-semibold">
                <Languages className="h-3.5 w-3.5 text-primary" />
                Langues parlées
              </span>
            </legend>
            <p className="mb-3 text-xs text-muted-foreground">Aide les visiteurs à choisir leur établissement.</p>
            <div className="grid grid-cols-2 gap-2">
              {languageOptions.map((value) => (
                <label key={value} className={`flex min-h-10 cursor-pointer items-center gap-2 border px-2.5 text-xs transition-colors ${languages.includes(value) ? "border-primary/50 bg-primary/10 text-foreground" : "border-border/70 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}>
                  <input type="checkbox" checked={languages.includes(value)} onChange={() => toggleChoice(languages, value, setLanguages)} className="h-4 w-4 shrink-0 cursor-pointer rounded-none accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background" />
                  {value}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col justify-end gap-2 border border-primary/25 bg-primary/5 p-4">
            <p className="text-xs font-semibold">Prêt à enregistrer ?</p>
            <p className="mb-1 text-[11px] leading-relaxed text-muted-foreground">Vérifie les informations de l’établissement avant de confirmer.</p>
            <button type="submit" disabled={saving || loading} className="h-11 w-full border border-primary bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Enregistrement…" : editingListingId ? "Enregistrer les modifications" : "Créer et publier la fiche"}</button>
            {editingListingId && <button type="button" disabled={saving} onClick={() => { setEditingListingId(""); setListingForm(initialListingForm); setHours(weekdays.map((_, day_of_week) => ({ day_of_week, is_closed: false, opens_at: "", closes_at: "" }))); setPayments([]); setLanguages([]); }} className="h-10 border border-border bg-card px-3 text-xs font-medium transition hover:bg-muted">Annuler les modifications</button>}
          </div>
        </form>
        <DataTable headers={["Établissement", "Commune", "Statut", "Modifier", "Visibilité", "Supprimer"]} rows={listings.map((row) => [
          `${text(row, "name")}${row.is_example ? " · TEST" : ""}`,
          [text(row, "quartier"), text(row, "commune")].filter(Boolean).join(" · ") || "—",
          <ListingStatusBadge key="status" status={text(row, "status")} />,
          <button
            key="edit"
            type="button"
            disabled={saving}
            onClick={() => void editListing(text(row, "id"))}
            aria-label={`Modifier ${text(row, "name")}`}
            title="Modifier la fiche"
            className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-sky-400/30 bg-sky-400/10 text-sky-300 transition hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>,
          (!Boolean(row.is_example) || text(row, "source") === "example") ? (
            <button
              key="visibility"
              type="button"
              disabled={saving}
              onClick={() => void changeListingStatus(row)}
              aria-label={`${text(row, "status") === "verified" ? "Masquer" : "Publier"} ${text(row, "name")}`}
              title={text(row, "status") === "verified" ? "Masquer du site public" : "Publier sur le site public"}
              className={text(row, "status") === "verified"
                ? "mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 transition hover:border-amber-400/60 hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                : "mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"}
            >
              {text(row, "status") === "verified" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          ) : <span key="visibility" className="block h-8" />,
          <button
            key="delete"
            type="button"
            disabled={saving}
            onClick={() => void removeListing(row)}
            aria-label={`Supprimer ${text(row, "name")}`}
            title="Supprimer définitivement"
            className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-rose-400/30 bg-rose-400/10 text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>,
        ])} empty="Aucune fiche enregistrée." />
      </section>

      <section id="events" className="mt-6 scroll-mt-24 border border-border bg-card p-4 sm:p-6">
        <SectionTitle icon={CalendarDays} title="Agenda public" description="Les événements publiés apparaissent dans l’agenda et sur la page d’accueil." count={`${events.length} événement${events.length === 1 ? "" : "s"}`} />
        <form onSubmit={submitEvent} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Titre"><input required minLength={3} maxLength={180} value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} className={inputClass} /></Field>
          <Field label="Catégorie"><select value={eventForm.category} onChange={(e) => setEventForm({ ...eventForm, category: e.target.value })} className={inputClass}>{!categories.includes(eventForm.category) && <option value={eventForm.category}>{eventForm.category}</option>}{categories.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Organisateur"><input maxLength={180} value={eventForm.organizer} onChange={(e) => setEventForm({ ...eventForm, organizer: e.target.value })} className={inputClass} /></Field>
          <Field label="Description"><textarea maxLength={6000} value={eventForm.description} onChange={(e) => setEventForm({ ...eventForm, description: e.target.value })} className={`${inputClass} h-24 py-2`} /></Field>
          <Field label="Date et heure de début"><input required type="datetime-local" value={eventForm.startsAt} onChange={(e) => setEventForm({ ...eventForm, startsAt: e.target.value })} className={inputClass} /></Field>
          <Field label="Date et heure de fin"><input type="datetime-local" min={eventForm.startsAt} value={eventForm.endsAt} onChange={(e) => setEventForm({ ...eventForm, endsAt: e.target.value })} className={inputClass} /></Field>
          <Field label="Lieu / salle"><input maxLength={180} value={eventForm.venue} onChange={(e) => setEventForm({ ...eventForm, venue: e.target.value })} className={inputClass} /></Field>
          <Field label="Adresse"><input maxLength={300} value={eventForm.address} onChange={(e) => setEventForm({ ...eventForm, address: e.target.value })} className={inputClass} /></Field>
          <Field label="Commune"><select value={eventForm.commune} onChange={(e) => setEventForm({ ...eventForm, commune: e.target.value })} className={inputClass}><option value="">Choisir…</option>{COMMUNES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Quartier"><input maxLength={120} value={eventForm.quartier} onChange={(e) => setEventForm({ ...eventForm, quartier: e.target.value })} className={inputClass} /></Field>
          <Field label="Latitude"><input type="number" step="any" min="-90" max="90" value={eventForm.latitude} onChange={(e) => setEventForm({ ...eventForm, latitude: e.target.value })} className={inputClass} /></Field>
          <Field label="Longitude"><input type="number" step="any" min="-180" max="180" value={eventForm.longitude} onChange={(e) => setEventForm({ ...eventForm, longitude: e.target.value })} className={inputClass} /></Field>
          <Field label="Prix / tarif"><input maxLength={120} value={eventForm.price} onChange={(e) => setEventForm({ ...eventForm, price: e.target.value })} className={inputClass} /></Field>
          <Field label="Lien billetterie"><input type="url" maxLength={500} value={eventForm.ticketUrl} onChange={(e) => setEventForm({ ...eventForm, ticketUrl: e.target.value })} className={inputClass} /></Field>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="h-10 flex-1 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">{saving ? "Enregistrement…" : editingEventId ? "Enregistrer les modifications" : "Publier l’événement"}</button>
            {editingEventId && <button type="button" disabled={saving} onClick={() => { setEditingEventId(""); setEventForm(initialEventForm); }} className="h-10 border border-border px-3 text-xs">Annuler</button>}
          </div>
        </form>
        <DataTable headers={["Événement", "Date", "Statut", "Action"]} rows={events.map((row) => [
          `${text(row, "title")}${row.is_example ? " · TEST" : ""}`,
          text(row, "starts_at") ? new Date(text(row, "starts_at")).toLocaleString("fr-FR", { timeZone: eventTimeZone }) : "—",
          text(row, "status"),
          <div key="actions" className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => editEvent(row)} className="h-8 border border-border px-2 text-xs hover:bg-muted disabled:opacity-50">Modifier</button>
            <button type="button" disabled={saving} onClick={() => void changeEventStatus(row)} className="h-8 border border-border px-2 text-xs hover:bg-muted disabled:opacity-50">{text(row, "status") === "published" ? "Retirer" : "Publier"}</button>
            <button type="button" disabled={saving} onClick={() => void removeEvent(row)} className="h-8 border border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50">Supprimer</button>
          </div>,
        ])} empty="Aucun événement enregistré." />
      </section>

      <section id="jobs" className="mt-6 scroll-mt-24 border border-border bg-card p-4 sm:p-6">
        <SectionTitle icon={BriefcaseBusiness} title="Offres d’emploi" description="Les offres publiées sont accessibles à tous sur la page Emplois." count={`${jobs.length} offre${jobs.length === 1 ? "" : "s"}`} />
        <form onSubmit={submitJob} className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Field label="Intitulé du poste"><input required minLength={3} maxLength={180} value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} className={inputClass} /></Field>
          <Field label="Organisation / employeur"><input required maxLength={180} value={jobForm.organization} onChange={(e) => setJobForm({ ...jobForm, organization: e.target.value })} className={inputClass} /></Field>
          <Field label="Type de contrat"><input maxLength={80} value={jobForm.contractType} onChange={(e) => setJobForm({ ...jobForm, contractType: e.target.value })} className={inputClass} /></Field>
          <Field label="Description"><textarea maxLength={6000} value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} className={`${inputClass} h-24 py-2`} /></Field>
          <Field label="Profil / exigences"><textarea maxLength={6000} value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} className={`${inputClass} h-24 py-2`} /></Field>
          <Field label="Lieu"><input maxLength={180} value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} className={inputClass} /></Field>
          <Field label="Commune"><select value={jobForm.commune} onChange={(e) => setJobForm({ ...jobForm, commune: e.target.value })} className={inputClass}><option value="">Choisir…</option>{COMMUNES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Salaire minimum"><input type="number" min="0" step="0.01" value={jobForm.salaryMin} onChange={(e) => setJobForm({ ...jobForm, salaryMin: e.target.value })} className={inputClass} /></Field>
          <Field label="Salaire maximum"><input type="number" min="0" step="0.01" value={jobForm.salaryMax} onChange={(e) => setJobForm({ ...jobForm, salaryMax: e.target.value })} className={inputClass} /></Field>
          <Field label="Devise"><select value={jobForm.salaryCurrency} onChange={(e) => setJobForm({ ...jobForm, salaryCurrency: e.target.value })} className={inputClass}><option value="USD">USD</option><option value="CDF">CDF</option></select></Field>
          <Field label="Lien de candidature"><input type="url" maxLength={500} value={jobForm.applicationUrl} onChange={(e) => setJobForm({ ...jobForm, applicationUrl: e.target.value })} className={inputClass} /></Field>
          <Field label="E-mail de candidature"><input type="email" maxLength={254} value={jobForm.applicationEmail} onChange={(e) => setJobForm({ ...jobForm, applicationEmail: e.target.value })} className={inputClass} /></Field>
          <Field label="Lien de la source"><input type="url" maxLength={500} value={jobForm.sourceUrl} onChange={(e) => setJobForm({ ...jobForm, sourceUrl: e.target.value })} className={inputClass} /></Field>
          <Field label="Date limite"><input type="date" value={jobForm.expiresAt} onChange={(e) => setJobForm({ ...jobForm, expiresAt: e.target.value })} className={inputClass} /></Field>
          <div className="flex items-end gap-2">
            <button type="submit" disabled={saving} className="h-10 flex-1 bg-primary px-4 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-50">{saving ? "Enregistrement…" : editingJobId ? "Enregistrer les modifications" : "Publier l’offre"}</button>
            {editingJobId && <button type="button" disabled={saving} onClick={() => { setEditingJobId(""); setJobForm(initialJobForm); }} className="h-10 border border-border px-3 text-xs">Annuler</button>}
          </div>
        </form>
        <DataTable headers={["Poste", "Employeur", "Échéance", "Statut", "Modifier", "Visibilité", "Supprimer"]} rows={jobs.map((row) => [
          `${text(row, "title")}${row.is_example ? " · TEST" : ""}`,
          text(row, "organization"),
          text(row, "expires_at") ? new Date(text(row, "expires_at")).toLocaleDateString("fr-FR") : "—",
          <ListingStatusBadge key="status" status={text(row, "status")} suspendedLabel="Suspendue" />,
          <button
            key="edit"
            type="button"
            disabled={saving}
            onClick={() => editJob(row)}
            aria-label={`Modifier ${text(row, "title")}`}
            title="Modifier l’offre"
            className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-sky-400/30 bg-sky-400/10 text-sky-300 transition hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>,
          <button
            key="visibility"
            type="button"
            disabled={saving}
            onClick={() => void changeJobStatus(row)}
            aria-label={`${text(row, "status") === "published" ? "Suspendre" : "Publier"} ${text(row, "title")}`}
            title={text(row, "status") === "published" ? "Suspendre l’offre" : "Publier l’offre"}
            className={text(row, "status") === "published"
              ? "mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-amber-400/30 bg-amber-400/10 text-amber-300 transition hover:border-amber-400/60 hover:bg-amber-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
              : "mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 transition hover:border-emerald-400/60 hover:bg-emerald-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"}
          >
            {text(row, "status") === "published" ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>,
          <button
            key="delete"
            type="button"
            disabled={saving}
            onClick={() => void removeJob(row)}
            aria-label={`Supprimer ${text(row, "title")}`}
            title="Supprimer définitivement"
            className="mx-auto inline-flex h-8 w-8 items-center justify-center rounded border border-rose-400/30 bg-rose-400/10 text-rose-300 transition hover:border-rose-400/60 hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>,
        ])} empty="Aucune offre enregistrée." />
      </section>
    </AdminWorkspaceLayout>
  );
}

function ListingStatusBadge({ status, suspendedLabel = "Masquée" }: { status: string; suspendedLabel?: string }) {
  const styles = {
    verified: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    published: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    pending: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    suspended: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    draft: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  }[status] ?? "border-border bg-muted text-muted-foreground";
  const label = {
    verified: "Vérifiée",
    published: "Publiée",
    pending: "À vérifier",
    suspended: suspendedLabel,
    draft: "Brouillon",
  }[status] ?? status;

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${styles}`}>
      {(status === "verified" || status === "published") && <CheckCircle2 className="h-3 w-3" />}
      {status === "pending" && <Clock3 className="h-3 w-3" />}
      {label}
    </span>
  );
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: (string | ReactNode)[][]; empty: string }) {
  return (
    <div className="mt-5 overflow-x-auto border border-border">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-border bg-background text-[10px] uppercase tracking-wide text-muted-foreground"><tr>{headers.map((header) => <th key={header} className="px-3 py-2.5">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, index) => <tr key={`${String(row[0])}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}`} className="px-3 py-2.5 text-sm">{cell}</td>)}</tr>)}
          {rows.length === 0 && <tr><td colSpan={headers.length} className="px-3 py-7 text-center text-sm text-muted-foreground">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
