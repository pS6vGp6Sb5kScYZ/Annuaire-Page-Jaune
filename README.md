# Lubumbashi Connect

Annuaire vérifié, agenda, emplois et informations officielles de Lubumbashi.

## Développement

Installez [Bun](https://bun.sh/), puis lancez :

```sh
bun install
bun run dev
```

## Vérifications

```sh
bun run test
bun run lint
bun run build
```

## Déploiement sur Vercel

Le projet utilise TanStack Start avec Nitro pour servir les pages côté serveur.
Dans Vercel, garde le dossier racine du projet comme répertoire racine et la
commande de build `npm run build` (ou `bun run build` si l'installation utilise
Bun). Ne configure pas de répertoire de sortie statique comme `dist` ou
`dist/client` : Nitro génère la sortie serveur nécessaire au rendu des routes.

Ajoute aussi les variables Supabase requises dans les paramètres du projet Vercel
(`VITE_SUPABASE_URL` et `VITE_SUPABASE_PUBLISHABLE_KEY`), puis redéploie.

## Technologies

- TanStack Start
- Nitro
- TypeScript
- React
- Tailwind CSS
