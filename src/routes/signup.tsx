import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { AuthLayout, AuthStatus } from "@/components/admin/auth-layout";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Créer un compte — Lubumbashi Connect" },
      { name: "description", content: "Créez un compte Lubumbashi Connect." },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("Le formulaire est complet, mais la création de compte ne peut pas être activée tant qu’un service d’authentification n’est pas configuré.");
  };

  const handleProviderSignup = (provider: "Google" | "GitHub") => {
    setMessage(`L’inscription avec ${provider} sera disponible après la configuration de l’authentification.`);
  };

  return (
    <AuthLayout
      footer={
        <>
          Vous avez déjà un compte ?{" "}
          <Link to="/login" className="font-semibold text-primary hover:brightness-125">Se connecter</Link>
        </>
      }
    >
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Rejoignez la communauté</p>
        <h1 className="mt-2 font-display text-2xl font-bold">Créer un compte</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Inscrivez-vous pour enregistrer vos adresses et contribuer à l’annuaire local.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1.5 text-xs font-medium">
          Nom complet
          <span className="relative block">
            <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              placeholder="Votre nom"
              className="h-11 w-full rounded-none border border-input bg-background pl-10 pr-3 text-sm font-normal outline-none transition placeholder:text-muted-foreground focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
            />
          </span>
        </label>

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
              autoComplete="new-password"
              required
              minLength={8}
              placeholder="8 caractères minimum"
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

        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground">
          <input type="checkbox" name="terms" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--primary)]" />
          <span>J’accepte les conditions d’utilisation et la politique de confidentialité de Lubumbashi Connect.</span>
        </label>

        <button type="submit" className="h-11 w-full rounded-none bg-primary text-sm font-semibold text-primary-foreground transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Créer mon compte
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>OU CONTINUER AVEC</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleProviderSignup("Google")}
          className="inline-flex h-11 items-center justify-center gap-2.5 border border-border bg-background px-4 text-sm font-medium text-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          onClick={() => handleProviderSignup("GitHub")}
          className="inline-flex h-11 items-center justify-center gap-2.5 border border-[#30363d] bg-[#24292f] px-4 text-sm font-medium text-white transition hover:bg-[#30363d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <GitHubIcon />
          GitHub
        </button>
      </div>

      {message && <p role="status" className="mt-4 rounded-none border border-border bg-background px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">{message}</p>}
      <AuthStatus>La création de compte sera disponible après le raccordement du service d’authentification.</AuthStatus>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-7 w-7">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z" />
      <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.1c-1.8 1.2-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.2A20 20 0 0 0 24 44Z" />
      <path fill="#FBBC05" d="M12.8 27.8a12 12 0 0 1 0-7.6V15H5.9a20 20 0 0 0 0 18Z" />
      <path fill="#EA4335" d="M24 12.1c3 0 5.7 1 7.8 3.1l5.9-5.9A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.9 15l6.9 5.2c1.6-4.7 6-8.1 11.2-8.1Z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-7 w-7 fill-current">
      <path d="M12 .9a11.1 11.1 0 0 0-3.5 21.6c.6.1.8-.3.8-.6v-2.1c-3.1.7-3.8-1.3-3.8-1.3-.5-1.3-1.2-1.6-1.2-1.6-1-.7.1-.7.1-.7 1.1.1 1.7 1.1 1.7 1.1 1 1.7 2.6 1.2 3.2.9.1-.7.4-1.2.7-1.5-2.5-.3-5.1-1.3-5.1-5.5 0-1.2.4-2.2 1.1-3-.1-.3-.5-1.4.1-3 0 0 .9-.3 3.1 1.1a10.8 10.8 0 0 1 5.7 0c2.2-1.4 3.1-1.1 3.1-1.1.6 1.6.2 2.7.1 3 .7.8 1.1 1.8 1.1 3 0 4.2-2.6 5.2-5.1 5.5.4.3.8 1 .8 2v3.2c0 .3.2.7.8.6A11.1 11.1 0 0 0 12 .9Z" />
    </svg>
  );
}
