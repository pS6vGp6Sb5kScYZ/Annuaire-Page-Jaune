import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthLayout, AuthStatus } from "@/components/admin/auth-layout";
import { getAuthenticatedAdmin, signInWithPassword } from "@/lib/supabase-auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Connexion — Lubumbashi Connect" },
      { name: "description", content: "Connectez-vous à votre espace Lubumbashi Connect." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const remember = formData.get("remember") === "on";

    try {
      await signInWithPassword(email, password, remember);
      const admin = await getAuthenticatedAdmin();
      if (!admin) {
        setMessage("Connexion réussie, mais ce compte n’a pas le rôle admin. Attribue-lui le rôle « admin » dans public.user_roles, puis reconnecte-toi.");
        return;
      }
      await navigate({ to: "/admin" });
    } catch (error) {
      console.error("Supabase sign-in failed", error);
      setMessage(error instanceof Error ? error.message : "La connexion a échoué. Réessaie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      footer={
        <>
          Vous n’avez pas encore de compte ?{" "}
          <Link to="/signup" className="font-semibold text-primary hover:brightness-125">Créer un compte</Link>
        </>
      }
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Espace membre</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Se connecter</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Accédez à votre espace et retrouvez les services de Lubumbashi Connect.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1.5 text-xs font-medium">
          Adresse e-mail
          <span className="relative block">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="vous@exemple.cd"
              className="h-11 w-full rounded-none border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none transition placeholder:text-muted-foreground focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
            />
          </span>
        </label>

        <label className="block space-y-1.5 text-xs font-medium">
          Mot de passe
          <span className="relative block">
            <LockKeyhole className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              required
              minLength={8}
              placeholder="Au moins 8 caractères"
              className="h-11 w-full rounded-none border border-input bg-background pl-10 pr-11 text-sm font-normal outline-none transition placeholder:text-muted-foreground focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
            />
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-none text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </span>
        </label>

        <div className="flex items-center justify-between gap-3 text-xs">
          <label className="inline-flex items-center gap-2 text-muted-foreground">
            <input type="checkbox" name="remember" className="h-4 w-4 accent-primary" />
            Se souvenir de moi
          </label>
          <button
            type="button"
            onClick={() => setMessage("La réinitialisation du mot de passe n’est pas encore activée. Contacte l’administrateur du site.")}
            className="font-medium text-primary hover:brightness-125"
          >
            Mot de passe oublié ?
          </button>
        </div>

        <button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-none bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-wait disabled:opacity-70">
          {isSubmitting ? "Connexion en cours…" : "Se connecter"}
        </button>
      </form>

      {message && <p role="alert" className="mt-4 rounded-none border border-destructive/40 bg-background px-3 py-2.5 text-xs leading-relaxed text-destructive">{message}</p>}
      <AuthStatus>Connexion sécurisée par Supabase Auth.</AuthStatus>

      <div className="mt-6 border-t border-border pt-5 text-center text-xs text-muted-foreground">
        Vous gérez le site ? <Link to="/admin" className="font-semibold text-primary hover:brightness-125">Retour au dashboard</Link>
      </div>
    </AuthLayout>
  );
}
