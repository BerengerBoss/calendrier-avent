# Calendrier de l'Avent — Deloitte Transfo & Change

Front statique (React + Vite) hébergé sur **GitHub Pages** (lien HTTPS), back-end **Supabase**
(base Postgres + authentification admin + règles de sécurité).

```
Navigateur ──HTTPS──▶ GitHub Pages (front statique, aucun secret)
     │
     └──HTTPS──▶ Supabase (Postgres + RLS + RPC)
                   • cases (publiées/brouillons, lundi→vendredi uniquement)
                   • participants (prénom/nom) + événements (visites, ouvertures, clics)
                   • admins (comptes Supabase Auth)
```

## Ce que fait l'application

- **Première visite** : le visiteur saisit son prénom et son nom. Il est mémorisé dans son
  navigateur et enregistré dans Supabase. S'il revient depuis un autre appareil avec le même
  nom, son historique est retrouvé.
- **Date réelle** : la date du jour vient du **serveur** (heure de Paris). Changer l'horloge de
  son PC ne débloque rien.
- **Confidentialité** : une case future ou en brouillon **ne quitte jamais la base de données**
  pour un visiteur. Le Row Level Security de Postgres la filtre avant l'envoi, elle n'est pas
  simplement masquée à l'écran.
- **Jours ouvrés uniquement** : la base refuse toute case un samedi ou un dimanche.
- **Live** : chaque page se rafraîchit toutes les 60 s (et quand l'onglet redevient actif).
  Une case publiée ou modifiée apparaît donc chez tout le monde en moins d'une minute.
- **Studio admin** (connexion email + mot de passe) :
  - **Statistiques** : participants, actifs du jour et de la semaine, cases ouvertes, taux de
    complétion, personnes « à jour », activité par jour, performance de chaque case, heures
    d'ouverture, tableau des participants (recherche, tri, détail des cases ouvertes,
    suppression, export CSV).
  - **Cases** : création au fil de l'eau (case vierge ou duplication), brouillon → publication,
    dépublication, suppression.
  - **Aperçu & date** : affiche le calendrier à n'importe quelle date, brouillons compris. Cet
    aperçu n'existe que dans votre navigateur et n'est jamais comptabilisé dans les stats.
  - **Réglages** : titre, sous-titre, période, sauvegarde/import JSON, remise à zéro des stats.

Accès admin : lien « Admin » en bas de page, triple-clic sur le logo, `Ctrl+Shift+A`,
ou URL terminée par `#admin`.

---

## Déploiement pas à pas

### 1. Créer la base Supabase (≈ 10 min, gratuit)

1. Créez un compte sur <https://supabase.com>, puis **New project**. Région conseillée :
   *West EU (Paris)* ou *Frankfurt*.
2. Ouvrez **SQL Editor** → **New query**, collez **tout** le fichier
   [`supabase/schema.sql`](supabase/schema.sql) et cliquez sur **Run**. Le script peut être
   ré-exécuté sans danger.
3. **Authentication → Sign In / Providers** : désactivez **« Allow new users to sign up »**.
   Personne ne pourra alors se créer de compte.
4. **Authentication → Users → Add user → Create new user** : saisissez votre email et un mot
   de passe solide, et cochez *Auto Confirm User*.
5. Dans le **SQL Editor**, déclarez ce compte comme administrateur :
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'votre.email@exemple.com'
   on conflict do nothing;
   ```
6. **Project Settings → API** (ou bouton **Connect**) : notez la **Project URL** et la clé
   **anon / publishable**. Cette clé est publique par conception, la sécurité repose sur le RLS.
   N'utilisez **jamais** la clé `service_role` dans le front.

### 2. Mettre le code sur GitHub

Il faut d'abord installer **Git** (<https://git-scm.com>) ou **GitHub Desktop**, puis
**Node.js 22 LTS** (<https://nodejs.org>).

1. Créez un dépôt sur <https://github.com/new>, par exemple `calendrier-avent`.
2. Depuis ce dossier :
   ```powershell
   git init -b main
   git add .
   git commit -m "Calendrier de l'Avent"
   git remote add origin https://github.com/<votre-compte>/calendrier-avent.git
   git push -u origin main
   ```
   Le `.gitignore` exclut volontairement `src/data/defaultTips.ts`, `private/` et
   `advent-calendar-html/`, car ils contiennent le texte des futures cases. Avec un dépôt
   public, n'importe qui pourrait sinon les lire.

### 3. Activer GitHub Pages

1. Dépôt → **Settings → Secrets and variables → Actions → onglet Variables → New repository variable** :
   - `VITE_SUPABASE_URL` = la Project URL
   - `VITE_SUPABASE_ANON_KEY` = la clé anon / publishable
2. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
3. Onglet **Actions** : le workflow « Déploiement GitHub Pages » se lance à chaque `git push`
   (ou via *Run workflow*). Une fois terminé, le lien s'affiche, du type
   `https://<votre-compte>.github.io/calendrier-avent/`. C'est ce lien HTTPS que vous partagez.

> GitHub Pages est gratuit pour un dépôt **public**. Pour un dépôt privé, il faut un compte
> GitHub Pro ou Team. Les cases restent protégées dans les deux cas, puisqu'elles sont
> stockées dans Supabase.

### 4. Charger les cases

1. En local : `npm install`, puis `npm run export-templates`. Le script génère
   `private/cases-brouillons.json`, qui contient les modèles en **brouillons**.
2. Sur le site : **Studio admin → Réglages → Importer JSON** → choisissez ce fichier.
   Toutes les cases sont créées en brouillon et restent invisibles pour le public.
3. **Studio → Cases** : relisez chaque case, puis cliquez sur **Publier**. Une case publiée
   pour une date future apparaît **automatiquement** le jour venu, à 00 h 00 heure de Paris.
4. Vérifiez le rendu avec **Aperçu & date** (par exemple au 9 décembre).
5. Avant le lancement : **Réglages → Réinitialiser participants & statistiques**, pour effacer
   les données de test.

---

## Développement local

```powershell
copy .env.example .env.local   # puis renseignez l'URL et la clé Supabase
npm install
npm run dev                    # http://localhost:5173
npm run build                  # vérification TypeScript + build de production
```

## Structure

| Fichier | Rôle |
|---|---|
| `supabase/schema.sql` | Tables, RLS, fonctions RPC (inscription, ouverture, stats admin) |
| `src/lib/api.ts` | Tous les appels Supabase |
| `src/utils/calendar.ts` | Jours ouvrés, date de Paris, formats FR |
| `src/App.tsx` | Front-office : chargement live, identité visiteur, aperçu admin |
| `src/components/NameGateModal.tsx` | Saisie prénom/nom à la première visite |
| `src/components/BackofficeStudio.tsx` + `admin/*` | Studio : stats, cases, aperçu, réglages |
| `.github/workflows/deploy.yml` | Build et déploiement automatique sur GitHub Pages |

## Notes de sécurité et RGPD

- Les noms sont **déclaratifs** : il n'y a pas d'authentification des participants. C'est voulu,
  pour un usage interne simple. Quelqu'un peut donc saisir un faux nom.
- Prévenez les participants que leur prénom, leur nom et leur activité sont collectés pour le
  suivi de la participation, comme l'indique l'écran d'accueil. Pensez à supprimer les données
  après l'opération (**Réinitialiser**).
- La clé anon permet uniquement ce que le RLS autorise : lire les cases publiées et passées, et
  appeler les fonctions d'inscription et d'ouverture. Elle ne donne pas accès en lecture aux
  participants ni aux statistiques.
