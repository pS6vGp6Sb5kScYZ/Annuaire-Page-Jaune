import { getAdminAccessToken, getAuthenticatedAdmin, getSupabaseApiConfig } from "@/lib/supabase-auth";

export type SupabaseRow = Record<string, unknown>;

function toQuery(path: string, query: Record<string, string | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

async function readResponse(response: Response) {
  if (response.ok) {
    if (response.status === 204) return null;
    return response.json() as Promise<unknown>;
  }

  let message = `Supabase a refusé la requête (${response.status}).`;
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const details = body as Record<string, unknown>;
      if (typeof details.message === "string") message = details.message;
      else if (typeof details.msg === "string") message = details.msg;
    }
  } catch (error) {
    console.error("Unable to parse Supabase error response", error);
  }
  throw new Error(message);
}

function assertRows(value: unknown, resource: string): SupabaseRow[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "object" || item === null || Array.isArray(item))) {
    throw new Error(`Supabase a renvoyé des données invalides pour ${resource}.`);
  }
  return value as SupabaseRow[];
}

async function publicRequest(path: string) {
  const { url, key } = getSupabaseApiConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Accept: "application/json",
    },
  });
  return readResponse(response);
}

async function adminRequest(path: string, init: RequestInit = {}) {
  const { url, key } = getSupabaseApiConfig();
  const accessToken = await getAdminAccessToken();
  if (!accessToken) throw new Error("Une session administrateur est nécessaire pour cette action.");

  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return readResponse(response);
}

async function adminStorageRequest(path: string, init: RequestInit = {}) {
  const { url, key } = getSupabaseApiConfig();
  const accessToken = await getAdminAccessToken();
  if (!accessToken) throw new Error("Une session administrateur est nécessaire pour gérer les photos.");

  const response = await fetch(`${url}/storage/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  return readResponse(response);
}

export function getPublicListingPhotoUrl(storagePath: string) {
  const { url } = getSupabaseApiConfig();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${url}/storage/v1/object/public/listing-photos/${encodedPath}`;
}

export function validateListingPhoto(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choisis une image au format JPEG, PNG ou WebP.");
  }
  if (file.size > 5 * 1024 * 1024) throw new Error("La photo ne peut pas dépasser 5 Mo.");
}

export async function saveAdminListingPhoto(
  listingId: string,
  file: File,
  listingName: string,
  previousStoragePath?: string,
) {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  validateListingPhoto(file);
  const extension = extensions[file.type];
  if (!extension) throw new Error("Choisis une image au format JPEG, PNG ou WebP.");

  const storagePath = `${listingId}/${crypto.randomUUID()}.${extension}`;
  await adminStorageRequest(`object/listing-photos/${storagePath}`, {
    method: "POST",
    headers: {
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
  });

  await adminRequest("listing_photos", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      listing_id: listingId,
      storage_path: storagePath,
      alt_text: `Photo de ${listingName}`,
      sort_order: 0,
    }),
  });

  if (previousStoragePath) {
    await adminRequest(toQuery("listing_photos", { storage_path: `eq.${previousStoragePath}` }), {
      method: "DELETE",
    });
    await adminStorageRequest("object/listing-photos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [previousStoragePath] }),
    });
  }
}

export async function fetchPublicListings() {
  return assertRows(
    await publicRequest(toQuery("public_listing_details", {
      select: "id,name,category_id,subcategory_name,description,commune,quartier,hours,languages,payments,average_rating,reviews_count,is_example,cover_image_path",
      order: "name.asc",
    })),
    "l’annuaire",
  );
}

export async function fetchFeaturedPublicListings() {
  return assertRows(
    await publicRequest(toQuery("public_listing_details", {
      select: "id,name,category_id,subcategory_name,quartier",
      order: "name.asc",
      limit: "3",
    })),
    "les adresses à découvrir",
  );
}

export async function fetchPublicListing(id: string) {
  const rows = assertRows(
    await publicRequest(toQuery("public_listing_details", {
      select: "*",
      id: `eq.${id}`,
      limit: "1",
    })),
    "la fiche",
  );
  return rows[0] ?? null;
}

export async function fetchPublicListingReviews(listingId: string) {
  return assertRows(
    await publicRequest(toQuery("public_listing_reviews", {
      select: "*",
      listing_id: `eq.${listingId}`,
      order: "created_at.desc",
    })),
    "les avis",
  );
}

export async function fetchPublicEvents() {
  const now = new Date().toISOString();
  return assertRows(
    await publicRequest(toQuery("public_events", {
      select: "id,category,title,starts_at,ends_at,venue,quartier,commune,address,price_label,description,organizer_name,ticket_url,is_example",
      order: "starts_at.asc",
      or: `(ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now}))`,
    })),
    "l’agenda",
  );
}

export async function fetchFeaturedPublicEvents() {
  const now = new Date().toISOString();
  return assertRows(
    await publicRequest(toQuery("public_events", {
      select: "id,category,title,starts_at,venue,quartier,commune,address",
      order: "starts_at.asc",
      or: `(ends_at.gte.${now},and(ends_at.is.null,starts_at.gte.${now}))`,
      limit: "3",
    })),
    "les événements à découvrir",
  );
}

export async function fetchPublicJobs() {
  return assertRows(
    await publicRequest(toQuery("public_jobs", {
      select: "id,title,organization,description,requirements,location,commune,contract_type,salary_min,salary_max,salary_currency,application_url,application_email,expires_at,is_example,created_at",
      order: "created_at.desc",
    })),
    "les offres d’emploi",
  );
}

export async function fetchAdminListings() {
  return assertRows(
    await adminRequest(toQuery("admin_listings", { select: "*", order: "created_at.desc" })),
    "les fiches d’administration",
  );
}

export async function fetchAdminDashboardListings() {
  return assertRows(
    await adminRequest(toQuery("admin_listings", {
      select: "id,name,category_id,subcategory_id,quartier,commune,status",
      order: "created_at.desc",
    })),
    "les fiches du tableau de bord",
  );
}

export async function fetchListingTaxonomy() {
  const [categories, subcategories] = await Promise.all([
    publicRequest(toQuery("categories", { select: "id,name", order: "sort_order.asc" })),
    publicRequest(toQuery("subcategories", { select: "id,category_id,name", order: "sort_order.asc" })),
  ]);
  return {
    categories: assertRows(categories, "les catégories"),
    subcategories: assertRows(subcategories, "les sous-catégories"),
  };
}

export async function fetchAdminEvents() {
  return assertRows(
    await adminRequest(toQuery("admin_events", { select: "*", order: "starts_at.desc" })),
    "les événements d’administration",
  );
}

export async function fetchAdminDashboardEvents() {
  return assertRows(
    await adminRequest(toQuery("admin_events", {
      select: "id,title,starts_at,status",
      order: "starts_at.desc",
    })),
    "les événements du tableau de bord",
  );
}

export async function fetchAdminJobs() {
  return assertRows(
    await adminRequest(toQuery("admin_jobs", { select: "*", order: "created_at.desc" })),
    "les offres d’administration",
  );
}

export async function fetchAdminDashboardJobs() {
  return assertRows(
    await adminRequest(toQuery("admin_jobs", { select: "id,status" })),
    "les offres du tableau de bord",
  );
}

export async function fetchAdminDashboardActivity() {
  return assertRows(
    await adminRequest("rpc/admin_dashboard_activity", {
      method: "POST",
      body: JSON.stringify({ p_limit: 8 }),
    }),
    "l’activité récente",
  );
}

export async function fetchAdminEditorialCalendar(from: string, to: string) {
  const [calendar, events] = await Promise.all([
    adminRequest(toQuery("editorial_calendar", {
      select: "id,title,item_type,starts_at,status,related_event_id",
      starts_at: `gte.${from}`,
      and: `(starts_at.lt.${to})`,
      order: "starts_at.asc",
      limit: "500",
    })),
    adminRequest(toQuery("admin_events", {
      select: "id,title,starts_at,status",
      starts_at: `gte.${from}`,
      and: `(starts_at.lt.${to})`,
      status: "eq.published",
      order: "starts_at.asc",
      limit: "500",
    })),
  ]);
  const calendarRows = assertRows(calendar, "le calendrier éditorial");
  const eventRows = assertRows(events, "les événements du calendrier éditorial");
  const linkedEventIds = new Set(
    calendarRows
      .map((row) => row.related_event_id)
      .filter((id): id is string => typeof id === "string"),
  );

  return [
    ...calendarRows,
    ...eventRows
      .filter((row) => !linkedEventIds.has(String(row.id)))
      .map((row) => ({ ...row, item_type: "event" })),
  ].sort((left, right) => String(left.starts_at).localeCompare(String(right.starts_at)));
}

export async function fetchAdminEditorialTasks() {
  return assertRows(
    await adminRequest(toQuery("editorial_tasks", {
      select: "id,title,status,priority,due_at",
      status: "in.(open,in_progress)",
      order: "due_at.asc.nullslast,created_at.desc",
      limit: "5",
    })),
    "les tâches éditoriales",
  );
}

export async function fetchAdminNotifications() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) throw new Error("Une session administrateur est nécessaire pour lire les notifications.");
  return assertRows(
    await adminRequest(toQuery("user_notifications", {
      select: "id,title,body,notification_type,entity_type,entity_id,read_at,created_at",
      recipient_id: `eq.${admin.id}`,
      order: "created_at.desc",
      limit: "1000",
    })),
    "les notifications administrateur",
  );
}

export async function markAdminNotificationRead(id: string) {
  await adminRequest(toQuery("user_notifications", { id: `eq.${id}` }), {
    method: "PATCH",
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  });
}

export async function markAllAdminNotificationsRead() {
  const admin = await getAuthenticatedAdmin();
  if (!admin) throw new Error("Une session administrateur est nécessaire pour modifier les notifications.");
  await adminRequest(toQuery("user_notifications", {
    recipient_id: `eq.${admin.id}`,
    read_at: "is.null",
  }), {
    method: "PATCH",
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  });
}

export async function createAdminListing(
  listing: SupabaseRow,
  hours: SupabaseRow[],
  payments: string[],
  languages: string[],
  keywords: string[],
) {
  const result = await adminRequest("rpc/admin_create_listing", {
    method: "POST",
    body: JSON.stringify({
      p_listing: listing,
      p_hours: hours,
      p_payments: payments,
      p_languages: languages,
      p_keywords: keywords,
    }),
  });
  if (typeof result !== "string") throw new Error("Supabase n’a pas renvoyé l’identifiant de la fiche.");
  return result;
}

export async function fetchAdminListingDetails(id: string) {
  const [listing, hours, payments, languages, keywords, photos] = await Promise.all([
    adminRequest(toQuery("admin_listings", { select: "*", id: `eq.${id}`, limit: "1" })),
    adminRequest(toQuery("listing_hours", { select: "*", listing_id: `eq.${id}`, order: "day_of_week.asc" })),
    adminRequest(toQuery("listing_payments", { select: "payment_method", listing_id: `eq.${id}` })),
    adminRequest(toQuery("listing_languages", { select: "language", listing_id: `eq.${id}` })),
    adminRequest(toQuery("listing_keywords", { select: "keyword", listing_id: `eq.${id}` })),
    adminRequest(toQuery("listing_photos", {
      select: "storage_path",
      listing_id: `eq.${id}`,
      order: "created_at.desc",
      limit: "1",
    })),
  ]);
  const listingRow = assertRows(listing, "la fiche à modifier")[0];
  if (!listingRow) throw new Error("La fiche à modifier est introuvable.");
  return {
    listing: listingRow,
    hours: assertRows(hours, "les horaires de la fiche"),
    payments: assertRows(payments, "les paiements de la fiche"),
    languages: assertRows(languages, "les langues de la fiche"),
    keywords: assertRows(keywords, "les mots-clés de la fiche"),
    photo: assertRows(photos, "la photo de la fiche")[0] ?? null,
  };
}

export async function updateAdminListing(
  id: string,
  listing: SupabaseRow,
  hours: SupabaseRow[],
  payments: string[],
  languages: string[],
  keywords: string[],
) {
  await adminRequest("rpc/admin_update_listing", {
    method: "POST",
    body: JSON.stringify({
      p_listing_id: id,
      p_listing: listing,
      p_hours: hours,
      p_payments: payments,
      p_languages: languages,
      p_keywords: keywords,
    }),
  });
}

export async function createAdminEvent(event: SupabaseRow) {
  const result = await adminRequest("rpc/admin_create_event", {
    method: "POST",
    body: JSON.stringify({ p_event: event }),
  });
  if (typeof result !== "string") throw new Error("Supabase n’a pas renvoyé l’identifiant de l’événement.");
  return result;
}

export async function updateAdminEvent(id: string, changes: SupabaseRow) {
  await adminRequest("rpc/admin_update_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: id, p_event: changes }),
  });
}

export async function deleteAdminEvent(id: string) {
  await adminRequest("rpc/admin_delete_event", {
    method: "POST",
    body: JSON.stringify({ p_event_id: id }),
  });
}

export async function createAdminJob(job: SupabaseRow) {
  const result: unknown = await adminRequest("rpc/admin_create_job", {
    method: "POST",
    body: JSON.stringify({ p_job: job }),
  });
  if (typeof result !== "string") {
    throw new Error("Supabase n’a pas confirmé la création de l’offre.");
  }
  return { id: result, title: job.title };
}

export async function deleteAdminJob(id: string) {
  await adminRequest("rpc/admin_delete_job", {
    method: "POST",
    body: JSON.stringify({ p_job_id: id }),
  });
}

export async function updateAdminJob(id: string, changes: SupabaseRow) {
  await adminRequest("rpc/admin_update_job", {
    method: "POST",
    body: JSON.stringify({ p_job_id: id, p_job: changes }),
  });
}

export async function setAdminListingStatus(id: string, status: string) {
  await adminRequest("rpc/admin_set_listing_status", {
    method: "POST",
    body: JSON.stringify({
      p_listing_id: id,
      p_status: status,
      p_method: "other",
      p_notes: "Vérification effectuée depuis le tableau de bord.",
    }),
  });
}

export async function deleteAdminListing(id: string) {
  await adminRequest("rpc/admin_delete_listing", {
    method: "POST",
    body: JSON.stringify({ p_listing_id: id }),
  });
}
