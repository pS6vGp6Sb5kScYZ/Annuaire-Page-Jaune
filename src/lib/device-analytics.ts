import { getAdminAccessToken } from "@/lib/supabase-auth";

export const DEVICE_CATEGORIES = [
  "android",
  "mobile_web",
  "desktop",
  "ios",
  "other",
] as const;

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number];

export type DeviceMetric = {
  device: DeviceCategory;
  sessions: number;
};

export type TrafficMetric = {
  date: string;
  sessions: number;
  listingViews: number;
  sessionDurationSeconds: number;
  completedSessions: number;
};

const SESSION_MARKER = "lubumbashi-connect-device-session-recorded";
const SESSION_STARTED_AT = "lubumbashi-connect-device-session-started-at";
const SESSION_DURATION_MARKER = "lubumbashi-connect-device-duration-recorded";
let pendingSessionRequest: Promise<void> | null = null;
const pendingPageViewPaths = new Set<string>();
let lastPageViewPath: string | null = null;
let sessionDurationRecorded = false;
let missingConfigWarningLogged = false;

function isDeviceCategory(value: unknown): value is DeviceCategory {
  return DEVICE_CATEGORIES.some((device) => device === value);
}

function clearSessionMarker() {
  try {
    window.sessionStorage.removeItem(SESSION_MARKER);
  } catch (error) {
    console.error("Device analytics could not clear its session marker", error);
  }
}

function getSupabaseConfig() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    if (!missingConfigWarningLogged) {
      console.error(
        "Device analytics is disabled because the Supabase URL or public key is missing.",
      );
      missingConfigWarningLogged = true;
    }
    return null;
  }
  return { url: url.replace(/\/$/, ""), anonKey };
}

function isPublicAnalyticsPath(pathname: string) {
  return !["/admin", "/login", "/signup", "/profile"].some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function sendAnalyticsEvent(event: "session" | "page_view" | "listing_view") {
  const config = getSupabaseConfig();
  if (!config) return Promise.resolve();

  return fetch(`${config.url}/functions/v1/device-analytics`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event }),
  }).then((response) => {
    if (!response.ok) {
      throw new Error(`Analytics event request failed (${response.status})`);
    }
  });
}

function recordSessionDurationOnExit() {
  if (sessionDurationRecorded || typeof window === "undefined") return;
  sessionDurationRecorded = true;

  try {
    if (window.sessionStorage.getItem(SESSION_DURATION_MARKER) === "recorded") return;
    const startedAt = Number(window.sessionStorage.getItem(SESSION_STARTED_AT));
    if (!Number.isFinite(startedAt) || startedAt <= 0) return;

    const durationSeconds = Math.min(
      86_400,
      Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
    );
    const config = getSupabaseConfig();
    if (!config) return;

    window.sessionStorage.setItem(SESSION_DURATION_MARKER, "recorded");
    void fetch(`${config.url}/functions/v1/device-analytics`, {
      method: "POST",
      headers: {
        apikey: config.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event: "session_duration", durationSeconds }),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`Session duration request failed (${response.status})`);
    }).catch((error: unknown) => {
      try {
        window.sessionStorage.removeItem(SESSION_DURATION_MARKER);
      } catch (storageError) {
        console.error("Device analytics could not clear its duration marker", storageError);
      }
      console.error("Unable to record this device session duration", error);
    });
  } catch (error) {
    console.error("Device analytics could not record session duration", error);
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", recordSessionDurationOnExit);
}

export function recordDeviceSessionOnce(pathname: string): Promise<void> {
  const config = getSupabaseConfig();
  if (!config || typeof window === "undefined" || !isPublicAnalyticsPath(pathname)) return Promise.resolve();
  if (pendingSessionRequest) return pendingSessionRequest;

  let canStoreSessionMarker = true;
  try {
    if (window.sessionStorage.getItem(SESSION_MARKER) === "recorded") return Promise.resolve();
    if (!window.sessionStorage.getItem(SESSION_STARTED_AT)) {
      window.sessionStorage.setItem(SESSION_STARTED_AT, String(Date.now()));
    }
  } catch (error) {
    console.error("Device analytics could not access session storage", error);
    canStoreSessionMarker = false;
  }

  pendingSessionRequest = sendAnalyticsEvent("session")
    .then(() => {
      if (canStoreSessionMarker) {
        try {
          window.sessionStorage.setItem(SESSION_MARKER, "recorded");
        } catch (error) {
          console.error("Device analytics could not save its session marker", error);
        }
      }
    })
    .catch((error: unknown) => {
      if (canStoreSessionMarker) clearSessionMarker();
      console.error("Unable to record this device session", error);
    })
    .finally(() => {
      pendingSessionRequest = null;
    });
  return pendingSessionRequest;
}

export function recordPageView(pathname: string): Promise<void> {
  if (
    typeof window === "undefined"
    || !isPublicAnalyticsPath(pathname)
    || lastPageViewPath === pathname
    || pendingPageViewPaths.has(pathname)
  ) {
    return Promise.resolve();
  }

  const event = /^\/annuaire\/[^/]+\/?$/.test(pathname) ? "listing_view" : "page_view";
  pendingPageViewPaths.add(pathname);

  return sendAnalyticsEvent(event)
    .then(() => {
      lastPageViewPath = pathname;
    })
    .catch((error: unknown) => {
      console.error("Unable to record this page view", error);
    })
    .finally(() => {
      pendingPageViewPaths.delete(pathname);
    });
}

export async function fetchDeviceMetrics(days: number): Promise<DeviceMetric[]> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase URL and anon key are not configured");
  }
  if (![7, 30, 90].includes(days)) {
    throw new Error("Device analytics supports 7, 30, or 90 day periods");
  }

  const accessToken = await getAdminAccessToken();
  if (!accessToken) throw new Error("An administrator session is required to read device analytics");

  const response = await fetch(
    `${config.url}/functions/v1/device-analytics?days=${days}`,
    { headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Device analytics request failed (${response.status})`);
  }

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("devices" in result) || !Array.isArray(result.devices)) {
    throw new Error("Device analytics returned an invalid response");
  }

  const devices = result.devices.map((item): DeviceMetric => {
    if (
      typeof item !== "object"
      || item === null
      || !("device" in item)
      || !isDeviceCategory(item.device)
      || !("sessions" in item)
    ) {
      throw new Error("Device analytics returned an invalid device entry");
    }

    const sessions = Number(item.sessions);
    if (!Number.isSafeInteger(sessions) || sessions < 0) {
      throw new Error("Device analytics returned an invalid session count");
    }

    return { device: item.device, sessions };
  });

  return devices;
}

export async function fetchTrafficMetrics(days: number): Promise<TrafficMetric[]> {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("Supabase URL and anon key are not configured");
  }
  if (![7, 30, 90].includes(days)) {
    throw new Error("Traffic analytics supports 7, 30, or 90 day periods");
  }

  const accessToken = await getAdminAccessToken();
  if (!accessToken) throw new Error("An administrator session is required to read traffic analytics");

  const response = await fetch(
    `${config.url}/functions/v1/device-analytics?view=traffic&days=${days}`,
    { headers: { apikey: config.anonKey, Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    throw new Error(`Traffic analytics request failed (${response.status})`);
  }

  const result: unknown = await response.json();
  if (typeof result !== "object" || result === null || !("metrics" in result) || !Array.isArray(result.metrics)) {
    throw new Error("Traffic analytics returned an invalid response");
  }

  return result.metrics.map((item): TrafficMetric => {
    if (
      typeof item !== "object"
      || item === null
      || !("date" in item)
      || typeof item.date !== "string"
      || !/^\d{4}-\d{2}-\d{2}$/.test(item.date)
      || !("sessions" in item)
      || !("listingViews" in item)
      || !("sessionDurationSeconds" in item)
      || !("completedSessions" in item)
    ) {
      throw new Error("Traffic analytics returned an invalid daily metric");
    }

    const sessions = Number(item.sessions);
    const listingViews = Number(item.listingViews);
    const sessionDurationSeconds = Number(item.sessionDurationSeconds);
    const completedSessions = Number(item.completedSessions);
    if (
      !Number.isSafeInteger(sessions)
      || sessions < 0
      || !Number.isSafeInteger(listingViews)
      || listingViews < 0
      || !Number.isSafeInteger(sessionDurationSeconds)
      || sessionDurationSeconds < 0
      || !Number.isSafeInteger(completedSessions)
      || completedSessions < 0
    ) {
      throw new Error("Traffic analytics returned invalid metric values");
    }

    return {
      date: item.date,
      sessions,
      listingViews,
      sessionDurationSeconds,
      completedSessions,
    };
  });
}
