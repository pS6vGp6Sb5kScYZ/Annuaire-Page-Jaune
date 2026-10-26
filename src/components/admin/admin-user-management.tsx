import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  deleteManagedUser,
  fetchManagedUsers,
  inviteManagedUser,
  reportAdminError,
  setManagedUserDisabled,
  type ManagedAdminUser,
} from "@/lib/admin-users";

const inputClass = "mt-1 h-10 w-full border border-border bg-background px-3 text-sm outline-none focus:border-primary";

function displayDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("fr-FR") : "—";
}

export function AdminUserManagement() {
  const [users, setUsers] = useState<ManagedAdminUser[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [userToDelete, setUserToDelete] = useState<ManagedAdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setUsers(await fetchManagedUsers());
    } catch (cause) {
      console.error("Unable to load managed Supabase users", cause);
      void reportAdminError("admin_users.list", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de charger les comptes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await inviteManagedUser(email.trim(), name.trim());
      setEmail("");
      setName("");
      setNotice("Invitation envoyée. L’utilisateur pourra créer son mot de passe depuis l’e-mail reçu.");
      await refresh();
    } catch (cause) {
      console.error("Unable to invite standard user", cause);
      void reportAdminError("admin_users.invite", cause);
      setError(cause instanceof Error ? cause.message : "Impossible d’envoyer l’invitation.");
    } finally {
      setSaving(false);
    }
  };

  const toggleDisabled = async (user: ManagedAdminUser) => {
    if (!window.confirm(user.disabled
      ? `Réactiver le compte de ${user.email} ?`
      : `Désactiver le compte de ${user.email} ? L’utilisateur ne pourra plus se connecter.`)) return;
    setBusyUserId(user.id);
    setError("");
    setNotice("");
    try {
      const message = await setManagedUserDisabled(user.id, !user.disabled);
      setNotice(message);
      await refresh();
    } catch (cause) {
      console.error("Unable to change managed user status", cause);
      void reportAdminError("admin_users.status", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de modifier ce compte.");
    } finally {
      setBusyUserId("");
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    setBusyUserId(userToDelete.id);
    setError("");
    setNotice("");
    try {
      const message = await deleteManagedUser(userToDelete.id, confirmationEmail);
      setNotice(message);
      setUserToDelete(null);
      setConfirmationEmail("");
      await refresh();
    } catch (cause) {
      console.error("Unable to permanently delete managed user", cause);
      void reportAdminError("admin_users.delete", cause);
      setError(cause instanceof Error ? cause.message : "Impossible de supprimer ce compte.");
    } finally {
      setBusyUserId("");
    }
  };

  return (
    <section id="users" className="scroll-mt-24 border border-border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Sécurité</p>
          <h2 className="mt-1 font-display text-lg font-bold">Gestion des utilisateurs</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Seuls les administrateurs peuvent inviter des utilisateurs standards, désactiver ou supprimer leur compte.
            Les comptes ayant un rôle d’équipe sont protégés.
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading || saving || Boolean(busyUserId)} className="h-9 border border-border px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50">
          Actualiser
        </button>
      </div>

      {error && <p role="alert" className="mt-4 border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {notice && <p role="status" className="mt-4 border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</p>}

      <form onSubmit={submitInvite} className="mt-5 grid gap-3 border border-border p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="block text-xs font-medium">
          Nom complet
          <input required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={inputClass} />
        </label>
        <label className="block text-xs font-medium">
          Adresse e-mail
          <input required type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={saving || loading} className="h-10 bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {saving ? "Envoi…" : "Inviter un utilisateur"}
        </button>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">
        L’invitation est envoyée par e-mail. Configure les URL de redirection autorisées dans Supabase Auth.
      </p>

      {userToDelete && (
        <div className="mt-5 border border-destructive/50 bg-destructive/5 p-4">
          <h3 className="font-semibold text-destructive">Suppression définitive</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Cette action est irréversible. Les données liées par cascade, telles que ses favoris et candidatures, peuvent être supprimées.
            Pour confirmer, saisis l’adresse <strong>{userToDelete.email}</strong>.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              aria-label="Confirmation de l’adresse e-mail à supprimer"
              autoComplete="off"
              value={confirmationEmail}
              onChange={(event) => setConfirmationEmail(event.target.value)}
              className={`${inputClass} max-w-sm`}
            />
            <button type="button" onClick={() => void confirmDelete()} disabled={busyUserId === userToDelete.id || confirmationEmail.trim().toLowerCase() !== userToDelete.email.toLowerCase()} className="h-10 bg-destructive px-4 text-sm font-semibold text-destructive-foreground disabled:opacity-50">
              {busyUserId === userToDelete.id ? "Suppression…" : "Confirmer la suppression"}
            </button>
            <button type="button" onClick={() => { setUserToDelete(null); setConfirmationEmail(""); }} disabled={busyUserId === userToDelete.id} className="h-10 border border-border px-4 text-sm">
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 overflow-x-auto border border-border">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead className="bg-muted/70 text-muted-foreground">
            <tr>
              {["Utilisateur", "Créé le", "État", "Actions"].map((heading) => <th key={heading} className="px-3 py-2.5 font-semibold">{heading}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-3 py-3">
                  <span className="block font-semibold">{user.full_name || "Nom non renseigné"}</span>
                  <span className="text-muted-foreground">{user.email}</span>
                </td>
                <td className="px-3 py-3">{displayDate(user.created_at)}</td>
                <td className="px-3 py-3">
                  <span className={user.is_staff ? "text-primary" : user.disabled ? "text-destructive" : "text-emerald-400"}>
                    {user.is_staff ? "Compte d’équipe protégé" : user.disabled ? "Désactivé" : user.confirmed_at ? "Actif" : "Invitation en attente"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {user.is_staff ? (
                    <span className="text-muted-foreground">Actions réservées</span>
                  ) : (
                    <div className="flex gap-2">
                      <button type="button" disabled={Boolean(busyUserId) || saving} onClick={() => void toggleDisabled(user)} className="h-8 border border-border px-2.5 hover:bg-muted disabled:opacity-50">
                        {busyUserId === user.id ? "…" : user.disabled ? "Réactiver" : "Désactiver"}
                      </button>
                      <button type="button" disabled={Boolean(busyUserId) || saving} onClick={() => { setUserToDelete(user); setConfirmationEmail(""); setError(""); }} className="h-8 border border-destructive/40 px-2.5 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                        Supprimer
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Aucun compte utilisateur à afficher.</td></tr>
            )}
            {loading && <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Chargement des comptes…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
