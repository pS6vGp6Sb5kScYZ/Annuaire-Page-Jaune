import { getAdminAccessToken, getSupabaseApiConfig } from "@/lib/supabase-auth";

export type ManagedAdminUser = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  confirmed_at: string | null;
  disabled: boolean;
  is_staff: boolean;
};

type UserManagementResponse = {
  error?: string;
  message?: string;
  users?: ManagedAdminUser[];
};

async function userManagementRequest(body: Record<string, string>) {
  const { url, key } = getSupabaseApiConfig();
  const accessToken = await getAdminAccessToken();
  if (!accessToken) throw new Error("Une session administrateur est nécessaire pour gérer les comptes.");

  let response: Response;
  try {
    response = await fetch(`${url}/functions/v1/admin-users`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Impossible de joindre Supabase. Vérifie ta connexion réseau.");
    }
    throw error;
  }

  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
        ? result.error
        : `La gestion des comptes a échoué (${response.status}).`;
    throw new Error(message);
  }
  if (typeof result !== "object" || result === null) {
    throw new Error("La fonction de gestion des comptes a renvoyé une réponse invalide.");
  }
  return result as UserManagementResponse;
}

export async function fetchManagedUsers() {
  const result = await userManagementRequest({ action: "list" });
  if (!Array.isArray(result.users)) {
    throw new Error("La fonction de gestion des comptes n’a pas renvoyé la liste des utilisateurs.");
  }
  return result.users;
}

export async function inviteManagedUser(email: string, fullName: string) {
  const result = await userManagementRequest({ action: "invite", email, full_name: fullName });
  if (typeof result.message !== "string") {
    throw new Error("Supabase n’a pas confirmé l’envoi de l’invitation.");
  }
  return result.message;
}

export async function setManagedUserDisabled(userId: string, disabled: boolean) {
  const result = await userManagementRequest({
    action: disabled ? "disable" : "enable",
    user_id: userId,
  });
  if (typeof result.message !== "string") {
    throw new Error("Supabase n’a pas confirmé le changement de statut du compte.");
  }
  return result.message;
}

export async function deleteManagedUser(userId: string, confirmEmail: string) {
  const result = await userManagementRequest({
    action: "delete",
    user_id: userId,
    confirm_email: confirmEmail,
  });
  if (typeof result.message !== "string") {
    throw new Error("Supabase n’a pas confirmé la suppression du compte.");
  }
  return result.message;
}

export async function reportAdminError(source: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message || message === "[object Object]") return;
  try {
    await userManagementRequest({
      action: "report_error",
      source: source.slice(0, 120),
      message: message.slice(0, 500),
    });
  } catch (reportError) {
    console.error("Unable to report dashboard error to Supabase", reportError);
  }
}
