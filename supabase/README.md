# Base de données — Lubumbashi Connect

Le schéma PostgreSQL de l'application est versionné dans `supabase/migrations/`.
Il se compose de dix-huit migrations, à appliquer dans l'ordre chronologique :

- `20261022090000_directory_foundation.sql` : catégories, fiches, horaires,
  coordonnées, provenance, consentement professionnel, vérification, audit et
  vue publique de l'annuaire.
- `20261023090000_accounts_and_dashboard.sql` : profils, rôles, favoris, avis,
  agenda public, offres, candidatures, tâches, calendrier éditorial,
  notifications, journal du dashboard, indicateurs et informations pratiques.
- `20261024010000_device_analytics.sql` : fonctions sécurisées d'enregistrement
  et de lecture des statistiques agrégées par appareil.
- `20261024150000_remove_demo_listings.sql` : supprime les fiches de démonstration
  et leurs entrées de journal d'audit, sans supprimer les catégories.
- `20261024160000_admin_content_workflows.sql` : ajoute la vue publique complète
  des fiches, la vue publique des offres avec leur contact de candidature et les
  fonctions sécurisées de création, modification et vérification des fiches
  par un administrateur.
- `20261025113000_admin_activity_notifications.sql` : transforme les activités
  du journal en notifications persistantes pour les administrateurs et ajoute
  le suivi des modifications de fiches, candidatures, rôles, profils et favoris.
- `20261025113200_admin_dashboard_listing_access.sql` : réserve la vue
  d’administration des fiches au rôle `admin`, sans accorder aux comptes
  ordinaires un accès aux colonnes internes de `listings`.
- `20261025115400_remove_example_listing_records.sql` : supprime les fiches
  explicitement marquées comme exemples, leurs entrées d’audit, d’activité et
  leurs notifications, sans toucher aux fiches réelles ni aux catégories.
- `20261025120500_admin_listing_delete.sql` : réserve le changement de statut
  d’une fiche de test aux enregistrements explicitement sourcés `example` et
  permet à un administrateur de supprimer une fiche et ses informations
  associées.
- `20261025122500_seed_test_content.sql` : crée un jeu public de données
  explicitement marquées « TEST » — une fiche par sous-catégorie, quatre
  événements et une offre — pour vérifier l’affichage et la gestion.
- `20261025122600_admin_event_job_delete.sql` : autorise uniquement un
  administrateur à supprimer les événements et les offres depuis le dashboard.
- `20261025125500_remove_test_content.sql` : supprime les fiches, événements,
  offres fictifs explicitement marqués comme exemples, ainsi que leurs avis,
  journaux d’activité, notifications, vérifications et candidatures associées.
- `20261025132000_dashboard_functionality.sql` : active la mesure agrégée de
  durée des sessions et l’API protégée d’activité récente du dashboard.
- `20261025140000_admin_event_workflows.sql` : ajoute des fonctions sécurisées
  de création et de modification des événements par un administrateur.
- `20261025150000_admin_job_workflows.sql` : ajoute des fonctions sécurisées
  de création et de modification des offres publiées par un administrateur.
- `20261025170000_directory_transport_restaurant_categories.sql` : ajoute la
  catégorie Transport et mobilité et des sous-catégories pour le transport et
  la restauration. Les sous-catégories Santé (dont hôpitaux, cliniques et
  pharmacies) et Commerces (dont supermarchés et marchés) existaient déjà.
- `20261025171000_seed_osm_directory_records.sql` : importe douze fiches
  référencées dans OpenStreetMap (supermarchés, hôtel, établissements scolaires,
  arrêts de bus et aéroport) initialement au statut `pending`.
- `20261025172000_public_listing_source_attribution.sql` : expose la provenance
  des fiches dans les détails publics afin d’afficher l’attribution OpenStreetMap.
  Les données OpenStreetMap sont sous licence ODbL. Les fiches importées peuvent
  manquer de contacts et d’horaires; confirmer ces détails avant de les compléter.

La première migration insère les catégories et sous-catégories nécessaires à
l'annuaire, mais ne crée aucune fiche fictive. La migration de nettoyage
supprime aussi les anciennes fiches qui auraient été marquées comme exemples.
Les catégories et sous-catégories sont conservées comme référentiel pour les
données réelles.
L'interface publique n'affiche plus les fiches, événements ou promotions
statiques de démonstration.

La migration `20261025122500_seed_test_content.sql` est conservée dans
l'historique pour respecter les migrations déjà appliquées. La migration
suivante `20261025125500_remove_test_content.sql` supprime ses données de test
ainsi que les autres enregistrements explicitement marqués comme exemples.
L'application complète de la séquence laisse les catégories, le schéma et les
fonctionnalités en place, sans ces contenus fictifs.

Pour nettoyer un projet où les migrations précédentes sont déjà appliquées,
exécute uniquement `20261025125500_remove_test_content.sql` dans le SQL Editor
Supabase. Cette suppression est irréversible et ne cible que les lignes
`is_example = true` ainsi que les journaux et données qui leur sont liés.

## Initialiser Supabase

1. Créer un projet Supabase et garder son mot de passe de base de données dans un
   gestionnaire de secrets.
2. Installer la [CLI Supabase](https://supabase.com/docs/guides/cli), puis se
   connecter depuis la racine du projet :

   ```sh
   supabase login
   supabase link --project-ref <project-ref>
   supabase db push
   ```

3. Pour valider les migrations sur une instance locale avant le projet hébergé :

   ```sh
   supabase start
   supabase db reset
   ```

Si tu gères le projet uniquement depuis le navigateur, ouvre **SQL Editor** dans
Supabase, puis exécute le contenu de chaque migration qui n'a pas encore été
appliquée, dans l'ordre chronologique. Pour le raccordement des formulaires
actuels, la migration `20261024160000_admin_content_workflows.sql` est requise.

4. Dans **Authentication → URL Configuration**, définir l'URL du site et les
   URL de redirection autorisées pour le développement et la production.
5. Dans **Authentication → Providers**, activer uniquement les méthodes de
   connexion réellement utilisées. L'inscription par e-mail peut exiger la
   confirmation d'adresse selon le réglage choisi.

## Comptes, connexion et rôles

Les mots de passe et sessions sont gérés par **Supabase Auth** (`auth.users`),
pas par une table applicative. La migration crée automatiquement un profil dans
`public.profiles` à l'inscription et copie le champ Auth `full_name` du
`user_metadata`. Ne stocke jamais de mot de passe dans `public`.

Les comptes créés sont des membres ordinaires par défaut. Les permissions
d'équipe sont conservées dans `public.user_roles`, séparées des métadonnées
modifiables par le client. Les rôles disponibles sont `admin`, `moderator`,
`verifier` et `field_agent`.

La section **Gestion des utilisateurs** du dashboard ne permet qu'aux
administrateurs d'inviter des utilisateurs standards, de désactiver/réactiver
leur compte ou de le supprimer définitivement. Les comptes portant un rôle
d'équipe et le compte administrateur connecté ne peuvent pas être modifiés par
ce flux. La suppression Auth est irréversible et les données liées par
`ON DELETE CASCADE` (par exemple favoris et candidatures) sont supprimées.
Pour empêcher également les inscriptions directes depuis l'API Auth, désactive
**Allow new users to sign up** dans **Authentication → Settings**; les invitations
envoyées par la fonction admin restent possibles.

Cette gestion passe par la fonction Edge `admin-users`, qui vérifie elle-même
le jeton de session et le rôle admin avant d'utiliser la clé privilégiée côté
serveur. Ne copie jamais `SUPABASE_SERVICE_ROLE_KEY` dans `.env.local` ni dans
le code du navigateur. Déploie la fonction depuis le dossier du projet :

```sh
supabase functions deploy admin-users
```

La cloche du dashboard lit les notifications persistantes, les actualise toutes
les 30 secondes (et au retour dans l’onglet), permet de les marquer comme lues
et met les erreurs en évidence. Les erreurs runtime, les échecs de chargement
des données du dashboard et les opérations de gestion signalées par l’interface
sont enregistrés comme notifications. Les créations, modifications et
suppression des contenus suivis par le journal, ainsi que les changements de
profil et de favoris, génèrent aussi des alertes. Pour l’activer, applique aussi la
migration `20261025113000_admin_activity_notifications.sql` puis redéploie
`admin-users` afin que les invitations, désactivations, suppressions et erreurs
de cette fonction créent une entrée dans le journal.

La configuration Supabase fournit normalement `SUPABASE_URL`,
`SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` à la fonction Edge. Si tu
déploies depuis le navigateur, crée/déploie `admin-users` dans **Edge
Functions**, en copiant `supabase/functions/admin-users/index.ts`. Le réglage
`verify_jwt = false` est volontaire : la fonction valide le jeton utilisateur
et le rôle admin explicitement avant toute opération.

Pour créer le premier administrateur :

1. Créer/inviter le compte dans **Authentication → Users** et confirmer son
   adresse e-mail.
2. Dans **SQL Editor**, remplacer l'adresse ci-dessous et exécuter :

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin'::public.staff_role
   from auth.users
   where lower(email) = lower('admin@ton-domaine.cd')
   on conflict (user_id, role) do nothing;
   ```

   Vérifier que la requête a inséré une ligne avant de fermer la session. Cette
   affectation est une opération de confiance, à faire dans le SQL Editor, jamais
   depuis un formulaire public.

Ensuite, un administrateur connecté peut attribuer ou retirer les autres rôles
avec la fonction contrôlée `public.manage_staff_role(user_id, role, true|false)`.
Le dernier rôle administrateur ne peut pas être retiré.

## Tables et surfaces fonctionnelles

| Domaine | Tables/vues principales | Utilisation |
| --- | --- | --- |
| Authentification | `auth.users`, `profiles`, `user_roles` | Comptes, profil et équipe |
| Annuaire | `categories`, `subcategories`, `listings`, `listing_hours`, `listing_payments`, `listing_languages`, `listing_keywords`, `listing_photos`, `public_listing_photos`, `admin_listings` | Fiches et données structurées |
| Vérification | `listing_verifications`, `listing_moderation_history`, `listing_audit_log`, `verify_listing(...)`, `decide_listing_review(...)` | Preuve, historique et retours au propriétaire |
| Favoris et avis | `saved_listings`, `listing_reviews`, `public_listing_reviews`, `public_listing_ratings`, `admin_listing_reviews` | Espace membre et modération |
| Agenda | `events`, `public_events`, `admin_events` | Soumissions, publication et agenda public |
| Emplois | `jobs`, `public_jobs`, `admin_jobs`, `job_applications` | Offres, statut éditorial et candidatures privées |
| Dashboard | `editorial_tasks`, `editorial_calendar`, `user_notifications`, `admin_activity_log` | À traiter, calendrier, alertes et activité |
| Statistiques | `dashboard_overview()`, `dashboard_daily_metrics`, `dashboard_device_daily_metrics`, `dashboard_metrics_30d` | Compteurs opérationnels et mesures importées d'une source réelle |
| Infos pratiques | `practical_information`, `public_practical_information`, `admin_practical_information` | Contacts et informations validées avant publication |

Les données publiques doivent être lues par les vues `public_*` (en particulier
`public.public_listings`). Les fiches non vérifiées restent privées, sauf les
fiches de démonstration qui ne contiennent pas de contacts réels. Les
candidatures, notes de modération et données d'équipe ne sont jamais publiques.

Les métriques de fréquentation restent vides tant que les migrations de suivi
ne sont pas appliquées et que la fonction Edge n'est pas déployée pour
alimenter `dashboard_daily_metrics`. Ne pas assimiler ces événements à des
visiteurs uniques.
`dashboard_device_daily_metrics` ne stocke que des totaux journaliers par
catégorie d'appareil, jamais un identifiant de navigateur ou une empreinte.

Le suivi des appareils et de fréquentation est assuré par la fonction Edge
`device-analytics`. Elle classe le navigateur à partir des en-têtes
User-Agent/Client Hints en Android, iOS, web mobile, ordinateur ou autre, puis
incrémente des totaux journaliers. Le frontend enregistre aussi les changements
de page et les ouvertures de fiches d'établissement. La fonction ne conserve
pas ces en-têtes, un identifiant de visiteur ou l'URL consultée dans la base.
Le fournisseur peut toutefois traiter les informations réseau nécessaires à
la requête selon ses propres journaux et règles de rétention.
Le navigateur limite l'envoi de la session à une fois par onglet avec
`sessionStorage`; les nombres sont donc des sessions d'onglet estimées, pas des
visiteurs uniques. La durée approximative est envoyée à la fermeture/quitte de
l'onglet; les sessions interrompues avant cet envoi ne contribuent pas à la
moyenne. Le visiteur n'a pas de bannière de consentement dédiée pour
cette mesure agrégée, conformément au choix de configuration. La politique de
confidentialité du site doit décrire cette mesure et ses obligations locales
doivent être vérifiées avant le lancement.

La fonction Edge renvoie au dashboard les totaux agrégés par appareil et les
valeurs quotidiennes de sessions/consultations de fiches/durées de session sur
7, 30 ou 90 jours. Les lectures sont réservées aux administrateurs authentifiés.
Le graphique de fréquentation garde son infobulle, son survol et ses animations
avec les données réelles. Les lectures agrégées sont réservées aux
administrateurs authentifiés et ne contiennent pas de données individuelles.
Comme l'endpoint de collecte est public, un client automatisé pourrait toutefois
fausser les totaux; ils sont indicatifs, pas une mesure certifiée contre la
fraude.

Pour activer cette fonctionnalité après la création du projet Supabase :

1. Ajouter ces variables au fichier d'environnement local du frontend :

   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=<clé-publique>
   ```

   `VITE_SUPABASE_ANON_KEY` est également accepté. Les variables
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` et
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` sont aussi reconnues. Utilise un
   fichier `.env.local` à la racine du projet et redémarre Vite après chaque
   modification. La clé `anon`/publishable est publique; ne jamais placer la
   clé `service_role` dans le frontend. La collecte analytique et la lecture du
   dashboard utilisent maintenant les mêmes noms de variables publiques.
2. La page `/login` utilise Supabase Auth avec l'e-mail et le mot de passe
   du compte, puis ouvre le dashboard `/admin`. La session est conservée dans
   le navigateur selon l'option « Se souvenir de moi ». L'accès au dashboard
   exige aussi le rôle `admin` dans `public.user_roles` ; un compte Auth seul
   ne suffit pas. Vérifier dans Supabase que l'utilisateur a confirmé son
   adresse e-mail si la confirmation est activée. La vérification d'interface
   ne remplace pas les règles RLS : chaque table contenant des données privées
   doit rester protégée par ses propres politiques.
3. Exécuter `supabase db push` pour déployer les migrations, y compris les
   workflows de contenu. Le formulaire d'administration exige un utilisateur
   présent dans `public.user_roles` avec le rôle `admin`.
4. Déployer la fonction et configurer son origine :

   ```sh
   supabase secrets set ALLOWED_ORIGINS="https://ton-domaine.cd,https://www.ton-domaine.cd,http://localhost:8080,http://127.0.0.1:8080,http://localhost:5173,http://127.0.0.1:5173"
   supabase functions deploy device-analytics --no-verify-jwt
   supabase functions deploy admin-users
   ```

   Ajouter aussi les origines locales nécessaires à `ALLOWED_ORIGINS` pendant
   le développement, en particulier l'origine exacte utilisée par le site
   (par exemple `http://localhost:8080`). Le drapeau
   `--no-verify-jwt` est nécessaire pour que la passerelle laisse passer le
   précontrôle CORS `OPTIONS`; la fonction vérifie ensuite elle-même
   l'authentification et le rôle `admin` sur les lectures `GET`. Le secret
   `SUPABASE_SERVICE_ROLE_KEY` est lu uniquement
   côté Edge Function et ne doit jamais être fourni au navigateur. La fonction
   garde `verify_jwt = false` pour accepter la collecte publique des visites ;
   ses lectures `GET` vérifient séparément le jeton Supabase et le rôle
   `admin`. L'en-tête `Origin` sert uniquement au CORS et n'est pas un contrôle
   d'autorisation.
5. Recompiler/redéployer le frontend avec les variables `VITE_*`. Le site public
   lit les fiches vérifiées, les événements futurs publiés et les offres
   publiées directement depuis les vues Supabase ; recharge la page après une
   publication pour actualiser les résultats.

La migration ajoute les RPC sécurisées d'écriture et d'agrégation. La clé
service-role reste côté Edge Function; l'API publique ne permet de récupérer
que des sommes agrégées et ne donne pas accès à la table.

## Contrat des sections du dashboard

La structure visuelle et les effets Recharts (couleurs, courbes, infobulle,
survol et animation) sont conservés. Le branchement des autres panneaux doit
respecter le mapping suivant; remplir les tables seul ne câble pas les
composants React.

Important : `/admin` et `/admin/workspace` ne sont pas encore protégés par une
authentification Supabase dans le frontend. Avant de connecter les requêtes
staff ci-dessous, ajouter un contrôle de session/rôle côté route et garder les
politiques RLS comme seconde ligne de défense. Les fonctions de statistiques
agrégées sont distinctes et n'exposent que des totaux.

| Section visible | Source Supabase attendue | État et précautions d'intégration |
| --- | --- | --- |
| Visiteurs cette semaine | `dashboard_daily_metrics.visitors` | Non collecté par le tracker actuel. Ne pas substituer les sessions aux visiteurs uniques. |
| Durée moyenne | `dashboard_daily_metrics.session_duration_seconds` et `completed_sessions` | Durée cumulée des sessions terminées divisée par leur nombre; il s'agit d'une estimation basée sur l'envoi du navigateur à la fermeture de l'onglet. |
| Fiches dans l'annuaire | `dashboard_overview()` | Compteurs de fiches réelles, sans les lignes `is_example`. |
| Offres & candidatures | `dashboard_overview()` (`jobs_published`, `jobs_pending`, `applications_total`) | À agréger selon la définition choisie pour la carte. |
| Engagement annuaire | `dashboard_daily_metrics.contact_clicks` et/ou `listing_views` | Les consultations de fiches sont suivies; les clics de contact ne le sont pas. |
| Fiches consultées | `dashboard_daily_metrics.listing_views` | Alimenté par l'ouverture des routes de détail d'annuaire. |
| Fréquentation | RPC `read_public_traffic_metrics` via `device-analytics` | Séries journalières de sessions, consultations, durées cumulées et sessions terminées; boutons 7/30/90 jours. |
| Activité récente | RPC `admin_dashboard_activity()` avec jointure contrôlée vers `profiles`; `listing_audit_log` pour les changements de fiches | Réservé à l'administrateur; la jointure fournit les noms et initiales du membre. |
| Fiches récentes | `admin_listings`, `public_listing_ratings`, `categories`, `subcategories` | Mapper les noms SQL (`category_id`, `subcategory_id`, `status`) vers les champs du composant; exclure `is_example`. |
| Annuaire par catégorie | Agrégation des fiches réelles par `category_id` | Utiliser les catégories de la base et masquer les catégories de compte zéro si la présentation le prévoit. |
| Fiches par commune | Agrégation des fiches réelles par `commune` | Exclure les communes nulles/vides du regroupement. |
| À traiter | `editorial_tasks` | Affiche jusqu'à cinq tâches ouvertes/en cours avec priorité et échéance; les files de modération restent à intégrer séparément. |
| Calendrier éditorial | `editorial_calendar` (`starts_at`, `item_type`, `status`) | Lit les entrées du mois choisi et marque les jours selon l'heure de Lubumbashi. |
| Visites par appareil | RPC `read_public_device_metrics` via `device-analytics` | Agrégats quotidiens par catégorie et même période que le graphique. |
| Notifications | `user_notifications` filtré par `recipient_id = auth.uid()` | Nécessite l'authentification; les identifiants UUID ne doivent pas être convertis en nombres. |
| Disponibilité des services | Aucun modèle de santé opérationnelle défini | Nécessite des contrôles de santé explicites; ne pas déduire l'état des services de données métier. |
| Accès rapide / pied de page | Liens de navigation et état de déploiement | Pas des données métier à remplir depuis la base. |

Les cartes « visiteurs uniques » et « clics de contact » ne peuvent pas être
renseignées honnêtement par le tracker actuel. Celui-ci mesure des sessions
estimées par onglet, des pages consultées, les ouvertures de fiches et une
durée approximative des sessions terminées, sans identifiant durable.

La fonction `public.dashboard_overview()` renvoie les compteurs opérationnels
réels (fiches, avis, événements, offres, candidatures, tâches et notifications)
et refuse les appels qui ne proviennent pas d'un membre de l'équipe. Les
statistiques de fréquentation sont produites séparément par `device-analytics`
et enregistrées comme totaux journaliers dans `dashboard_daily_metrics`.

## Sécurité et informations sensibles

- La Row Level Security (RLS) est activée sur les tables applicatives.
- Une inscription ne peut pas s'accorder un rôle d'équipe.
- Les fiches publiques passent par `public.public_listings`; les notes internes
  ne sont pas exposées par cette vue.
- Une vérification doit passer par `public.verify_listing(...)`, qui ajoute la
  preuve et met à jour la fiche dans la même transaction.
- Les décisions d'approbation, refus et demande de corrections passent par
  `public.decide_listing_review(...)`; le propriétaire ne voit que le message
  public, pas la note interne.
- Les photos publiques utilisent le bucket `listing-photos`; les CV sont dans le
  bucket privé `job-applications` et ne sont accessibles qu'au candidat, à
  l'employeur concerné et aux rôles de modération autorisés. Les candidatures
  contiennent des données personnelles : ne pas créer de lien public de CV.
- Ne jamais placer la clé `service_role` dans le navigateur ni la committer.
  Toute intégration frontend utilisera la clé publique `anon` avec RLS.
- Les coordonnées professionnelles sensibles en santé/juridique ne doivent être
  affichées qu'avec le consentement public explicite déjà prévu dans
  `listing_professional_details`.

## État de l'intégration applicative

Le tableau de bord charge les contenus, l'activité récente, les tâches
éditoriales, le calendrier du mois sélectionné et les notifications depuis
Supabase. Les statistiques de fréquentation, de durée et d'appareil exigent les
migrations à jour ainsi que le déploiement des fonctions `device-analytics` et
`admin-users` avec les origines de développement et de production dans
`ALLOWED_ORIGINS`. Les sessions, durées et consultations sont des estimations
agrégées, pas des visiteurs uniques.
