const configuredOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  ...configuredOrigins,
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabasePublicKey =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const deviceCategories = ["android", "mobile_web", "desktop", "ios", "other"] as const;
type DeviceCategory = (typeof deviceCategories)[number];

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

function jsonResponse(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function classifyDevice(request: Request): DeviceCategory {
  const userAgent = request.headers.get("user-agent") ?? "";
  const platform = request.headers.get("sec-ch-ua-platform") ?? "";
  if (/android/i.test(`${platform} ${userAgent}`)) return "android";
  if (/ios|iphone|ipad|ipod/i.test(`${platform} ${userAgent}`)) return "ios";
  if (request.headers.get("sec-ch-ua-mobile") === "?1" || /mobile|tablet/i.test(userAgent)) {
    return "mobile_web";
  }
  if (/windows|macintosh|x11|linux/i.test(`${platform} ${userAgent}`)) return "desktop";
  return "other";
}

function isDeviceCategory(value: unknown): value is DeviceCategory {
  return deviceCategories.some((device) => device === value);
}

async function callDatabaseRpc(name: string, parameters: Record<string, unknown>) {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Edge Function secrets are not configured");
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(parameters),
  });

  if (!response.ok) {
    const details = await response.text();
    console.error(`Database RPC ${name} failed (${response.status}): ${details}`);
    throw new Error("The analytics database request failed");
  }

  return response;
}

async function isAuthenticatedAdmin(request: Request) {
  if (!supabaseUrl || !supabasePublicKey || !serviceRoleKey) {
    throw new Error("Supabase Edge Function secrets are not configured");
  }

  const authorization = request.headers.get("authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return false;

  const headers = {
    apikey: supabasePublicKey,
    Authorization: `Bearer ${accessToken}`,
  };
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers });
  if (userResponse.status === 401 || userResponse.status === 403) return false;
  if (!userResponse.ok) {
    console.error(`Supabase user verification failed (${userResponse.status})`);
    throw new Error("Unable to verify the analytics reader");
  }

  const roleResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/has_staff_role`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ required_roles: ["admin"] }),
  });
  if (roleResponse.status === 401 || roleResponse.status === 403) return false;
  if (!roleResponse.ok) {
    console.error(`Supabase admin-role check failed (${roleResponse.status})`);
    throw new Error("Unable to verify the analytics reader role");
  }

  const hasAdminRole: unknown = await roleResponse.json();
  if (typeof hasAdminRole !== "boolean") {
    throw new Error("Supabase returned an invalid admin-role response");
  }

  return hasAdminRole;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response("Origin is not allowed", { status: 403 });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (request.method === "POST") {
    try {
      const body: unknown = await request.json();
      if (typeof body !== "object" || body === null || !("event" in body)) {
        return jsonResponse({ error: "Invalid analytics event" }, 400, origin);
      }

      if (body.event === "session") {
        const device = classifyDevice(request);
        await callDatabaseRpc("record_device_session", { p_device: device });
      } else if (body.event === "session_duration") {
        if (
          !("durationSeconds" in body)
          || typeof body.durationSeconds !== "number"
          || !Number.isInteger(body.durationSeconds)
          || body.durationSeconds < 1
          || body.durationSeconds > 86_400
        ) {
          return jsonResponse({ error: "Invalid session duration" }, 400, origin);
        }
        await callDatabaseRpc("record_session_duration", {
          p_duration_seconds: body.durationSeconds,
        });
      } else if (body.event === "page_view" || body.event === "listing_view") {
        await callDatabaseRpc("record_traffic_event", { p_event: body.event });
      } else {
        return jsonResponse({ error: "Unsupported analytics event" }, 400, origin);
      }

      return jsonResponse({ recorded: true }, 202, origin);
    } catch (error) {
      console.error("Unable to record device analytics", error);
      return jsonResponse({ error: "Unable to record analytics" }, 500, origin);
    }
  }

  if (request.method === "GET") {
    try {
      if (!(await isAuthenticatedAdmin(request))) {
        return jsonResponse({ error: "Administrator authentication is required" }, 401, origin);
      }
    } catch (error) {
      console.error("Unable to authorize analytics reader", error);
      return jsonResponse({ error: "Unable to authorize analytics reader" }, 503, origin);
    }

    const days = Number(new URL(request.url).searchParams.get("days"));
    if (![7, 30, 90].includes(days)) {
      return jsonResponse({ error: "Choose a 7, 30, or 90 day period" }, 400, origin);
    }

    try {
      const view = new URL(request.url).searchParams.get("view") ?? "devices";
      if (view === "traffic") {
        const response = await callDatabaseRpc("read_public_traffic_metrics", { p_days: days });
        const rows: unknown = await response.json();
        if (!Array.isArray(rows)) {
          throw new Error("The analytics database returned an invalid response");
        }
        const metrics = rows.map((value) => {
          if (
            typeof value !== "object"
            || value === null
            || !("metric_date" in value)
            || typeof value.metric_date !== "string"
            || !("sessions" in value)
            || !("listing_views" in value)
            || !("session_duration_seconds" in value)
            || !("completed_sessions" in value)
          ) {
            throw new Error("The analytics database returned an invalid traffic entry");
          }
          const sessions = Number(value.sessions);
          const listingViews = Number(value.listing_views);
          const sessionDurationSeconds = Number(value.session_duration_seconds);
          const completedSessions = Number(value.completed_sessions);
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
            throw new Error("The analytics database returned invalid traffic counts");
          }
          return {
            date: value.metric_date,
            sessions,
            listingViews,
            sessionDurationSeconds,
            completedSessions,
          };
        });
        return jsonResponse({ metrics }, 200, origin);
      }
      if (view !== "devices") {
        return jsonResponse({ error: "Unsupported analytics view" }, 400, origin);
      }

      const response = await callDatabaseRpc("read_public_device_metrics", { p_days: days });
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) {
        throw new Error("The analytics database returned an invalid response");
      }
      const totals = new Map<DeviceCategory, number>(
        deviceCategories.map((device) => [device, 0]),
      );

      for (const value of rows) {
        if (
          typeof value !== "object"
          || value === null
          || !("device" in value)
          || !isDeviceCategory(value.device)
          || !("sessions" in value)
        ) {
          throw new Error("The analytics database returned an unknown device category");
        }
        const sessions = Number(value.sessions);
        if (!Number.isSafeInteger(sessions) || sessions < 0) {
          throw new Error("The analytics database returned an invalid session count");
        }
        totals.set(value.device, sessions);
      }

      return jsonResponse(
        { devices: deviceCategories.map((device) => ({ device, sessions: totals.get(device) ?? 0 })) },
        200,
        origin,
      );
    } catch (error) {
      console.error("Unable to read device analytics", error);
      return jsonResponse({ error: "Unable to load analytics" }, 500, origin);
    }
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
