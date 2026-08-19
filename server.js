require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   CONFIGURATION
========================================================= */

const ADMIN_EMAIL =
  "admin@special-quinte-francais.com";

const ADMIN_PASSWORD =
  "Compta@09";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "SPECIAL-QUINTE-FRANCAIS-SECRET-2026";

/* =========================================================
   BASE DE DONNÉES
========================================================= */

const db = new Database(
  path.join(__dirname, "data.db")
);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/* =========================================================
   TABLES
========================================================= */

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  vip_until TEXT
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan TEXT NOT NULL,
  amount_eur INTEGER NOT NULL,
  phone TEXT NOT NULL,
  transaction_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  race_date TEXT NOT NULL,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  course TEXT NOT NULL,
  distance TEXT NOT NULL,
  runners INTEGER NOT NULL,
  bases TEXT NOT NULL,
  second_chances TEXT NOT NULL,
  outsiders TEXT NOT NULL,
  replacement TEXT,
  tierce TEXT,
  quarte TEXT,
  quinte TEXT,
  notes TEXT
);
`);

/* =========================================================
   COMPATIBILITÉ ANCIENNE BASE
========================================================= */

function addColumnIfMissing(
  table,
  column,
  definition
) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  const exists = columns.some(
    item => item.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table}
       ADD COLUMN ${column} ${definition}`
    );
  }
}

addColumnIfMissing(
  "tips",
  "tierce",
  "TEXT"
);

addColumnIfMissing(
  "tips",
  "quarte",
  "TEXT"
);

addColumnIfMissing(
  "tips",
  "quinte",
  "TEXT"
);

/* =========================================================
   ADMIN
========================================================= */

const adminHash =
  bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

const existingAdmin =
  db
    .prepare(
      `
      SELECT id
      FROM users
      WHERE email = ?
      `
    )
    .get(ADMIN_EMAIL);

if (!existingAdmin) {

  db.prepare(
    `
    INSERT INTO users
    (
      name,
      email,
      phone,
      password_hash,
      role
    )
    VALUES (?, ?, ?, ?, ?)
    `
  ).run(
    "Administrateur",
    ADMIN_EMAIL,
    "0000000000",
    adminHash,
    "admin"
  );

} else {

  db.prepare(
    `
    UPDATE users
    SET
      password_hash = ?,
      role = 'admin'
    WHERE email = ?
    `
  ).run(
    adminHash,
    ADMIN_EMAIL
  );
}

/* =========================================================
   PRONOSTIC PAR DÉFAUT
========================================================= */

const existingTip =
  db
    .prepare(
      `
      SELECT id
      FROM tips
      LIMIT 1
      `
    )
    .get();

if (!existingTip) {

  db.prepare(
    `
    INSERT INTO tips
    (
      race_date,
      title,
      start_time,
      course,
      distance,
      runners,
      bases,
      second_chances,
      outsiders,
      replacement,
      tierce,
      quarte,
      quinte,
      notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    "2026-08-15",
    "QUINTÉ DU JOUR — RÉUNION 1",
    "13H50",
    "France",
    "2 400 M",
    16,
    "5 – 8 – 12",
    "3 – 7 – 10",
    "2 – 11 – 14",
    "6",
    "5 – 8 – 12 – 3 – 7 – 10",
    "5 – 8 – 12 – 3 – 7 – 10 – 2",
    "5 – 8 – 12 – 3 – 7 – 10 – 2 – 11",
    "Pronostic de démonstration à remplacer."
  );
}

/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  express.urlencoded({
    extended: true
  })
);

app.use(
  express.json()
);

app.set(
  "trust proxy",
  1
);

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV ===
        "production",
      maxAge:
        7 * 24 * 60 * 60 * 1000
    }
  })
);

app.use(
  express.static(
    path.join(__dirname, "public")
  )
);

/* =========================================================
   UTILITAIRES
========================================================= */

function safe(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {

  if (!value) {
    return "";
  }

  return new Date(
    value + "T00:00:00"
  ).toLocaleDateString(
    "fr-FR"
  );
}

function todayString() {

  return new Date()
    .toISOString()
    .slice(0, 10);
}

function isVip(user) {

  return !!(
    user &&
    user.vip_until &&
    new Date(user.vip_until) >
      new Date()
  );
}

/* =========================================================
   PAGE PRINCIPALE
========================================================= */

function page(
  req,
  title,
  body
) {

  const logged =
    !!req.session.userId;

  const isAdmin =
    req.session.role ===
    "admin";

  return `
<!doctype html>

<html lang="fr">

<head>

<meta charset="utf-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>
${safe(title)}
—
Spécial Quinté Français
</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Arial, sans-serif;
  background: #f5f7fa;
  color: #222;
}

header {
  background: #111827;
  color: white;
  padding: 18px;
}

.logo {
  color: white;
  text-decoration: none;
  font-weight: bold;
  font-size: 20px;
}

.logo small {
  display: block;
  font-size: 12px;
  margin-top: 3px;
  letter-spacing: 2px;
}

nav {
  margin-top: 15px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

nav a {
  color: white;
  text-decoration: none;
  padding: 8px 10px;
  border-radius: 6px;
}

nav a:hover {
  background: #374151;
}

main {
  max-width: 1100px;
  margin: auto;
  padding: 25px 15px;
}

footer {
  text-align: center;
  padding: 30px 15px;
  color: #666;
}

.hero,
.card,
.formbox,
.plan,
.archive-card,
.archive-header {
  background: white;
  padding: 22px;
  border-radius: 14px;
  margin-bottom: 20px;
  box-shadow:
    0 3px 15px rgba(0,0,0,.08);
}

.hero {
  text-align: center;
  padding: 30px;
}

.race {
  margin: 25px 0;
  padding: 22px;
  border-radius: 12px;
  background: #111827;
  color: white;
}

.race b,
.race strong,
.race span {
  display: block;
  margin: 8px;
}

.grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit,minmax(280px,1fr));
  gap: 20px;
}

.picks,
.archive-picks,
.bet-grid {
  display: grid;
  grid-template-columns:
    repeat(auto-fit,minmax(180px,1fr));
  gap: 12px;
  margin: 20px 0;
}

.picks b,
.archive-pick,
.bet-card {
  padding: 18px;
  border-radius: 10px;
  background: #eef2ff;
  text-align: center;
}

.picks span,
.bet-card .horses,
.archive-pick span {
  display: block;
  font-size: 20px;
  font-weight: bold;
  margin-top: 8px;
}

.bet-card h3 {
  margin-top: 0;
}

.btn {
  display: inline-block;
  border: 0;
  background: #111827;
  color: white;
  text-decoration: none;
  padding: 11px 18px;
  border-radius: 7px;
  cursor: pointer;
}

.success {
  background: #166534;
}

.danger {
  background: #b91c1c;
}

label {
  display: block;
  margin-bottom: 15px;
  font-weight: bold;
}

input,
textarea,
select {
  width: 100%;
  padding: 11px;
  margin-top: 6px;
  border: 1px solid #ccc;
  border-radius: 7px;
  font-size: 15px;
}

textarea {
  min-height: 100px;
}

.row {
  background: #f9fafb;
  padding: 15px;
  margin: 10px 0;
  border-radius: 8px;
}

.admin-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.notice,
.vip {
  background: #fff7ed;
  padding: 15px;
  border-radius: 8px;
}

.locked {
  text-align: center;
  background: #f3f4f6;
  padding: 25px;
  border-radius: 12px;
  margin-top: 20px;
}

.lock-icon {
  font-size: 40px;
}

.archive-date {
  color: #555;
  font-size: 14px;
  margin-bottom: 8px;
}

.archive-title {
  color: #111827;
}

.archive-info {
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
}

@media(max-width:600px) {

  main {
    padding: 15px 10px;
  }

  .hero {
    padding: 20px 15px;
  }

  .picks,
  .archive-picks {
    grid-template-columns: 1fr 1fr;
  }

  .bet-grid {
    grid-template-columns: 1fr;
  }

}

</style>

</head>

<body>

<header>

<a
  class="logo"
  href="/"
>
♞ SPÉCIAL QUINTÉ

<small>
FRANÇAIS
</small>

</a>

<nav>

<a href="/">
Accueil
</a>

<a href="/pronostic">
Pronostic VIP
</a>

<a href="/archives">
🗂️ Archives
</a>

<a href="/abonnement">
Abonnement
</a>

${
  logged
    ? `
      <a href="/compte">
        Mon compte
      </a>
      `
    : `
      <a href="/inscription">
        Créer un compte
      </a>

      <a href="/connexion">
        Connexion
      </a>
      `
}

${
  isAdmin
    ? `
      <a href="/admin">
        ⚙️ Admin
      </a>
      `
    : ""
}

${
  logged
    ? `
      <a href="/deconnexion">
        Déconnexion
      </a>
      `
    : ""
}

</nav>

</header>

<main>

${body}

</main>

<footer>

© 2026 Spécial Quinté Français

</footer>

</body>

</html>
`;
}

/* =========================================================
   AUTH
========================================================= */

function auth(
  req,
  res,
  next
) {

  if (!req.session.userId) {
    return res.redirect(
      "/connexion"
    );
  }

  next();
}

function adminOnly(
  req,
  res,
  next
) {

  if (
    !req.session.userId ||
    req.session.role !== "admin"
  ) {

    return res.status(403).send(
      page(
        req,
        "Accès refusé",
        `
        <div class="formbox">

          <h1>
            🔒 Accès refusé
          </h1>

          <p>
            Accès administrateur requis.
          </p>

          <a
            class="btn"
            href="/connexion"
          >
            Se connecter
          </a>

        </div>
        `
      )
    );
  }

  next();
}

/* =========================================================
   AFFICHAGE PRONOSTIC
========================================================= */

function tipFields(t) {

  return `

<div class="picks">

<b>

BASES

<span>
${safe(t.bases)}
</span>

</b>

<b>

SECONDES CHANCES

<span>
${safe(t.second_chances)}
</span>

</b>

<b>

OUTSIDERS

<span>
${safe(t.outsiders)}
</span>

</b>

<b>

REMPLAÇANT

<span>
${safe(t.replacement || "-")}
</span>

</b>

</div>

<h2>
🎯 Jeux du jour
</h2>

<div class="bet-grid">

<div class="bet-card">

<h3>
🏇 TIERCE
</h3>

<p>
6 chevaux
</p>

<span class="horses">
${safe(t.tierce || "-")}
</span>

</div>

<div class="bet-card">

<h3>
🏇 QUARTE
</h3>

<p>
7 chevaux
</p>

<span class="horses">
${safe(t.quarte || "-")}
</span>

</div>

<div class="bet-card">

<h3>
🏇 QUINTE
</h3>

<p>
8 chevaux
</p>

<span class="horses">
${safe(t.quinte || "-")}
</span>

</div>

</div>

${
  t.notes
    ? `
      <div class="notice">

      📝
      <b>
      Commentaire :
      </b>

      <br><br>

      ${safe(t.notes)}

      </div>
      `
    : ""
}

`;
}

/* =========================================================
   ACCUEIL
   IMPORTANT :
   AUCUN NUMÉRO DU PRONOSTIC N'EST AFFICHÉ ICI.
========================================================= */

app.get(
  "/",
  (req, res) => {

    const t =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          ORDER BY race_date DESC, id DESC
          LIMIT 1
          `
        )
        .get();

    if (!t) {

      return res.send(
        page(
          req,
          "Accueil",
          `
          <div class="card">

            <h1>
              Aucun pronostic disponible.
            </h1>

          </div>
          `
        )
      );
    }

    res.send(
      page(
        req,
        "Accueil",
        `

<section class="hero">

<h1>
♞ SPÉCIAL QUINTÉ FRANÇAIS
</h1>

<p>
Pronostics hippiques VIP — France
</p>

<div class="race">

<b>
QUINTÉ DU JOUR
</b>

<strong>
${safe(t.title)}
</strong>

<span>

${formatDate(t.race_date)}

•

${safe(t.start_time)}

•

${safe(t.runners)}
partants

•

${safe(t.distance)}

</span>

</div>

<div class="locked">

<div class="lock-icon">
🔐
</div>

<h3>
Pronostic réservé aux membres VIP
</h3>

<p>
La sélection complète n'est pas affichée
sur l'accueil.
</p>

<a
class="btn"
href="/abonnement"
>
👑 Accéder au VIP
</a>

</div>

</section>

<div class="grid">

<div class="card">

<h2>
🔒 Pronostic du jour
</h2>

<p>
Les Bases, Secondes chances, Outsiders,
Tiercé, Quarté et Quinté sont réservés
aux membres VIP.
</p>

<a
class="btn"
href="/abonnement"
>
Voir les abonnements
</a>

</div>

<div class="card">

<h2>
🗂️ Archives
</h2>

<p>
Les anciennes sélections restent
accessibles publiquement.
</p>

<a
class="btn"
href="/archives"
>
Voir les archives
</a>

</div>

<div class="card">

<h2>
👑 VIP
</h2>

<p>
15 jours :
<b>70 €</b>
</p>

<p>
1 mois :
<b>100 €</b>
</p>

<a
class="btn"
href="/abonnement"
>
S'abonner
</a>

</div>

</div>

`
      )
    );
  }
);

/* =========================================================
   ARCHIVES PUBLIQUES
========================================================= */

app.get(
  "/archives",
  (req, res) => {

    const rows =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          WHERE race_date < ?
          ORDER BY race_date DESC, id DESC
          `
        )
        .all(
          todayString()
        );

    let html = `

<div class="archive-header">

<h1>
🗂️ ARCHIVES DES PRONOSTICS
</h1>

<p>
Les archives sont visibles par tous les visiteurs.
</p>

</div>

`;

    if (!rows.length) {

      html += `

<div class="card">

<h2>
Aucune archive pour le moment
</h2>

<p>
Les anciens pronostics apparaîtront
automatiquement après leur date de course.
</p>

</div>

`;

    } else {

      html += rows
        .map(
          t => `

<div class="archive-card">

<div class="archive-date">

📅
${formatDate(t.race_date)}

•

🕐
${safe(t.start_time)}

</div>

<h2 class="archive-title">

${safe(t.title)}

</h2>

<div class="archive-info">

🏇
<b>
${safe(t.course)}
</b>

•

${safe(t.distance)}

•

${safe(t.runners)}
partants

</div>

<div class="archive-picks">

<div class="archive-pick">

<strong>
BASES
</strong>

<span>
${safe(t.bases)}
</span>

</div>

<div class="archive-pick">

<strong>
SECONDES CHANCES
</strong>

<span>
${safe(t.second_chances)}
</span>

</div>

<div class="archive-pick">

<strong>
OUTSIDERS
</strong>

<span>
${safe(t.outsiders)}
</span>

</div>

<div class="archive-pick">

<strong>
REMPLAÇANT
</strong>

<span>
${safe(t.replacement || "-")}
</span>

</div>

</div>

<br>

<a
class="btn"
href="/archives/${t.id}"
>
Voir le pronostic complet
</a>

</div>

`
        )
        .join("");
    }

    res.send(
      page(
        req,
        "Archives",
        html
      )
    );
  }
);

/* =========================================================
   DÉTAIL ARCHIVE
   PUBLIC
========================================================= */

app.get(
  "/archives/:id",
  (req, res) => {

    const t =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          WHERE id = ?
          `
        )
        .get(
          req.params.id
        );

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Archive introuvable",
          `
          <div class="card">

            <h1>
              Archive introuvable
            </h1>

            <a
              class="btn"
              href="/archives"
            >
              Retour aux archives
            </a>

          </div>
          `
        )
      );
    }

    res.send(
      page(
        req,
        "Archive",
        `

<div class="archive-card">

<div class="archive-date">

📅
${formatDate(t.race_date)}

•

🕐
${safe(t.start_time)}

</div>

<h1>
${safe(t.title)}
</h1>

<div class="archive-info">

🏇 Hippodrome :

<b>
${safe(t.course)}
</b>

<br><br>

📏 Distance :

<b>
${safe(t.distance)}
</b>

<br><br>

🐎 Partants :

<b>
${safe(t.runners)}
</b>

</div>

${tipFields(t)}

<br>

<a
class="btn"
href="/archives"
>
← Retour aux archives
</a>

</div>

`
      )
    );
  }
);

/* =========================================================
   INSCRIPTION
========================================================= */

app.get(
  "/inscription",
  (req, res) => {

    res.send(
      page(
        req,
        "Créer un compte",
        `

<div class="formbox">

<h1>
Créer un compte
</h1>

<form
method="post"
action="/inscription"
>

<label>
Nom complet

<input
name="name"
required
>

</label>

<label>
E-mail

<input
type="email"
name="email"
required
>

</label>

<label>
Téléphone

<input
name="phone"
required
>

</label>

<label>
Mot de passe

<input
type="password"
name="password"
minlength="8"
required
>

</label>

<button
class="btn"
>
Créer mon compte
</button>

</form>

</div>

`
      )
    );
  }
);

app.post(
  "/inscription",
  (req, res) => {

    const {
      name,
      email,
      phone,
      password
    } = req.body;

    if (
      !name ||
      !email ||
      !phone ||
      !password
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">

            <h1>
              Informations manquantes.
            </h1>

          </div>
          `
        )
      );
    }

    try {

      const info =
        db
          .prepare(
            `
            INSERT INTO users
            (
              name,
              email,
              phone,
              password_hash,
              role
            )
            VALUES (?, ?, ?, ?, ?)
            `
          )
          .run(
            name.trim(),
            email
              .trim()
              .toLowerCase(),
            phone.trim(),
            bcrypt.hashSync(
              password,
              12
            ),
            "member"
          );

      req.session.userId =
        Number(
          info.lastInsertRowid
        );

      req.session.role =
        "member";

      res.redirect(
        "/abonnement"
      );

    } catch (e) {

      res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="formbox">

            <h1>
              Erreur
            </h1>

            <p>
              Cette adresse e-mail existe déjà
              ou les informations sont invalides.
            </p>

            <a
              class="btn"
              href="/connexion"
            >
              Se connecter
            </a>

          </div>
          `
        )
      );
    }
  }
);

/* =========================================================
   CONNEXION
========================================================= */

app.get(
  "/connexion",
  (req, res) => {

    res.send(
      page(
        req,
        "Connexion",
        `

<div class="formbox">

<h1>
Connexion
</h1>

<form
method="post"
action="/connexion"
>

<label>
E-mail

<input
type="email"
name="email"
autocomplete="username"
required
>

</label>

<label>
Mot de passe

<input
type="password"
name="password"
autocomplete="current-password"
required
>

</label>

<button
class="btn"
>
Se connecter
</button>

</form>

<p>
Pas encore de compte ?

<a href="/inscription">
Créer un compte
</a>

</p>

</div>

`
      )
    );
  }
);

app.post(
  "/connexion",
  (req, res) => {

    const email =
      String(
        req.body.email || ""
      )
        .trim()
        .toLowerCase();

    const password =
      String(
        req.body.password || ""
      );

    const user =
      db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE email = ?
          `
        )
        .get(email);

    if (
      !user ||
      !bcrypt.compareSync(
        password,
        user.password_hash
      )
    ) {

      return res.status(401).send(
        page(
          req,
          "Connexion",
          `
          <div class="formbox">

            <h1>
              ❌ Connexion refusée
            </h1>

            <p>
              L'adresse e-mail ou le mot
              de passe est incorrect.
            </p>

            <a
              class="btn"
              href="/connexion"
            >
              Réessayer
            </a>

          </div>
          `
        )
      );
    }

    req.session.regenerate(
      err => {

        if (err) {
          return res.status(500).send(
            "Erreur de session."
          );
        }

        req.session.userId =
          user.id;

        req.session.role =
          user.role;

        req.session.save(
          saveError => {

            if (saveError) {
              return res.status(500).send(
                "Erreur de sauvegarde de session."
              );
            }

            res.redirect(
              user.role === "admin"
                ? "/admin"
                : "/compte"
            );
          }
        );
      }
    );
  }
);

/* =========================================================
   DÉCONNEXION
========================================================= */

app.get(
  "/deconnexion",
  (req, res) => {

    req.session.destroy(
      () => {
        res.redirect("/");
      }
    );
  }
);

/* =========================================================
   ABONNEMENT
========================================================= */

app.get(
  "/abonnement",
  auth,
  (req, res) => {

    res.send(
      page(
        req,
        "Abonnement",
        `

<div class="grid">

<div class="card">

<h1>
Choisissez votre abonnement
</h1>

<div class="plan">

<h2>
VIP 15 JOURS
</h2>

<strong>
70 €
</strong>

<br><br>

<a
class="btn"
href="/payer?plan=15"
>
Payer avec Orange Money
</a>

</div>

<div class="plan">

<h2>
VIP 1 MOIS
</h2>

<strong>
100 €
</strong>

<br><br>

<a
class="btn"
href="/payer?plan=30"
>
Payer avec Orange Money
</a>

</div>

</div>

<div class="card">

<h2>
ℹ️ Paiement Orange Money
</h2>

<p>
Après paiement, indiquez la référence
de transaction.
</p>

<p>
L'administrateur vérifiera puis
activera votre accès.
</p>

</div>

</div>

`
      )
    );
  }
);

/* =========================================================
   PAIEMENT
========================================================= */

app.get(
  "/payer",
  auth,
  (req, res) => {

    const plan =
      req.query.plan === "30"
        ? "30"
        : "15";

    const amount =
      plan === "30"
        ? 100
        : 70;

    const user =
      db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE id = ?
          `
        )
        .get(
          req.session.userId
        );

    const number =
      process.env.ORANGE_MONEY_NUMBER ||
      "À CONFIGURER";

    const merchant =
      process.env.ORANGE_MONEY_NAME ||
      "À CONFIGURER";

    res.send(
      page(
        req,
        "Paiement",
        `

<div class="formbox">

<h1>
Paiement Orange Money
</h1>

<p>

Abonnement :

<b>
${
  plan === "30"
    ? "1 mois"
    : "15 jours"
}
</b>

—

<b>
${amount} €
</b>

</p>

<div class="notice">

Numéro Orange Money :

<b>
${safe(number)}
</b>

<br><br>

Nom :

<b>
${safe(merchant)}
</b>

</div>

<form
method="post"
action="/payer"
>

<input
type="hidden"
name="plan"
value="${plan}"
>

<label>

Numéro Orange Money utilisé

<input
name="phone"
value="${safe(user.phone)}"
required
>

</label>

<label>

Référence / ID de transaction

<input
name="transaction_ref"
required
>

</label>

<button
class="btn"
>
Envoyer la demande
</button>

</form>

</div>

`
      )
    );
  }
);

app.post(
  "/payer",
  auth,
  (req, res) => {

    const plan =
      req.body.plan === "30"
        ? "30"
        : "15";

    const amount =
      plan === "30"
        ? 100
        : 70;

    const phone =
      String(
        req.body.phone || ""
      ).trim();

    const transactionRef =
      String(
        req.body.transaction_ref || ""
      ).trim();

    if (
      !phone ||
      !transactionRef
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">

            <h1>
              Informations manquantes
            </h1>

          </div>
          `
        )
      );
    }

    db.prepare(
      `
      INSERT INTO payments
      (
        user_id,
        plan,
        amount_eur,
        phone,
        transaction_ref
      )
      VALUES (?, ?, ?, ?, ?)
      `
    ).run(
      req.session.userId,
      plan,
      amount,
      phone,
      transactionRef
    );

    res.send(
      page(
        req,
        "Paiement envoyé",
        `

<div class="formbox">

<h1>
Demande reçue ✅
</h1>

<p>
Votre demande a été enregistrée.
</p>

<p>
Après vérification, votre accès VIP
sera activé.
</p>

<a
class="btn"
href="/compte"
>
Mon compte
</a>

</div>

`
      )
    );
  }
);

/* =========================================================
   COMPTE
========================================================= */

app.get(
  "/compte",
  auth,
  (req, res) => {

    const user =
      db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE id = ?
          `
        )
        .get(
          req.session.userId
        );

    if (!user) {

      return req.session.destroy(
        () =>
          res.redirect(
            "/connexion"
          )
      );
    }

    const payments =
      db
        .prepare(
          `
          SELECT *
          FROM payments
          WHERE user_id = ?
          ORDER BY id DESC
          `
        )
        .all(user.id);

    res.send(
      page(
        req,
        "Mon compte",
        `

<div class="card">

<h1>
Bonjour ${safe(user.name)}
</h1>

<p>
${safe(user.email)}
•
${safe(user.phone)}
</p>

<h2>
Statut :
${
  isVip(user)
    ? "🟢 VIP actif"
    : "⚪ Non abonné"
}
</h2>

${
  isVip(user)
    ? `
      <div class="vip">

      <p>
      Votre accès VIP expire le :
      <b>
      ${new Date(
        user.vip_until
      ).toLocaleString("fr-FR")}
      </b>
      </p>

      <a
      class="btn"
      href="/pronostic"
      >
      Accéder au pronostic
      </a>

      </div>
      `
    : `
      <a
      class="btn"
      href="/abonnement"
      >
      Choisir un abonnement
      </a>
      `
}

<h2>
Mes paiements
</h2>

${
  payments.length
    ? payments
        .map(
          p => `

<div class="row">

<b>
Commande #${p.id}
</b>

<br>

${p.amount_eur}
€
—
${safe(p.status)}

<br>

Référence :

${safe(
  p.transaction_ref || "-"
)}

</div>

`
        )
        .join("")
    : "<p>Aucun paiement.</p>"
}

</div>

`
      )
    );
  }
);

/* =========================================================
   PRONOSTIC VIP
========================================================= */

app.get(
  "/pronostic",
  auth,
  (req, res) => {

    const user =
      db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE id = ?
          `
        )
        .get(
          req.session.userId
        );

    if (
      !user ||
      (
        user.role !== "admin" &&
        !isVip(user)
      )
    ) {

      return res.redirect(
        "/abonnement"
      );
    }

    const t =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          ORDER BY race_date DESC, id DESC
          LIMIT 1
          `
        )
        .get();

    if (!t) {

      return res.send(
        page(
          req,
          "Pronostic",
          `
          <div class="card">

            <h1>
              Aucun pronostic disponible.
            </h1>

          </div>
          `
        )
      );
    }

    res.send(
      page(
        req,
        "Pronostic VIP",
        `

<div class="card">

<h1>
🔐 PRONOSTIC VIP
</h1>

<h2>
${safe(t.title)}
</h2>

<p>

📅
${formatDate(t.race_date)}

•

🕐
${safe(t.start_time)}

•

🏇
${safe(t.course)}

•

📏
${safe(t.distance)}

•

🐎
${safe(t.runners)}
partants

</p>

${tipFields(t)}

</div>

`
      )
    );
  }
);

/* =========================================================
   FORMULAIRE PRONOSTIC ADMIN
========================================================= */

function tipForm(
  t = {},
  action = "/admin/tip/new"
) {

  return `

<div class="formbox">

<h1>
${
  t.id
    ? "✏️ Modifier"
    : "➕ Nouveau"
}
pronostic
</h1>

<form
method="post"
action="${action}"
>

<label>

Date

<input
type="date"
name="race_date"
value="${safe(t.race_date)}"
required
>

</label>

<label>

Titre

<input
name="title"
value="${safe(t.title)}"
placeholder="Quinté du jour — R1C1"
required
>

</label>

<label>

Heure

<input
name="start_time"
value="${safe(t.start_time)}"
placeholder="13H50"
required
>

</label>

<label>

Hippodrome

<input
name="course"
value="${safe(t.course)}"
placeholder="Deauville"
required
>

</label>

<label>

Distance

<input
name="distance"
value="${safe(t.distance)}"
placeholder="2 400 M"
required
>

</label>

<label>

Nombre de partants

<input
type="number"
name="runners"
min="1"
value="${safe(t.runners || "")}"
required
>

</label>

<label>

Bases

<input
name="bases"
value="${safe(t.bases)}"
required
>

</label>

<label>

Secondes chances

<input
name="second_chances"
value="${safe(t.second_chances)}"
required
>

</label>

<label>

Outsiders

<input
name="outsiders"
value="${safe(t.outsiders)}"
required
>

</label>

<label>

Remplaçant

<input
name="replacement"
value="${safe(
  t.replacement || ""
)}"
>

</label>

<hr>

<h2>
🎯 Jeux du jour
</h2>

<label>

Tiercé — 6 chevaux

<input
name="tierce"
value="${safe(
  t.tierce || ""
)}"
required
>

</label>

<label>

Quarté — 7 chevaux

<input
name="quarte"
value="${safe(
  t.quarte || ""
)}"
required
>

</label>

<label>

Quinté — 8 chevaux

<input
name="quinte"
value="${safe(
  t.quinte || ""
)}"
required
>

</label>

<label>

Notes / commentaire

<textarea
name="notes"
>${safe(
  t.notes || ""
)}</textarea>

</label>

<button
class="btn success"
>
${
  t.id
    ? "Enregistrer les modifications"
    : "Publier le pronostic"
}
</button>

</form>

</div>

`;
}

/* =========================================================
   ADMIN
========================================================= */

app.get(
  "/admin",
  adminOnly,
  (req, res) => {

    const users =
      db
        .prepare(
          `
          SELECT
            id,
            name,
            email,
            phone,
            role,
            vip_until
          FROM users
          ORDER BY id DESC
          `
        )
        .all();

    const payments =
      db
        .prepare(
          `
          SELECT
            p.*,
            u.name,
            u.email
          FROM payments p
          JOIN users u
            ON u.id = p.user_id
          ORDER BY p.id DESC
          `
        )
        .all();

    const tips =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          ORDER BY race_date DESC, id DESC
          `
        )
        .all();

    res.send(
      page(
        req,
        "Administration",
        `

<div class="card">

<h1>
⚙️ Administration
</h1>

<p>
Bienvenue dans l'espace administrateur.
</p>

<h2>
🏇 Gestion des pronostics
</h2>

<a
class="btn success"
href="/admin/tip/new"
>
➕ Nouveau pronostic
</a>

${
  tips.length
    ? tips
        .map(
          t => `

<div class="row">

<b>
${formatDate(t.race_date)}
—
${safe(t.title)}
</b>

<br><br>

Bases :
${safe(t.bases)}

<br>

Secondes chances :
${safe(t.second_chances)}

<br>

Outsiders :
${safe(t.outsiders)}

<br>

Remplaçant :
${safe(t.replacement || "-")}

<br><br>

<b>
Tiercé — 6 :
</b>

${safe(t.tierce || "-")}

<br>

<b>
Quarté — 7 :
</b>

${safe(t.quarte || "-")}

<br>

<b>
Quinté — 8 :
</b>

${safe(t.quinte || "-")}

<div class="admin-actions">

<a
class="btn"
href="/admin/tip/edit/${t.id}"
>
Modifier
</a>

<form
method="post"
action="/admin/tip/delete"
>

<input
type="hidden"
name="id"
value="${t.id}"
>

<button
class="btn danger"
onclick="return confirm('Supprimer ce pronostic ?')"
>
Supprimer
</button>

</form>

</div>

</div>

`
        )
        .join("")
    : "<p>Aucun pronostic.</p>"
}

<h2>
💳 Demandes de paiement
</h2>

${
  payments.length
    ? payments
        .map(
          p => `

<div class="row">

<b>
#${p.id}
—
${safe(p.name)}
—
${p.amount_eur} €
</b>

<br>

Téléphone :
${safe(p.phone)}

<br>

Référence :
${safe(
  p.transaction_ref || "-"
)}

<br>

Statut :
<b>
${safe(p.status)}
</b>

${
  p.status === "pending"
    ? `

<form
method="post"
action="/admin/confirm"
>

<input
type="hidden"
name="payment_id"
value="${p.id}"
>

<button
class="btn success"
>
Confirmer le paiement
</button>

</form>

`
    : ""
}

</div>

`
        )
        .join("")
    : "<p>Aucune demande de paiement.</p>"
}

<h2>
👥 Comptes utilisateurs
</h2>

${
  users
    .map(
      u => `

<div class="row">

<b>
${safe(u.name)}
</b>

—

${safe(u.email)}

<br>

Rôle :
<b>
${safe(u.role)}
</b>

<br>

VIP :

${
  u.vip_until
    ? safe(u.vip_until)
    : "non"
}

</div>

`
    )
    .join("")
}

</div>

`
      )
    );
  }
);

/* =========================================================
   NOUVEAU PRONOSTIC
========================================================= */

app.get(
  "/admin/tip/new",
  adminOnly,
  (req, res) => {

    res.send(
      page(
        req,
        "Nouveau pronostic",
        tipForm()
      )
    );
  }
);

function validTip(body) {

  const runners =
    Number(body.runners);

  return (
    body.race_date &&
    body.title &&
    body.start_time &&
    body.course &&
    body.distance &&
    Number.isInteger(runners) &&
    runners > 0 &&
    body.bases &&
    body.second_chances &&
    body.outsiders &&
    body.tierce &&
    body.quarte &&
    body.quinte
  );
}

function tipValues(body) {

  return [
    body.race_date,
    body.title,
    body.start_time,
    body.course,
    body.distance,
    Number(body.runners),
    body.bases,
    body.second_chances,
    body.outsiders,
    body.replacement || "",
    body.tierce,
    body.quarte,
    body.quinte,
    body.notes || ""
  ];
}

app.post(
  "/admin/tip/new",
  adminOnly,
  (req, res) => {

    if (!validTip(req.body)) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">

            <h1>
              ❌ Données invalides
            </h1>

            <a
              class="btn"
              href="/admin/tip/new"
            >
              Retour
            </a>

          </div>
          `
        )
      );
    }

    db.prepare(
      `
      INSERT INTO tips
      (
        race_date,
        title,
        start_time,
        course,
        distance,
        runners,
        bases,
        second_chances,
        outsiders,
        replacement,
        tierce,
        quarte,
        quinte,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      ...tipValues(req.body)
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   MODIFICATION PRONOSTIC
========================================================= */

app.get(
  "/admin/tip/edit/:id",
  adminOnly,
  (req, res) => {

    const t =
      db
        .prepare(
          `
          SELECT *
          FROM tips
          WHERE id = ?
          `
        )
        .get(
          req.params.id
        );

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">

            <h1>
              Pronostic introuvable
            </h1>

          </div>
          `
        )
      );
    }

    res.send(
      page(
        req,
        "Modifier pronostic",
        tipForm(
          t,
          `/admin/tip/edit/${t.id}`
        )
      )
    );
  }
);

app.post(
  "/admin/tip/edit/:id",
  adminOnly,
  (req, res) => {

    if (!validTip(req.body)) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">

            <h1>
              ❌ Données invalides
            </h1>

            <a
              class="btn"
              href="/admin"
            >
              Retour Admin
            </a>

          </div>
          `
        )
      );
    }

    db.prepare(
      `
      UPDATE tips
      SET
        race_date = ?,
        title = ?,
        start_time = ?,
        course = ?,
        distance = ?,
        runners = ?,
        bases = ?,
        second_chances = ?,
        outsiders = ?,
        replacement = ?,
        tierce = ?,
        quarte = ?,
        quinte = ?,
        notes = ?
      WHERE id = ?
      `
    ).run(
      ...tipValues(req.body),
      req.params.id
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   SUPPRESSION PRONOSTIC
========================================================= */

app.post(
  "/admin/tip/delete",
  adminOnly,
  (req, res) => {

    const id =
      Number(req.body.id);

    if (
      !Number.isInteger(id)
    ) {

      return res.status(400).send(
        "Identifiant invalide."
      );
    }

    db.prepare(
      `
      DELETE FROM tips
      WHERE id = ?
      `
    ).run(id);

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   CONFIRMATION PAIEMENT
========================================================= */

app.post(
  "/admin/confirm",
  adminOnly,
  (req, res) => {

    const payment =
      db
        .prepare(
          `
          SELECT *
          FROM payments
          WHERE id = ?
          `
        )
        .get(
          req.body.payment_id
        );

    if (!payment) {

      return res.status(404).send(
        "Paiement introuvable."
      );
    }

    /*
       Évite de confirmer deux fois
       le même paiement.
    */

    if (
      payment.status ===
      "confirmed"
    ) {

      return res.redirect(
        "/admin"
      );
    }

    const user =
      db
        .prepare(
          `
          SELECT *
          FROM users
          WHERE id = ?
          `
        )
        .get(
          payment.user_id
        );

    if (!user) {

      return res.status(404).send(
        "Utilisateur introuvable."
      );
    }

    let baseDate =
      new Date();

    /*
       Si le VIP est déjà actif,
       on ajoute les jours à la date
       d'expiration existante.
    */

    if (
      user.vip_until &&
      new Date(user.vip_until) >
        baseDate
    ) {

      baseDate =
        new Date(
          user.vip_until
        );
    }

    const days =
      payment.plan === "30"
        ? 30
        : 15;

    const vipUntil =
      new Date(
        baseDate.getTime() +
        days *
          24 *
          60 *
          60 *
          1000
      ).toISOString();

    const transaction =
      db.transaction(
        () => {

          db.prepare(
            `
            UPDATE payments
            SET
              status = 'confirmed',
              confirmed_at =
                CURRENT_TIMESTAMP
            WHERE id = ?
            `
          ).run(
            payment.id
          );

          db.prepare(
            `
            UPDATE users
            SET vip_until = ?
            WHERE id = ?
            `
          ).run(
            vipUntil,
            payment.user_id
          );
        }
      );

    transaction();

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   404
========================================================= */

app.use(
  (req, res) => {

    res.status(404).send(
      page(
        req,
        "Page introuvable",
        `
        <div class="card">

          <h1>
            404 — Page introuvable
          </h1>

          <a
            class="btn"
            href="/"
          >
            Retour à l'accueil
          </a>

        </div>
        `
      )
    );
  }
);

/* =========================================================
   ERREURS
========================================================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {

    console.error(
      "Erreur serveur :",
      err
    );

    if (
      res.headersSent
    ) {
      return next(err);
    }

    res.status(500).send(
      page(
        req,
        "Erreur serveur",
        `
        <div class="card">

          <h1>
            ❌ Erreur serveur
          </h1>

          <p>
            Une erreur inattendue
            est survenue.
          </p>

          <a
            class="btn"
            href="/"
          >
            Accueil
          </a>

        </div>
        `
      )
    );
  }
);

/* =========================================================
   DÉMARRAGE
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "=========================================="
    );

    console.log(
      "SPÉCIAL QUINTÉ FRANÇAIS"
    );

    console.log(
      "Serveur lancé sur le port " +
      PORT
    );

    console.log(
      "Admin : " +
      ADMIN_EMAIL
    );

    console.log(
      "Tiercé : 6 chevaux"
    );

    console.log(
      "Quarté : 7 chevaux"
    );

    console.log(
      "Quinté : 8 chevaux"
    );

    console.log(
      "Accueil : pronostic masqué"
    );

    console.log(
      "Archives : publiques"
    );

    console.log(
      "=========================================="
    );
  }
);
