import type { AgendaEvent } from "@/routes/agenda";
import type { Listing, Payment } from "@/data/listings";
import { getPublicListingPhotoUrl, type SupabaseRow } from "@/lib/supabase-data";

const PAYMENT_LABELS: Record<string, Payment> = {
  cash: "Cash",
  airtel_money: "Airtel Money",
  m_pesa: "M-Pesa",
  orange_money: "Orange Money",
  card: "Carte",
};

const WEEKDAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function safeHttpUrl(value: unknown) {
  const candidate = text(value).trim();
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function records(value: unknown): SupabaseRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is SupabaseRow => typeof item === "object" && item !== null && !Array.isArray(item),
  );
}

function listingHours(row: SupabaseRow) {
  return records(row.hours)
    .map((hour) => {
      const day = numberOrNull(hour.day_of_week);
      if (day === null || day < 0 || day > 6) return null;
      const closed = hour.is_closed === true;
      const opensAt = text(hour.opens_at).slice(0, 5);
      const closesAt = text(hour.closes_at).slice(0, 5);
      return {
        day: WEEKDAYS[day],
        open: closed || !opensAt || !closesAt ? null : `${opensAt}–${closesAt}`,
        dayOfWeek: day,
        opensAt,
        closesAt,
      };
    })
    .filter((hour): hour is NonNullable<typeof hour> => hour !== null);
}

function isOpenNow(hours: ReturnType<typeof listingHours>): boolean | null {
  if (hours.length === 0) return null;
  const now = new Date();
  const day = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Lubumbashi", weekday: "short" })
      .formatToParts(now)
      .find((part) => part.type === "weekday")?.value
      ?.replace(/^Sun$/, "0")
      .replace(/^Mon$/, "1")
      .replace(/^Tue$/, "2")
      .replace(/^Wed$/, "3")
      .replace(/^Thu$/, "4")
      .replace(/^Fri$/, "5")
      .replace(/^Sat$/, "6"),
  );
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lubumbashi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const currentMinutes = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

  const today = hours.find((hour) => hour.dayOfWeek === day);
  if (!today) return null;
  if (!today.opensAt || !today.closesAt) return false;

  const opening = Number(today.opensAt.slice(0, 2)) * 60 + Number(today.opensAt.slice(3, 5));
  const closing = Number(today.closesAt.slice(0, 2)) * 60 + Number(today.closesAt.slice(3, 5));
  return opening <= closing
    ? currentMinutes >= opening && currentMinutes < closing
    : currentMinutes >= opening || currentMinutes < closing;
}

export function mapPublicListing(row: SupabaseRow): Listing {
  const hours = listingHours(row);
  const socialLinks =
    typeof row.social_links === "object" && row.social_links !== null
      ? (row.social_links as Record<string, unknown>)
      : {};
  const latitude = numberOrNull(row.latitude);
  const longitude = numberOrNull(row.longitude);
  const createdAt = text(row.created_at);
  const createdTime = Date.parse(createdAt);

  return {
    id: text(row.id),
    name: text(row.name),
    category: text(row.category_id),
    subcategory: text(row.subcategory_name),
    description: text(row.description),
    ...(text(row.cover_image_path) ? { imageUrl: getPublicListingPhotoUrl(text(row.cover_image_path)) } : {}),
    address: text(row.address),
    commune: text(row.commune),
    quartier: text(row.quartier),
    ...(latitude !== null && longitude !== null ? { gps: { lat: latitude, lng: longitude } } : {}),
    phone: text(row.phone),
    whatsapp: text(row.whatsapp),
    ...(text(row.email) ? { email: text(row.email) } : {}),
    ...(safeHttpUrl(row.website) ? { website: safeHttpUrl(row.website) } : {}),
    socials: {
      ...(safeHttpUrl(socialLinks.facebook) ? { facebook: safeHttpUrl(socialLinks.facebook) } : {}),
      ...(safeHttpUrl(socialLinks.instagram) ? { instagram: safeHttpUrl(socialLinks.instagram) } : {}),
    },
    hours: hours.map(({ day, open }) => ({ day, open })),
    openNow: isOpenNow(hours),
    languages: strings(row.languages),
    payments: strings(row.payments)
      .map((payment) => PAYMENT_LABELS[payment])
      .filter((payment): payment is Payment => payment !== undefined),
    services: [],
    rating: numberOrNull(row.average_rating) ?? 0,
    reviewsCount: numberOrNull(row.reviews_count) ?? 0,
    reviews: [],
    ...(text(row.source) ? { source: text(row.source) } : {}),
    verified: true,
    isExample: row.is_example === true,
    ...(text(row.last_verified_at) ? { verifiedAt: text(row.last_verified_at) } : {}),
    ...(Number.isFinite(createdTime) && Date.now() - createdTime < 30 * 24 * 60 * 60 * 1000
      ? { isNew: true }
      : {}),
  };
}

export function mapPublicListingReview(row: SupabaseRow) {
  const createdAt = text(row.created_at);
  return {
    author: text(row.author_name) || "Membre",
    rating: numberOrNull(row.rating) ?? 0,
    date: createdAt ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(createdAt)) : "",
    text: text(row.body),
  };
}

export function mapPublicEvent(row: SupabaseRow): AgendaEvent {
  const startsAt = new Date(text(row.starts_at));
  const endsAt = row.ends_at ? new Date(text(row.ends_at)) : new Date(startsAt.getTime() + 60 * 60 * 1000);
  const category = text(row.category);
  const icon = /musique|music/i.test(category)
    ? "music"
    : /marché|market/i.test(category)
      ? "market"
      : /sport/i.test(category)
        ? "sport"
        : "culture";
  const location = [row.venue, row.quartier, row.commune]
    .map(text)
    .filter(Boolean)
    .join(" · ");

  return {
    id: text(row.id),
    category,
    title: text(row.title),
    dateLabel: new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeZone: "Africa/Lubumbashi",
    }).format(startsAt),
    start: startsAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    end: endsAt.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    time: new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Lubumbashi",
    }).format(startsAt),
    location: location || text(row.address) || "Lubumbashi",
    price: text(row.price_label) || "Prix non communiqué",
    description: text(row.description),
    organizer: text(row.organizer_name),
    ticketUrl: safeHttpUrl(row.ticket_url),
    isExample: row.is_example === true,
    icon,
    tone: icon === "music" ? "bg-violet-500/15 text-violet-400"
      : icon === "market" ? "bg-amber-500/15 text-amber-400"
        : icon === "sport" ? "bg-emerald-500/15 text-emerald-400"
          : "bg-primary/15 text-primary",
  };
}

export type PublicJob = {
  id: string;
  title: string;
  organization: string;
  description: string;
  requirements: string;
  location: string;
  contractType: string;
  salary: string;
  applicationUrl: string;
  applicationEmail: string;
  expiresAt: string;
  isExample: boolean;
};

export function mapPublicJob(row: SupabaseRow): PublicJob {
  const salaryMin = numberOrNull(row.salary_min);
  const salaryMax = numberOrNull(row.salary_max);
  const currency = text(row.salary_currency);
  let salary = "";
  if (salaryMin !== null && salaryMax !== null) salary = `${salaryMin}–${salaryMax} ${currency}`;
  else if (salaryMin !== null) salary = `À partir de ${salaryMin} ${currency}`;
  else if (salaryMax !== null) salary = `Jusqu’à ${salaryMax} ${currency}`;

  return {
    id: text(row.id),
    title: text(row.title),
    organization: text(row.organization),
    description: text(row.description),
    requirements: text(row.requirements),
    location: text(row.location) || text(row.commune),
    contractType: text(row.contract_type),
    salary,
    applicationUrl: safeHttpUrl(row.application_url),
    applicationEmail: text(row.application_email),
    expiresAt: text(row.expires_at),
    isExample: row.is_example === true,
  };
}
