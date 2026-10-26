type SupabaseUser = {
  id: string;
  email?: string;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: SupabaseUser;
};

type AuthResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: SupabaseUser;
};

const SESSION_KEY = "lubumbashi-connect-auth-session";
const ADMIN_CHECK_CACHE_MS = 5_000;
let cachedAdmin: { user: SupabaseUser; expiresAt: number } | null = null;
let adminVerification: Promise<SupabaseUser | null> | null = null;
let authCacheVersion = 0;

function invalidateAdminCache() {
  authCacheVersion += 1;
  cachedAdmin = null;
  adminVerification = null;
}

export function getSupabaseApiConfig() {
  const url =
    import.meta.env.VITE_SUPABASE_URL ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "La configuration Supabase est absente. Vérifie l’URL et la clé publique (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) dans .env.local, puis redémarre Vite.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("L’URL Supabase est invalide. Vérifie qu’elle ressemble à https://<project-ref>.supabase.co.");
  }
  const isLocalSupabase =
    parsedUrl.protocol === "http:" &&
    (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1");
  if (parsedUrl.protocol !== "https:" && !isLocalSupabase) {
    throw new Error("L’URL Supabase doit utiliser HTTPS (HTTP est autorisé uniquement pour Supabase local).");
  }

  return { url: parsedUrl.origin, key };
}

function getConfig() {
  return getSupabaseApiConfig();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAuthResponse(value: unknown): AuthResponse {
  if (
    !isRecord(value) ||
    typeof value.access_token !== "string" ||
    typeof value.refresh_token !== "string" ||
    typeof value.expires_in !== "number" ||
    typeof value.token_type !== "string" ||
    !isRecord(value.user) ||
    typeof value.user.id !== "string"
  ) {
    throw new Error("Supabase a renvoyé une réponse d’authentification invalide.");
  }

  return {
    access_token: value.access_token,
    refresh_token: value.refresh_token,
    expires_in: value.expires_in,
    token_type: value.token_type,
    user: {
      id: value.user.id,
      ...(typeof value.user.email === "string" ? { email: value.user.email } : {}),
    },
  };
}

function sessionFromResponse(response: AuthResponse): AuthSession {
  return {
    ...response,
    expires_at: Math.floor(Date.now() / 1000) + response.expires_in,
  };
}

function getStorage(storage: "local" | "session") {
  return storage === "local" ? window.localStorage : window.sessionStorage;
}

function readSession(): { session: AuthSession; storage: "local" | "session" } | null {
  for (const storageName of ["local", "session"] as const) {
    let raw: string | null;
    try {
      raw = getStorage(storageName).getItem(SESSION_KEY);
    } catch (error) {
      console.error("Unable to read the Supabase session from browser storage", error);
      throw new Error("Impossible de lire la session dans ce navigateur.");
    }
    if (!raw) continue;

    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        isRecord(parsed) &&
        typeof parsed.access_token === "string" &&
        typeof parsed.refresh_token === "string" &&
        typeof parsed.expires_at === "number" &&
        typeof parsed.token_type === "string" &&
        isRecord(parsed.user) &&
        typeof parsed.user.id === "string"
      ) {
        return {
          session: {
            access_token: parsed.access_token,
            refresh_token: parsed.refresh_token,
            expires_at: parsed.expires_at,
            token_type: parsed.token_type,
            user: {
              id: parsed.user.id,
              ...(typeof parsed.user.email === "string" ? { email: parsed.user.email } : {}),
            },
          },
          storage: storageName,
        };
      }
    } catch (error) {
      console.error("Unable to parse the saved Supabase session", error);
    }

    try {
      getStorage(storageName).removeItem(SESSION_KEY);
    } catch (error) {
      console.error("Unable to remove an invalid Supabase session", error);
      throw new Error("Impossible de nettoyer la session invalide du navigateur.");
    }
  }

  return null;
}

function saveSession(session: AuthSession, remember: boolean, invalidateAuthorization = true) {
  if (invalidateAuthorization) invalidateAdminCache();
  const target: "local" | "session" = remember ? "local" : "session";
  const other: "local" | "session" = remember ? "session" : "local";

  try {
    getStorage(target).setItem(SESSION_KEY, JSON.stringify(session));
    getStorage(other).removeItem(SESSION_KEY);
  } catch (error) {
    console.error("Unable to save the Supabase session", error);
    throw new Error("Connexion réussie, mais la session n’a pas pu être enregistrée dans ce navigateur.");
  }
}

async function readError(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (isRecord(body)) {
    for (const key of ["msg", "message", "error_description", "error"]) {
      if (typeof body[key] === "string") return body[key];
    }
  }
  return `Erreur Supabase (${response.status}).`;
}

async function authFetch(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Impossible de joindre Supabase. Vérifie l’URL du projet, la connexion Internet et les paramètres réseau.");
    }
    throw error;
  }
}

export async function signInWithPassword(email: string, password: string, remember: boolean) {
  const { url, key } = getConfig();
  const response = await authFetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const detail = await readError(response);
    if (detail.toLocaleLowerCase("en").includes("email not confirmed")) {
      throw new Error("Confirme ton adresse e-mail avant de te connecter.");
    }
    if (response.status === 400 || response.status === 401) {
      throw new Error("Adresse e-mail ou mot de passe incorrect.");
    }
    throw new Error(detail);
  }

  const session = sessionFromResponse(parseAuthResponse(await response.json()));
  saveSession(session, remember);
}

export async function getAuthenticatedUser(): Promise<SupabaseUser | null> {
  const saved = readSession();
  if (!saved) return null;

  let session = saved.session;
  const { url, key } = getConfig();
  if (session.expires_at <= Math.floor(Date.now() / 1000) + 30) {
    const refreshResponse = await authFetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });

    if (!refreshResponse.ok) {
      if (refreshResponse.status === 400 || refreshResponse.status === 401) {
        clearSession();
        return null;
      }
      throw new Error(await readError(refreshResponse));
    }

    session = sessionFromResponse(parseAuthResponse(await refreshResponse.json()));
    saveSession(session, saved.storage === "local", false);
  }

  const userResponse = await authFetch(`${url}/auth/v1/user`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (userResponse.status === 401) {
    clearSession();
    return null;
  }
  if (!userResponse.ok) throw new Error(await readError(userResponse));

  const user: unknown = await userResponse.json();
  if (!isRecord(user) || typeof user.id !== "string") {
    throw new Error("Supabase a renvoyé un profil utilisateur invalide.");
  }

  return {
    id: user.id,
    ...(typeof user.email === "string" ? { email: user.email } : {}),
  };
}

async function verifyAuthenticatedAdmin(): Promise<SupabaseUser | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const saved = readSession();
  if (!saved) return null;

  const { url, key } = getConfig();
  const response = await authFetch(`${url}/rest/v1/rpc/has_staff_role`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${saved.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ required_roles: ["admin"] }),
  });

  if (response.status === 401) {
    clearSession();
    return null;
  }
  if (!response.ok) throw new Error(await readError(response));

  const hasAdminRole: unknown = await response.json();
  if (typeof hasAdminRole !== "boolean") {
    throw new Error("Supabase a renvoyé une réponse de rôle invalide.");
  }

  return hasAdminRole ? user : null;
}

export async function getAuthenticatedAdmin(): Promise<SupabaseUser | null> {
  if (cachedAdmin && cachedAdmin.expiresAt > Date.now()) return cachedAdmin.user;
  if (adminVerification) return adminVerification;

  const version = authCacheVersion;
  const verification = verifyAuthenticatedAdmin();
  adminVerification = verification;
  try {
    const user = await verification;
    if (user && version === authCacheVersion) {
      const session = readSession();
      if (session) {
        cachedAdmin = {
          user,
          expiresAt: Math.min(Date.now() + ADMIN_CHECK_CACHE_MS, session.session.expires_at * 1000 - 30_000),
        };
      }
    }
    return user;
  } finally {
    if (adminVerification === verification) adminVerification = null;
  }
}

export async function getAdminAccessToken(): Promise<string | null> {
  const user = await getAuthenticatedAdmin();
  if (!user) return null;
  return readSession()?.session.access_token ?? null;
}

export function clearSession() {
  invalidateAdminCache();
  for (const storageName of ["local", "session"] as const) {
    try {
      getStorage(storageName).removeItem(SESSION_KEY);
    } catch (error) {
      console.error("Unable to clear the Supabase session from browser storage", error);
      throw new Error("Impossible de fermer la session dans ce navigateur.");
    }
  }
}

export async function signOut() {
  const saved = readSession();
  clearSession();
  if (!saved) return;

  const { url, key } = getConfig();
  const response = await authFetch(`${url}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${saved.session.access_token}`,
    },
  });

  if (!response.ok) throw new Error(await readError(response));
}
