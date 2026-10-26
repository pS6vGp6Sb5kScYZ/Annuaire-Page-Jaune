const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type AdminUser = {
  id: string;
  email?: string;
  created_at?: string;
  confirmed_at?: string | null;
  email_confirmed_at?: string | null;
  banned_until?: string | null;
  user_metadata?: Record<string, unknown>;
};

type UserRole = { user_id: string; role: string };
type UserProfile = { id: string; full_name: string };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new Error("La configuration serveur Supabase de la fonction admin-users est incomplète.");
  }
  return { supabaseUrl: supabaseUrl.replace(/\/$/, ""), anonKey, serviceRoleKey };
}

async function errorMessage(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (isRecord(body)) {
    for (const key of ["message", "msg", "error_description", "error"]) {
      if (typeof body[key] === "string") return body[key];
    }
  }
  return `Supabase a refusé l’opération (${response.status}).`;
}

async function requireAdmin(request: Request) {
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Une session administrateur est requise." }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const { supabaseUrl, anonKey } = getConfig();
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authorization },
  });
  if (!userResponse.ok) {
    throw new Response(JSON.stringify({ error: "La session Supabase est invalide ou expirée." }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const user: unknown = await userResponse.json();
  if (!isRecord(user) || typeof user.id !== "string") {
    throw new Error("Supabase a renvoyé un utilisateur invalide.");
  }

  const roleResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/has_staff_role`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ required_roles: ["admin"] }),
  });
  if (!roleResponse.ok) throw new Error(await errorMessage(roleResponse));
  if (await roleResponse.json() !== true) {
    throw new Response(JSON.stringify({ error: "Seul un administrateur peut gérer les comptes." }), {
      status: 403,
      headers: corsHeaders,
    });
  }

  return { userId: user.id, supabaseUrl, serviceRoleKey: getConfig().serviceRoleKey };
}

async function serviceRequest(
  config: { supabaseUrl: string; serviceRoleKey: string },
  path: string,
  init: RequestInit = {},
) {
  const response = await fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return null;
  const responseBody = await response.text();
  if (!responseBody) return null;
  try {
    return JSON.parse(responseBody) as unknown;
  } catch {
    throw new Error("Supabase a renvoyé une réponse invalide à la fonction admin-users.");
  }
}

async function recordActivity(
  config: { supabaseUrl: string; serviceRoleKey: string; userId: string },
  action: "INSERT" | "UPDATE" | "DELETE" | "ERROR",
  entityType: string,
  entityId: string | null,
  summary: string,
) {
  await serviceRequest(config, "/rest/v1/admin_activity_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      actor_id: config.userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      summary: summary.slice(0, 500),
    }),
  });
}

function safeErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [masqué]")
    .replace(/\b(sb_(?:publishable|secret)_[A-Za-z0-9_-]+)\b/g, "[clé masquée]")
    .slice(0, 500);
}

async function listUsers(config: { supabaseUrl: string; serviceRoleKey: string }) {
  const users: AdminUser[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result: unknown = await serviceRequest(
      config,
      `/auth/v1/admin/users?page=${page}&per_page=1000`,
    );
    if (!isRecord(result) || !Array.isArray(result.users)) {
      throw new Error("Supabase a renvoyé une liste de comptes invalide.");
    }
    const pageUsers = result.users.filter(
      (value): value is AdminUser => isRecord(value) && typeof value.id === "string",
    );
    users.push(...pageUsers);
    if (pageUsers.length < 1000) break;
  }

  const [rolesResult, profilesResult] = await Promise.all([
    serviceRequest(config, "/rest/v1/user_roles?select=user_id,role"),
    serviceRequest(config, "/rest/v1/profiles?select=id,full_name"),
  ]);
  if (!Array.isArray(rolesResult) || !Array.isArray(profilesResult)) {
    throw new Error("Supabase a renvoyé des données de profil ou de rôle invalides.");
  }
  const roles = rolesResult as UserRole[];
  const profiles = profilesResult as UserProfile[];
  const rolesByUser = new Set(roles.map((role) => role.user_id));
  const profilesByUser = new Map(profiles.map((profile) => [profile.id, profile.full_name]));

  return users
    .filter((user) => Boolean(user.email))
    .map((user) => ({
      id: user.id,
      email: user.email ?? "",
      full_name: profilesByUser.get(user.id)
        || (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : ""),
      created_at: user.created_at ?? "",
      confirmed_at: user.email_confirmed_at ?? user.confirmed_at ?? null,
      disabled: Boolean(user.banned_until && Date.parse(user.banned_until) > Date.now()),
      is_staff: rolesByUser.has(user.id),
    }))
    .sort((left, right) => left.email.localeCompare(right.email));
}

function parseRequestBody(value: unknown) {
  if (!isRecord(value) || typeof value.action !== "string") {
    throw new Error("La demande de gestion de compte est invalide.");
  }
  return value;
}

function validateTargetId(value: unknown) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error("L’identifiant du compte est invalide.");
  }
  return value;
}

async function getTargetUser(config: { supabaseUrl: string; serviceRoleKey: string }, userId: string) {
  const result: unknown = await serviceRequest(
    config,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
  );
  if (!isRecord(result) || typeof result.id !== "string") {
    throw new Error("Le compte demandé est introuvable.");
  }
  const user = result as AdminUser;
  if (!user.email) throw new Error("Ce compte n’a pas d’adresse e-mail gérable.");

  const rolesResult = await serviceRequest(
    config,
    `/rest/v1/user_roles?select=role&user_id=eq.${encodeURIComponent(userId)}`,
  );
  if (Array.isArray(rolesResult) && rolesResult.length > 0) {
    throw new Error("Par sécurité, cette fonction ne peut gérer que les utilisateurs standards, sans rôle d’équipe.");
  }
  return user;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Méthode non autorisée." }, 405);

  let actor: Awaited<ReturnType<typeof requireAdmin>> | null = null;
  let requestedAction = "unknown";
  try {
    actor = await requireAdmin(request);
    const body = parseRequestBody(await request.json());
    requestedAction = body.action;

    if (body.action === "list") {
      return jsonResponse({ users: await listUsers(actor) });
    }

    if (body.action === "report_error") {
      const source = typeof body.source === "string" ? body.source.trim().slice(0, 120) : "";
      const message = safeErrorMessage(body.message);
      if (!source || !message || message === "[object Object]") {
        return jsonResponse({ error: "La source et le message de l’erreur sont requis." }, 400);
      }
      await recordActivity(actor, "ERROR", "application_error", null, `${source} — ${message}`);
      return jsonResponse({ message: "Erreur enregistrée dans les notifications admin." }, 201);
    }

    if (body.action === "invite") {
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        return jsonResponse({ error: "Saisis une adresse e-mail valide." }, 400);
      }
      if (fullName.length < 2 || fullName.length > 120) {
        return jsonResponse({ error: "Le nom doit contenir entre 2 et 120 caractères." }, 400);
      }

      const invited: unknown = await serviceRequest(actor, "/auth/v1/invite", {
        method: "POST",
        body: JSON.stringify({ email, data: { full_name: fullName } }),
      });
      const invitedUserId = isRecord(invited) && typeof invited.id === "string" ? invited.id : null;
      await recordActivity(actor, "INSERT", "users", invitedUserId, `Invitation envoyée à ${email}`);
      return jsonResponse({ message: "Invitation envoyée." }, 201);
    }

    const targetId = validateTargetId(body.user_id);
    if (targetId === actor.userId) {
      return jsonResponse({ error: "Tu ne peux pas désactiver ni supprimer ton propre compte depuis cette page." }, 400);
    }
    const target = await getTargetUser(actor, targetId);
    const targetPath = `/auth/v1/admin/users/${encodeURIComponent(targetId)}`;

    if (body.action === "disable" || body.action === "enable") {
      await serviceRequest(actor, targetPath, {
        method: "PUT",
        body: JSON.stringify({ ban_duration: body.action === "disable" ? "876000h" : "none" }),
      });
      await recordActivity(
        actor,
        "UPDATE",
        "users",
        targetId,
        `Compte ${body.action === "disable" ? "désactivé" : "réactivé"} : ${target.email}`,
      );
      return jsonResponse({ message: body.action === "disable" ? "Compte désactivé." : "Compte réactivé." });
    }

    if (body.action === "delete") {
      const confirmation = typeof body.confirm_email === "string" ? body.confirm_email.trim().toLowerCase() : "";
      if (confirmation !== target.email.trim().toLowerCase()) {
        return jsonResponse({ error: "L’adresse e-mail de confirmation ne correspond pas à ce compte." }, 400);
      }
      await serviceRequest(actor, targetPath, { method: "DELETE" });
      await recordActivity(actor, "DELETE", "users", targetId, `Compte supprimé : ${target.email}`);
      return jsonResponse({ message: "Compte supprimé définitivement." });
    }

    return jsonResponse({ error: "Action de gestion inconnue." }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Admin user management failed", error);
    if (actor && requestedAction !== "report_error") {
      try {
        await recordActivity(
          actor,
          "ERROR",
          "application_error",
          null,
          `admin-users/${requestedAction} — ${safeErrorMessage(error)}`,
        );
      } catch (loggingError) {
        console.error("Unable to record admin user management error", loggingError);
      }
    }
    return jsonResponse({
      error: error instanceof Error ? error.message : "Impossible de gérer ce compte.",
    }, 500);
  }
});
