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
  process.env.ADMIN_EMAIL ||
  "admin@special-quinte-francais.com";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  "Compta@09";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "SPECIAL-QUINTE-FRANCAIS-SECRET";

/* =========================================================
   BASE DE DONNÉES
========================================================= */

const db = new Database("data.db");

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
  notes TEXT
);
`);

/* =========================================================
   MISE À JOUR AUTOMATIQUE DE LA TABLE TIPS
   AJOUT DES NOUVELLES COLONNES
========================================================= */

function addColumnIfMissing(table, column, definition) {
  const columns = db
    .prepare(`PRAGMA table_info(${table})`)
    .all();

  const exists = columns.some(
    col => col.name === column
  );

  if (!exists) {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );

    console.log(
      `Colonne ${column} ajoutée à la table ${table}.`
    );
  }
}

/*
  Ces colonnes sont ajoutées automatiquement
  même si data.db existe déjà.
*/

addColumnIfMissing(
  "tips",
  "tierce",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "tips",
  "quarte",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "tips",
  "quinte",
  "TEXT DEFAULT ''"
);

/* =========================================================
   CRÉATION / MISE À JOUR ADMIN
========================================================= */

const adminHash =
  bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

const existingAdmin =
  db
    .prepare(
      "SELECT id FROM users WHERE email = ?"
    )
    .get(ADMIN_EMAIL);

if (!existingAdmin) {

  db.prepare(`
    INSERT INTO users
    (
      name,
      email,
      phone,
      password_hash,
      role
    )
    VALUES (?, ?, ?, ?, ?)
  `).run(
    "Administrateur",
    ADMIN_EMAIL,
    "0000000000",
    adminHash,
    "admin"
  );

  console.log(
    "Compte administrateur français créé."
  );

} else {

  db.prepare(`
    UPDATE users
    SET
      password_hash = ?,
      role = 'admin'
    WHERE email = ?
  `).run(
    adminHash,
    ADMIN_EMAIL
  );

  console.log(
    "Compte administrateur français vérifié."
  );
}

/* =========================================================
   PRONOSTIC PAR DÉFAUT
   UNIQUEMENT SI LA BASE EST VIDE
========================================================= */

const existingTip =
  db
    .prepare(
      "SELECT id FROM tips LIMIT 1"
    )
    .get();

if (!existingTip) {

  db.prepare(`
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
      notes,
      tierce,
      quarte,
      quinte
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
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
    "Pronostic de démonstration à remplacer par votre sélection du jour.",
    "5 – 8 – 12 – 3 – 7 – 10",
    "5 – 8 – 12 – 3 – 7 – 10 – 2",
    "5 – 8 – 12 – 3 – 7 – 10 – 2 – 11"
  );

  console.log(
    "Pronostic de démonstration créé."
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

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure:
        process.env.NODE_ENV === "production",
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
   AUTHENTIFICATION
========================================================= */

function auth(req, res, next) {

  if (!req.session.userId) {
    return res.redirect(
      "/connexion"
    );
  }

  next();
}

function admin(req, res, next) {

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
   UTILITAIRES
========================================================= */

function safe(value) {

  return String(value ?? "")
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    );
}

function isVip(user) {

  return (
    user &&
    user.vip_until &&
    new Date(user.vip_until) >
      new Date()
  );
}

function formatDate(dateString) {

  if (!dateString) {
    return "";
  }

  const date =
    new Date(
      dateString +
      "T00:00:00"
    );

  return date.toLocaleDateString(
    "fr-FR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }
  );
}

function todayString() {

  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(
      2,
      "0"
    );

  const day =
    String(
      now.getDate()
    ).padStart(
      2,
      "0"
    );

  return (
    `${year}-${month}-${day}`
  );
}

/* =========================================================
   TEMPLATE PRINCIPAL
========================================================= */

function page(
  req,
  title,
  body
) {

  const logged =
    !!req.session.userId;

  const isAdmin =
    req.session.role === "admin";

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

.hero {
  background: white;
  padding: 30px;
  border-radius: 14px;
  margin-bottom: 20px;
  text-align: center;
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
    repeat(
      auto-fit,
      minmax(280px, 1fr)
    );
  gap: 20px;
}

.card,
.formbox,
.plan {
  background: white;
  padding: 22px;
  border-radius: 12px;
  box-shadow:
    0 3px 15px rgba(0,0,0,.08);
  margin-bottom: 20px;
}

.picks {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(180px, 1fr)
    );
  gap: 12px;
  margin: 20px 0;
}

.picks b {
  padding: 18px;
  border-radius: 10px;
  background: #eef2ff;
  text-align: center;
}

.picks span {
  display: block;
  font-size: 21px;
  margin-top: 8px;
}

.selection-card {
  background: white;
  border-radius: 12px;
  padding: 18px;
  margin: 12px 0;
  box-shadow:
    0 3px 12px rgba(0,0,0,.07);
  text-align: center;
}

.selection-card h3 {
  margin: 0 0 10px;
}

.selection-card .numbers {
  font-size: 21px;
  font-weight: bold;
  letter-spacing: .5px;
}

.notice {
  background: #fff7ed;
  padding: 15px;
  border-radius: 8px;
}

.btn {
  display: inline-block;
  border: none;
  background: #111827;
  color: white;
  text-decoration: none;
  padding: 11px 18px;
  border-radius: 7px;
  cursor: pointer;
}

.btn:hover {
  opacity: .88;
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

.danger {
  background: #b91c1c;
}

.success {
  background: #166534;
}

.vip {
  background: #fef3c7;
  padding: 15px;
  border-radius: 8px;
}

.locked {
  background: #f3f4f6;
  padding: 25px;
  border-radius: 12px;
  text-align: center;
  margin-top: 20px;
}

.locked h3 {
  margin-top: 0;
}

.lock-icon {
  font-size: 40px;
  margin-bottom: 10px;
}

.archive-card {
  background: white;
  padding: 22px;
  border-radius: 14px;
  margin-bottom: 20px;
  box-shadow:
    0 3px 15px rgba(0,0,0,.08);
}

.archive-date {
  color: #555;
  font-size: 14px;
  margin-bottom: 8px;
}

.archive-title {
  margin-top: 0;
  color: #111827;
}

.archive-info {
  background: #f9fafb;
  padding: 12px;
  border-radius: 8px;
  margin: 12px 0;
}

.archive-picks {
  display: grid;
  grid-template-columns:
    repeat(
      auto-fit,
      minmax(150px, 1fr)
    );
  gap: 10px;
  margin-top: 15px;
}

.archive-pick {
  background: #eef2ff;
  padding: 14px;
  border-radius: 8px;
  text-align: center;
}

.archive-pick strong {
  display: block;
  margin-bottom: 7px;
}

.archive-pick span {
  font-size: 20px;
  font-weight: bold;
}

.archive-notes {
  background: #fff7ed;
  padding: 14px;
  border-radius: 8px;
  margin-top: 15px;
}

.archive-header {
  text-align: center;
  background: white;
  padding: 25px;
  border-radius: 14px;
  margin-bottom: 20px;
}

@media(max-width:600px) {

  main {
    padding: 15px 10px;
  }

  header {
    padding: 15px 12px;
  }

  .hero {
    padding: 20px 15px;
  }

  .card,
  .formbox,
  .archive-card {
    padding: 17px;
  }

  .picks {
    grid-template-columns: 1fr 1fr;
  }

  .archive-picks {
    grid-template-columns: 1fr 1fr;
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
   ACCUEIL
========================================================= */

app.get(
  "/",
  (req, res) => {

    const t =
      db
        .prepare(`
          SELECT *
          FROM tips
          ORDER BY
            race_date DESC,
            id DESC
          LIMIT 1
        `)
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
${safe(t.runners)} partants
•
${safe(t.distance)}
</span>

</div>

<a
  class="btn"
  href="/abonnement"
>
Voir les abonnements
</a>

</section>

<div class="grid">

<div class="card">

<h2>
🔒 Pronostic du jour
</h2>

<div class="locked">

<div class="lock-icon">
🔐
</div>

<h3>
Pronostic réservé aux membres VIP
</h3>

<p>
Les numéros et la sélection complète
du Quinté sont protégés et accessibles
uniquement aux abonnés VIP.
</p>

<a
  class="btn"
  href="/abonnement"
>
👑 Accéder au VIP
</a>

</div>

</div>

<div class="card">

<h2>
🗂️ Archives
</h2>

<p>
Retrouvez les anciens pronostics,
avec leurs différentes sélections.
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
   ARCHIVES
========================================================= */

app.get(
  "/archives",
  (req, res) => {

    const today =
      todayString();

    const archives =
      db
        .prepare(`
          SELECT *
          FROM tips
          WHERE race_date < ?
          ORDER BY
            race_date DESC,
            id DESC
        `)
        .all(today);

    let content = `

<div class="archive-header">

<h1>
🗂️ ARCHIVES DES PRONOSTICS
</h1>

<p>
Retrouvez les anciens pronostics de
<b>Spécial Quinté Français</b>.
</p>

<p>
Les sélections publiées dans les archives
restent consultables par les visiteurs.
</p>

</div>

`;

    if (!archives.length) {

      content += `

      <div class="card">

        <h2>
        Aucune archive pour le moment
        </h2>

        <p>
        Les anciens pronostics apparaîtront
        automatiquement ici après leur date
        de course.
        </p>

      </div>

      `;

    } else {

      content += archives
        .map(t => {

          return `

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
🔒 BASES
</strong>

<span>
${safe(t.bases)}
</span>

</div>

<div class="archive-pick">

<strong>
🎯 SECONDES CHANCES
</strong>

<span>
${safe(t.second_chances)}
</span>

</div>

<div class="archive-pick">

<strong>
💣 OUTSIDERS
</strong>

<span>
${safe(t.outsiders)}
</span>

</div>

<div class="archive-pick">

<strong>
🔄 REMPLAÇANT
</strong>

<span>
${safe(t.replacement || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 TIERCÉ — 6 CHEVAUX
</strong>

<span>
${safe(t.tierce || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 QUARTÉ — 7 CHEVAUX
</strong>

<span>
${safe(t.quarte || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 QUINTÉ — 8 CHEVAUX
</strong>

<span>
${safe(t.quinte || "-")}
</span>

</div>

</div>

${
  t.notes
    ? `
    <div class="archive-notes">

      📝
      <b>Commentaire :</b>

      <br>

      ${safe(t.notes)}

    </div>
    `
    : ""
}

<div style="margin-top:15px">

<a
  class="btn"
  href="/archives/${t.id}"
>
Voir le pronostic complet
</a>

</div>

</div>

`;

        })
        .join("");

    }

    res.send(
      page(
        req,
        "Archives",
        content
      )
    );
  }
);

/* =========================================================
   ARCHIVE — DÉTAIL
========================================================= */

app.get(
  "/archives/:id",
  (req, res) => {

    const t =
      db
        .prepare(`
          SELECT *
          FROM tips
          WHERE id = ?
        `)
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

            <p>
              Ce pronostic n'existe pas
              ou a été supprimé.
            </p>

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
        "Archive — " + t.title,
        `

<div class="archive-card">

<div class="archive-date">

📅
${formatDate(t.race_date)}

•
🕐
${safe(t.start_time)}

</div>

<h1 class="archive-title">

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

<h2>
🏇 Sélection
</h2>

<div class="archive-picks">

<div class="archive-pick">

<strong>
🔒 BASES
</strong>

<span>
${safe(t.bases)}
</span>

</div>

<div class="archive-pick">

<strong>
🎯 SECONDES CHANCES
</strong>

<span>
${safe(t.second_chances)}
</span>

</div>

<div class="archive-pick">

<strong>
💣 OUTSIDERS
</strong>

<span>
${safe(t.outsiders)}
</span>

</div>

<div class="archive-pick">

<strong>
🔄 REMPLAÇANT
</strong>

<span>
${safe(t.replacement || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 TIERCÉ — 6 CHEVAUX
</strong>

<span>
${safe(t.tierce || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 QUARTÉ — 7 CHEVAUX
</strong>

<span>
${safe(t.quarte || "-")}
</span>

</div>

<div class="archive-pick">

<strong>
🏇 QUINTÉ — 8 CHEVAUX
</strong>

<span>
${safe(t.quinte || "-")}
</span>

</div>

</div>

${
  t.notes
    ? `
    <div class="archive-notes">

      📝
      <b>Commentaire :</b>

      <br><br>

      ${safe(t.notes)}

    </div>
    `
    : ""
}

<div style="margin-top:20px">

<a
  class="btn"
  href="/archives"
>
← Retour aux archives
</a>

</div>

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
          <div class="formbox">

            <h1>
              Erreur
            </h1>

            <p>
              Informations manquantes.
            </p>

          </div>
          `
        )
      );
    }

    try {

      const hash =
        bcrypt.hashSync(
          password,
          12
        );

      const info =
        db
          .prepare(`
            INSERT INTO users
            (
              name,
              email,
              phone,
              password_hash,
              role
            )
            VALUES (?, ?, ?, ?, ?)
          `)
          .run(
            name.trim(),
            email
              .trim()
              .toLowerCase(),
            phone.trim(),
            hash,
            "member"
          );

      req.session.userId =
        info.lastInsertRowid;

      req.session.role =
        "member";

      res.redirect(
        "/abonnement"
      );

    } catch (e) {

      console.error(
        "Erreur inscription :",
        e.message
      );

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
  required
>

</label>

<label>

Mot de passe

<input
  type="password"
  name="password"
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
      (req.body.email || "")
        .trim()
        .toLowerCase();

    const u =
      db
        .prepare(`
          SELECT *
          FROM users
          WHERE email = ?
        `)
        .get(email);

    if (
      !u ||
      !bcrypt.compareSync(
        req.body.password || "",
        u.password_hash
      )
    ) {

      return res.status(401).send(
        page(
          req,
          "Connexion",
          `

<div class="formbox">

<h1>
Connexion
</h1>

<p>
Identifiants incorrects.
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

    req.session.userId =
      u.id;

    req.session.role =
      u.role;

    if (
      u.role === "admin"
    ) {
      return res.redirect(
        "/admin"
      );
    }

    res.redirect(
      "/compte"
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
Après votre paiement, indiquez votre référence
de transaction afin que l'administrateur puisse
vérifier et activer votre accès.
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
        .prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `)
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
          "Erreur paiement",
          `
          <div class="formbox">

            <h1>
              Erreur
            </h1>

            <p>
              Veuillez renseigner
              le numéro et la référence
              de transaction.
            </p>

            <a
              class="btn"
              href="/abonnement"
            >
              Retour
            </a>

          </div>
          `
        )
      );
    }

    db.prepare(`
      INSERT INTO payments
      (
        user_id,
        plan,
        amount_eur,
        phone,
        transaction_ref
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(
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
Votre demande de paiement a été enregistrée.
</p>

<p>
Après confirmation par l'administrateur,
votre accès VIP sera activé.
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

    const u =
      db
        .prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `)
        .get(
          req.session.userId
        );

    const payments =
      db
        .prepare(`
          SELECT *
          FROM payments
          WHERE user_id = ?
          ORDER BY id DESC
        `)
        .all(u.id);

    const active =
      isVip(u);

    res.send(
      page(
        req,
        "Mon compte",
        `

<div class="card">

<h1>
Bonjour ${safe(u.name)}
</h1>

<p>
${safe(u.email)}
•
${safe(u.phone)}
</p>

<h2>
Statut :
${
  active
    ? "🟢 VIP actif"
    : "⚪ Non abonné"
}
</h2>

${
  active
    ? `

<div class="vip">

<p>

Votre accès VIP expire le :

<b>
${new Date(
  u.vip_until
).toLocaleString(
  "fr-FR"
)}
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

${p.amount_eur} €
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

    const u =
      db
        .prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `)
        .get(
          req.session.userId
        );

    if (
      !isVip(u) &&
      u.role !== "admin"
    ) {

      return res.redirect(
        "/abonnement"
      );
    }

    const t =
      db
        .prepare(`
          SELECT *
          FROM tips
          ORDER BY
            race_date DESC,
            id DESC
          LIMIT 1
        `)
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

${formatDate(t.race_date)}

•

${safe(t.start_time)}

•

${safe(t.course)}

•

${safe(t.distance)}

•

${safe(t.runners)}
partants

</p>

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
🎯 Combinaisons principales
</h2>

<div class="selection-card">

<h3>
🏇 TIERCÉ — 6 CHEVAUX
</h3>

<div class="numbers">
${safe(t.tierce || "-")}
</div>

</div>

<div class="selection-card">

<h3>
🏇 QUARTÉ — 7 CHEVAUX
</h3>

<div class="numbers">
${safe(t.quarte || "-")}
</div>

</div>

<div class="selection-card">

<h3>
🏇 QUINTÉ — 8 CHEVAUX
</h3>

<div class="numbers">
${safe(t.quinte || "-")}
</div>

</div>

<div class="notice">

${safe(t.notes || "")}

</div>

</div>

`
      )
    );
  }
);

/* =========================================================
   ADMINISTRATION
========================================================= */

app.get(
  "/admin",
  admin,
  (req, res) => {

    const users =
      db
        .prepare(`
          SELECT
            id,
            name,
            email,
            phone,
            role,
            vip_until
          FROM users
          ORDER BY id DESC
        `)
        .all();

    const payments =
      db
        .prepare(`
          SELECT
            p.*,
            u.name,
            u.email
          FROM payments p
          JOIN users u
            ON u.id = p.user_id
          ORDER BY p.id DESC
        `)
        .all();

    const tips =
      db
        .prepare(`
          SELECT *
          FROM tips
          ORDER BY
            race_date DESC,
            id DESC
        `)
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

Bienvenue dans l'espace administrateur du

<b>
Spécial Quinté Français
</b>

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

${tips
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

<br>

Tiercé 6 chevaux :
<b>
${safe(t.tierce || "-")}
</b>

<br>

Quarté 7 chevaux :
<b>
${safe(t.quarte || "-")}
</b>

<br>

Quinté 8 chevaux :
<b>
${safe(t.quinte || "-")}
</b>

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
  style="display:inline"
>

<input
  type="hidden"
  name="id"
  value="${t.id}"
>

<button
  class="btn danger"
  type="submit"
  onclick="return confirm('Supprimer ce pronostic ?')"
>
Supprimer
</button>

</form>

</div>

</div>

`
  )
  .join("")}

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
</b>

—

${safe(p.name)}

—

${p.amount_eur} €

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
  style="margin-top:10px"
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
  admin,
  (req, res) => {

    res.send(
      page(
        req,
        "Nouveau pronostic",
        `

<div class="formbox">

<h1>
➕ Nouveau pronostic
</h1>

<form
  method="post"
  action="/admin/tip/new"
>

<label>

Date de la course

<input
  type="date"
  name="race_date"
  required
>

</label>

<label>

Titre

<input
  name="title"
  placeholder="Quinté du jour — R1C1"
  required
>

</label>

<label>

Heure

<input
  name="start_time"
  placeholder="13H50"
  required
>

</label>

<label>

Hippodrome

<input
  name="course"
  placeholder="Deauville"
  required
>

</label>

<label>

Distance

<input
  name="distance"
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
  required
>

</label>

<label>

Bases

<input
  name="bases"
  placeholder="5 – 8 – 12"
  required
>

</label>

<label>

Secondes chances

<input
  name="second_chances"
  placeholder="3 – 7 – 10"
  required
>

</label>

<label>

Outsiders

<input
  name="outsiders"
  placeholder="2 – 11 – 14"
  required
>

</label>

<label>

Remplaçant

<input
  name="replacement"
  placeholder="6"
>

</label>

<hr>

<h2>
🎯 Combinaisons
</h2>

<label>

🏇 Tiercé en 6 chevaux

<input
  name="tierce"
  placeholder="5 – 8 – 12 – 3 – 7 – 10"
  required
>

</label>

<label>

🏇 Quarté en 7 chevaux

<input
  name="quarte"
  placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2"
  required
>

</label>

<label>

🏇 Quinté en 8 chevaux

<input
  name="quinte"
  placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2 – 11"
  required
>

</label>

<label>

Notes / commentaire

<textarea
  name="notes"
></textarea>

</label>

<button
  class="btn success"
>
Publier le pronostic
</button>

</form>

</div>

`
      )
    );
  }
);

/* =========================================================
   ENREGISTREMENT NOUVEAU PRONOSTIC
========================================================= */

app.post(
  "/admin/tip/new",
  admin,
  (req, res) => {

    const runners =
      Number(
        req.body.runners
      );

    if (
      !req.body.race_date ||
      !req.body.title ||
      !req.body.start_time ||
      !req.body.course ||
      !req.body.distance ||
      !Number.isInteger(runners) ||
      runners < 1 ||
      !req.body.bases ||
      !req.body.second_chances ||
      !req.body.outsiders ||
      !req.body.tierce ||
      !req.body.quarte ||
      !req.body.quinte
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="formbox">

            <h1>
              Erreur
            </h1>

            <p>
              Veuillez remplir correctement
              tous les champs obligatoires.
            </p>

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

    db.prepare(`
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
        notes,
        tierce,
        quarte,
        quinte
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.body.race_date,
      req.body.title.trim(),
      req.body.start_time.trim(),
      req.body.course.trim(),
      req.body.distance.trim(),
      runners,
      req.body.bases.trim(),
      req.body.second_chances.trim(),
      req.body.outsiders.trim(),
      (req.body.replacement || "").trim(),
      (req.body.notes || "").trim(),
      req.body.tierce.trim(),
      req.body.quarte.trim(),
      req.body.quinte.trim()
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
  admin,
  (req, res) => {

    const t =
      db
        .prepare(`
          SELECT *
          FROM tips
          WHERE id = ?
        `)
        .get(
          req.params.id
        );

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Pronostic introuvable",
          `
          <div class="card">

            <h1>
              Pronostic introuvable
            </h1>

            <a
              class="btn"
              href="/admin"
            >
              Retour administration
            </a>

          </div>
          `
        )
      );
    }

    res.send(
      page(
        req,
        "Modifier pronostic",
        `

<div class="formbox">

<h1>
✏️ Modifier le pronostic
</h1>

<form
  method="post"
  action="/admin/tip/edit/${t.id}"
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
  required
>

</label>

<label>

Heure

<input
  name="start_time"
  value="${safe(t.start_time)}"
  required
>

</label>

<label>

Hippodrome

<input
  name="course"
  value="${safe(t.course)}"
  required
>

</label>

<label>

Distance

<input
  name="distance"
  value="${safe(t.distance)}"
  required
>

</label>

<label>

Partants

<input
  type="number"
  name="runners"
  value="${safe(t.runners)}"
  min="1"
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
🎯 Combinaisons
</h2>

<label>

🏇 Tiercé en 6 chevaux

<input
  name="tierce"
  value="${safe(
    t.tierce || ""
  )}"
  placeholder="5 – 8 – 12 – 3 – 7 – 10"
  required
>

</label>

<label>

🏇 Quarté en 7 chevaux

<input
  name="quarte"
  value="${safe(
    t.quarte || ""
  )}"
  placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2"
  required
>

</label>

<label>

🏇 Quinté en 8 chevaux

<input
  name="quinte"
  value="${safe(
    t.quinte || ""
  )}"
  placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2 – 11"
  required
>

</label>

<label>

Notes

<textarea
  name="notes"
>${safe(t.notes || "")}</textarea>

</label>

<button
  class="btn success"
>
Enregistrer les modifications
</button>

</form>

</div>

`
      )
    );
  }
);

/* =========================================================
   ENREGISTRER MODIFICATION
========================================================= */

app.post(
  "/admin/tip/edit/:id",
  admin,
  (req, res) => {

    const runners =
      Number(
        req.body.runners
      );

    if (
      !req.body.race_date ||
      !req.body.title ||
      !req.body.start_time ||
      !req.body.course ||
      !req.body.distance ||
      !Number.isInteger(runners) ||
      runners < 1 ||
      !req.body.bases ||
      !req.body.second_chances ||
      !req.body.outsiders ||
      !req.body.tierce ||
      !req.body.quarte ||
      !req.body.quinte
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="formbox">

            <h1>
              Erreur
            </h1>

            <p>
              Veuillez remplir correctement
              tous les champs obligatoires.
            </p>

            <a
              class="btn"
              href="/admin/tip/edit/${safe(
                req.params.id
              )}"
            >
              Retour
            </a>

          </div>
          `
        )
      );
    }

    db.prepare(`
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
        notes = ?,
        tierce = ?,
        quarte = ?,
        quinte = ?
      WHERE id = ?
    `).run(
      req.body.race_date,
      req.body.title.trim(),
      req.body.start_time.trim(),
      req.body.course.trim(),
      req.body.distance.trim(),
      runners,
      req.body.bases.trim(),
      req.body.second_chances.trim(),
      req.body.outsiders.trim(),
      (req.body.replacement || "").trim(),
      (req.body.notes || "").trim(),
      req.body.tierce.trim(),
      req.body.quarte.trim(),
      req.body.quinte.trim(),
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
  admin,
  (req, res) => {

    const id =
      Number(req.body.id);

    if (
      !Number.isInteger(id) ||
      id < 1
    ) {

      return res.status(400).send(
        "Identifiant de pronostic invalide."
      );
    }

    db.prepare(
      "DELETE FROM tips WHERE id = ?"
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
  admin,
  (req, res) => {

    const payment =
      db
        .prepare(`
          SELECT *
          FROM payments
          WHERE id = ?
        `)
        .get(
          req.body.payment_id
        );

    if (!payment) {

      return res.status(404).send(
        page(
          req,
          "Paiement introuvable",
          `
          <div class="card">

            <h1>
              Paiement introuvable
            </h1>

            <a
              class="btn"
              href="/admin"
            >
              Retour
            </a>

          </div>
          `
        )
      );
    }

    const days =
      payment.plan === "30"
        ? 30
        : 15;

    const user =
      db
        .prepare(`
          SELECT *
          FROM users
          WHERE id = ?
        `)
        .get(
          payment.user_id
        );

    /*
      Si l'utilisateur possède déjà
      un abonnement encore actif,
      le nouvel abonnement est ajouté
      à sa date d'expiration actuelle.
    */

    let startDate =
      new Date();

    if (
      user &&
      user.vip_until
    ) {

      const currentEnd =
        new Date(
          user.vip_until
        );

      if (
        currentEnd > startDate
      ) {
        startDate =
          currentEnd;
      }
    }

    const until =
      new Date(
        startDate.getTime() +
        days *
          86400000
      ).toISOString();

    db.prepare(`
      UPDATE payments
      SET
        status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      payment.id
    );

    db.prepare(`
      UPDATE users
      SET vip_until = ?
      WHERE id = ?
    `).run(
      until,
      payment.user_id
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   ROUTE 404
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

<p>
La page que vous recherchez
n'existe pas.
</p>

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
   GESTIONNAIRE D'ERREUR
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(
      "Erreur serveur :",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).send(
      page(
        req,
        "Erreur serveur",
        `

<div class="card">

<h1>
⚠️ Erreur serveur
</h1>

<p>
Une erreur temporaire est survenue.
Veuillez réessayer.
</p>

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
   DÉMARRAGE
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      "Spécial Quinté Français lancé sur le port " +
      PORT
    );

  }
);
