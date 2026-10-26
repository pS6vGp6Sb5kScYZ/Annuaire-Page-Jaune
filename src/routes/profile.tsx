import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Mail, MapPin, Save, ShieldCheck, Smartphone, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { AuthLayout, AuthStatus } from "@/components/admin/auth-layout";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Mon profil — Lubumbashi Connect" },
      { name: "description", content: "Gérez votre profil Lubumbashi Connect." },
    ],
  }),
  component: ProfilePage,
});

type ProfileData = {
  name: string;
  email: string;
  phone: string;
  commune: string;
  bio: string;
};

const PROFILE_STORAGE_KEY = "lubumbashi-connect-profile";
const COMMUNES = ["Lubumbashi", "Kampemba", "Katuba", "Kenya", "Kamalondo", "Annexe", "Rwashi"];
const inputClass =
  "h-11 w-full rounded-none border border-input bg-background px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary/70 focus:ring-2 focus:ring-primary/15";

function isProfileData(value: unknown): value is ProfileData {
  if (typeof value !== "object" || value === null) return false;
  return (
    "name" in value &&
    "email" in value &&
    "phone" in value &&
    "commune" in value &&
    "bio" in value &&
    typeof value.name === "string" &&
    typeof value.email === "string" &&
    typeof value.phone === "string" &&
    typeof value.commune === "string" &&
    typeof value.bio === "string"
  );
}

function ProfilePage() {
  const [profile, setProfile] = useState<ProfileData>({
    name: "",
    email: "",
    phone: "",
    commune: COMMUNES[0],
    bio: "",
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!stored) return;
      const parsed: unknown = JSON.parse(stored);
      if (isProfileData(parsed)) setProfile(parsed);
    } catch (loadError) {
      console.error("Impossible de charger le profil local.", loadError);
      setError("Le profil enregistré n’a pas pu être chargé.");
    }
  }, []);

  const updateProfile = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setProfile((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
      setSaved(true);
      setError("");
    } catch (saveError) {
      console.error("Impossible d’enregistrer le profil localement.", saveError);
      setSaved(false);
      setError("Le navigateur n’a pas pu enregistrer ces informations.");
    }
  };

  const initial = profile.name.trim().charAt(0).toLocaleUpperCase("fr") || "L";

  return (
    <AuthLayout wide>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            to="/admin"
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Retour au dashboard
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Compte</p>
          <h1 className="mt-1 font-display text-2xl font-bold">Mon profil</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Gérez vos coordonnées et votre profil.</p>
        </div>
        <button
          form="profile-form"
          type="submit"
          className="inline-flex h-10 items-center gap-2 rounded-none bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
        >
          {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          {saved ? "Enregistré" : "Enregistrer"}
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <section className="flex flex-col items-center justify-center rounded-none border border-border bg-background/60 px-6 py-8 text-center">
          <span className="grid h-20 w-20 place-items-center rounded-none bg-primary text-3xl font-semibold text-primary-foreground shadow-soft">
            {initial}
          </span>
          <h2 className="mt-4 text-base font-semibold">{profile.name || "Votre nom"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{profile.email || "Adresse e-mail non renseignée"}</p>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-none border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Administrateur
          </span>
        </section>

        <form
          id="profile-form"
          onSubmit={handleSubmit}
          className="overflow-hidden rounded-none border border-border bg-background/60"
        >
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Informations personnelles</h2>
            <p className="mt-1 text-xs text-muted-foreground">Mettez à jour les coordonnées associées à votre profil.</p>
          </div>

          <div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
            <ProfileField label="Nom complet" icon={UserRound}>
              <input
                value={profile.name}
                onChange={(event) => updateProfile("name", event.target.value)}
                name="name"
                autoComplete="name"
                required
                minLength={2}
                placeholder="Votre nom"
                className={`${inputClass} pl-10`}
              />
            </ProfileField>
            <ProfileField label="Adresse e-mail" icon={Mail}>
              <input
                value={profile.email}
                onChange={(event) => updateProfile("email", event.target.value)}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="vous@exemple.cd"
                className={`${inputClass} pl-10`}
              />
            </ProfileField>
            <ProfileField label="Téléphone" icon={Smartphone}>
              <input
                value={profile.phone}
                onChange={(event) => updateProfile("phone", event.target.value)}
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+243 ..."
                className={`${inputClass} pl-10`}
              />
            </ProfileField>
            <ProfileField label="Commune" icon={MapPin}>
              <select
                value={profile.commune}
                onChange={(event) => updateProfile("commune", event.target.value)}
                className={`${inputClass} pl-10`}
              >
                {COMMUNES.map((commune) => <option key={commune}>{commune}</option>)}
              </select>
            </ProfileField>
            <label className="space-y-2 text-xs font-medium sm:col-span-2">
              Présentation
              <textarea
                value={profile.bio}
                onChange={(event) => updateProfile("bio", event.target.value)}
                rows={4}
                maxLength={280}
                placeholder="Présentez brièvement votre rôle dans Lubumbashi Connect…"
                className="w-full resize-y rounded-none border border-input bg-background px-3 py-2.5 text-sm font-normal outline-none transition placeholder:text-muted-foreground focus:border-primary/70 focus:ring-2 focus:ring-primary/15"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
            <p role={error ? "alert" : "status"} className="text-xs text-muted-foreground">
              {error || (saved ? "Profil enregistré sur cet appareil." : "Enregistrement local uniquement.")}
            </p>
            <button
              type="submit"
              className="inline-flex h-10 items-center gap-2 rounded-none bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saved ? "Enregistré" : "Enregistrer les modifications"}
            </button>
          </div>
        </form>
      </div>

      <AuthStatus>La connexion à un compte en ligne sera disponible après le raccordement du service d’authentification.</AuthStatus>
    </AuthLayout>
  );
}

function ProfileField({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof UserRound;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2 text-xs font-medium">
      {label}
      <span className="relative block">
        <Icon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        {children}
      </span>
    </label>
  );
}
