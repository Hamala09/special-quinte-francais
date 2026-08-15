require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

/* =========================================================
   CONFIGURATION — SPÉCIAL QUINTÉ FRANÇAIS
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

const CONTACT_EMAIL =
  process.env.CONTACT_EMAIL ||
  "contact@special-quinte-francais.com";

/*
   IMPORTANT POUR RENDER

   Si DATA_DIR=/data est configuré sur Render avec un disque
   persistant, la base de données restera conservée lors
   des nouveaux déploiements.

   En local, la base sera dans le dossier du projet.
*/

const DATA_DIR =
  process.env.DATA_DIR ||
  __dirname;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const dbPath = path.join(DATA_DIR, "data.db");

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

/* =========================================================
   TABLE UTILISATEURS
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
`);

/* =========================================================
   TABLE PAIEMENTS
========================================================= */

db.exec(`
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
`);

/* =========================================================
   TABLE PRONOSTICS
========================================================= */

db.exec(`
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
  replacement TEXT DEFAULT '',
  tierce TEXT DEFAULT '',
  quarte TEXT DEFAULT '',
  quinte TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT,
  updated_at TEXT
);
`);

/* =========================================================
   MIGRATION DES ANCIENNES BASES
========================================================= */

function addColumnIfMissing(table, column, definition) {
  try {
    db.exec(
      `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
    );
  } catch (e) {
    // La colonne existe déjà.
  }
}

addColumnIfMissing(
  "tips",
  "replacement",
  "TEXT DEFAULT ''"
);

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

addColumnIfMissing(
  "tips",
  "notes",
  "TEXT DEFAULT ''"
);

addColumnIfMissing(
  "tips",
  "published",
  "INTEGER NOT NULL DEFAULT 1"
);

addColumnIfMissing(
  "tips",
  "created_at",
  "TEXT"
);

addColumnIfMissing(
  "tips",
  "updated_at",
  "TEXT"
);

/* =========================================================
   ADMINISTRATEUR
========================================================= */

const existingAdmin = db
  .prepare(
    "SELECT id FROM users WHERE email=?"
  )
  .get(ADMIN_EMAIL);

if (!existingAdmin) {

  const hash = bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

  db.prepare(`
    INSERT INTO users
    (name,email,phone,password_hash,role)
    VALUES (?,?,?,?,?)
  `).run(
    "Administrateur",
    ADMIN_EMAIL,
    "0000000000",
    hash,
    "admin"
  );

  console.log(
    "Compte administrateur créé : " +
    ADMIN_EMAIL
  );

} else {

  const hash = bcrypt.hashSync(
    ADMIN_PASSWORD,
    12
  );

  db.prepare(`
    UPDATE users
    SET password_hash=?, role='admin'
    WHERE email=?
  `).run(
    hash,
    ADMIN_EMAIL
  );

  console.log(
    "Compte administrateur vérifié."
  );
}

/* =========================================================
   PRONOSTIC DE DÉMONSTRATION
   Créé seulement si la base est complètement vide.
========================================================= */

const existingTip = db
  .prepare("SELECT id FROM tips LIMIT 1")
  .get();

if (!existingTip) {

  const now =
    new Date().toISOString();

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
      tierce,
      quarte,
      quinte,
      notes,
      published,
      created_at,
      updated_at
    )
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
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
    "5 – 8 – 12 – 3 – 7 – 10 – 2",
    "5 – 8 – 12 – 3 – 7 – 10 – 2 – 11",
    "5 – 8 – 12 – 3 – 7 – 10 – 2 – 11 – 14",
    "Pronostic de démonstration à remplacer.",
    1,
    now,
    now
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

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
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

function loggedIn(req) {

  return !!req.session.userId;
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
   AUTHENTIFICATION
========================================================= */

function auth(req, res, next) {

  if (!loggedIn(req)) {

    return res.redirect(
      "/connexion"
    );
  }

  next();
}

function admin(req, res, next) {

  if (
    !loggedIn(req) ||
    req.session.role !== "admin"
  ) {

    return res.status(403).send(
      page(
        req,
        "Accès refusé",
        `
        <div class="formbox">
          <h1>🔒 Accès refusé</h1>

          <p>
            Accès administrateur requis.
          </p>

          <a class="btn"
             href="/connexion">
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
   TEMPLATE HTML
========================================================= */

function page(req, title, body) {

  const logged =
    loggedIn(req);

  const isAdmin =
    req.session &&
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
${safe(title)} —
Spécial Quinté Français
</title>

<style>

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family:
    Arial,
    Helvetica,
    sans-serif;
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
  font-size: 21px;
}

.logo small {
  display: block;
  font-size: 12px;
  letter-spacing: 3px;
  margin-top: 3px;
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
  padding: 9px 11px;
  border-radius: 7px;
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
  padding: 35px 15px;
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
    repeat(auto-fit,minmax(280px,1fr));
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

.plan {
  border: 1px solid #ddd;
}

.picks {
  display: grid;
  grid-template-columns:
    repeat(auto-fit,minmax(180px,1fr));
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

.success {
  background: #166534;
}

.danger {
  background: #b91c1c;
}

.secondary {
  background: #4b5563;
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
  margin-top: 12px;
}

.notice {
  background: #fff7ed;
  padding: 15px;
  border-radius: 8px;
  margin: 15px 0;
}

.vip {
  background: #ecfdf5;
  padding: 18px;
  border-radius: 10px;
}

.locked {
  background: #f3f4f6;
  padding: 25px;
  border-radius: 12px;
  text-align: center;
}

.lock-icon {
  font-size: 42px;
}

.badge {
  display: inline-block;
  background: #166534;
  color: white;
  padding: 4px 8px;
  border-radius: 5px;
  font-size: 12px;
}

.badge-off {
  background: #6b7280;
}

.small {
  color: #666;
  font-size: 14px;
}

.archive-card {
  background: white;
  padding: 20px;
  margin-bottom: 15px;
  border-radius: 10px;
  box-shadow:
    0 2px 10px rgba(0,0,0,.06);
}

hr {
  border: 0;
  border-top: 1px solid #ddd;
  margin: 25px 0;
}

</style>

</head>

<body>

<header>

<a class="logo" href="/">
♞ SPÉCIAL QUINTÉ
<small>FRANÇAIS</small>
</a>

<nav>

<a href="/">
Accueil
</a>

<a href="/pronostic">
Pronostic VIP
</a>

<a href="/archives">
📚 Archives
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

<br><br>

<a href="/contact">
📧 Nous contacter
</a>

</footer>

</body>

</html>
`;
}

/* =========================================================
   ACCUEIL
   Le dernier pronostic publié est affiché.
   Les numéros restent protégés.
========================================================= */

app.get("/", (req, res) => {

  const t = db
    .prepare(`
      SELECT *
      FROM tips
      WHERE published=1
      ORDER BY race_date DESC,id DESC
      LIMIT 1
    `)
    .get();

  if (!t) {

    return res.send(
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

          <div class="card">

            <h2>
            Aucun pronostic publié
            </h2>

            <p>
            Le prochain pronostic sera bientôt disponible.
            </p>

          </div>

        </section>
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
${safe(t.race_date)}
•
${safe(t.start_time)}
•
${safe(t.course)}
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

<h2>
Pronostic réservé aux membres VIP
</h2>

<p>
Les bases, secondes chances, outsiders
et combinaisons sont réservés aux abonnés.
</p>

<a class="btn"
href="/abonnement">
👑 Accéder au VIP
</a>

</div>

</section>

<div class="grid">

<div class="card">

<h2>
📚 Archives
</h2>

<p>
Retrouvez les anciens pronostics dans nos archives.
</p>

<a class="btn"
href="/archives">
Voir les archives
</a>

</div>

<div class="card">

<h2>
👑 Abonnement VIP
</h2>

<p>
VIP 15 jours :
<b>70 €</b>
</p>

<p>
VIP 1 mois :
<b>100 €</b>
</p>

<a class="btn"
href="/abonnement">
Voir les abonnements
</a>

</div>

</div>
`
    )
  );
});

/* =========================================================
   ARCHIVES VISIBLES PAR TOUS
========================================================= */

app.get("/archives", (req, res) => {

  const tips = db
    .prepare(`
      SELECT *
      FROM tips
      WHERE published=1
      ORDER BY race_date DESC,id DESC
    `)
    .all();

  const html =
    tips.length
      ? tips.map(t => `
<div class="archive-card">

<h2>
${safe(t.title)}
</h2>

<p>

<b>Date :</b>
${safe(t.race_date)}

<br>

<b>Heure :</b>
${safe(t.start_time)}

<br>

<b>Hippodrome :</b>
${safe(t.course)}

<br>

<b>Distance :</b>
${safe(t.distance)}

<br>

<b>Partants :</b>
${safe(t.runners)}

</p>

<div class="locked">

🔐
<b>
Pronostic VIP
</b>

<p>
La sélection complète est réservée
aux membres VIP.
</p>

<a class="btn"
href="/abonnement">
Accéder au VIP
</a>

</div>

</div>
`).join("")
      : `
<div class="card">
<h1>Aucune archive</h1>
<p>
Les anciens pronostics apparaîtront ici.
</p>
</div>
`;

  res.send(
    page(
      req,
      "Archives",
      `
<h1>
📚 Archives des pronostics
</h1>

<p>
Les archives restent enregistrées même lorsque
vous publiez un nouveau pronostic.
</p>

${html}
`
    )
  );
});

/* =========================================================
   CONTACT EMAIL
========================================================= */

app.get("/contact", (req, res) => {

  res.send(
    page(
      req,
      "Contact",
      `
<div class="formbox">

<h1>
📧 Contact
</h1>

<p>
Pour toute question concernant les abonnements,
les paiements ou l'accès VIP, contactez-nous
par e-mail.
</p>

<p>

<a class="btn"
href="mailto:${safe(CONTACT_EMAIL)}">
Envoyer un e-mail
</a>

</p>

<p>
Adresse :
<b>${safe(CONTACT_EMAIL)}</b>
</p>

</div>
`
    )
  );
});

/* =========================================================
   INSCRIPTION
========================================================= */

app.get("/inscription", (req, res) => {

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

<button class="btn">
Créer mon compte
</button>

</form>

</div>
`
    )
  );
});

app.post("/inscription", (req, res) => {

  const name =
    (req.body.name || "").trim();

  const email =
    (req.body.email || "")
      .trim()
      .toLowerCase();

  const phone =
    (req.body.phone || "").trim();

  const password =
    req.body.password || "";

  if (
    !name ||
    !email ||
    !phone ||
    !password ||
    password.length < 8
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
Veuillez remplir correctement tous les champs.
</p>

<a class="btn"
href="/inscription">
Retour
</a>

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
      db.prepare(`
        INSERT INTO users
        (
          name,
          email,
          phone,
          password_hash,
          role
        )
        VALUES (?,?,?,?,?)
      `).run(
        name,
        email,
        phone,
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

    res.status(400).send(
      page(
        req,
        "Erreur",
        `
<div class="formbox">

<h1>
Adresse e-mail déjà utilisée
</h1>

<p>
Cette adresse e-mail existe déjà.
</p>

<a class="btn"
href="/connexion">
Se connecter
</a>

</div>
`
      )
    );
  }
});

/* =========================================================
   CONNEXION
========================================================= */

app.get("/connexion", (req, res) => {

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

<button class="btn">
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
});

app.post("/connexion", (req, res) => {

  const email =
    (req.body.email || "")
      .trim()
      .toLowerCase();

  const user =
    db.prepare(
      "SELECT * FROM users WHERE email=?"
    ).get(email);

  if (
    !user ||
    !bcrypt.compareSync(
      req.body.password || "",
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
Connexion
</h1>

<p>
Identifiants incorrects.
</p>

<a class="btn"
href="/connexion">
Réessayer
</a>

</div>
`
      )
    );
  }

  req.session.userId =
    user.id;

  req.session.role =
    user.role;

  if (
    user.role === "admin"
  ) {

    return res.redirect(
      "/admin"
    );
  }

  res.redirect(
    "/compte"
  );
});

/* =========================================================
   DÉCONNEXION
========================================================= */

app.get("/deconnexion", (req, res) => {

  req.session.destroy(() => {

    res.redirect("/");

  });
});

/* =========================================================
   ABONNEMENT
========================================================= */

app.get("/abonnement", auth, (req, res) => {

  res.send(
    page(
      req,
      "Abonnement",
      `
<div class="grid">

<div class="card">

<h1>
👑 Abonnement VIP
</h1>

<div class="plan">

<h2>
VIP 15 JOURS
</h2>

<strong>
70 €
</strong>

<br><br>

<a class="btn"
href="/payer?plan=15">
Choisir
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

<a class="btn"
href="/payer?plan=30">
Choisir
</a>

</div>

</div>

<div class="card">

<h2>
📧 Paiement
</h2>

<p>
Le numéro Orange Money n'est pas affiché
sur le site.
</p>

<p>
Contactez-nous par e-mail pour recevoir
les instructions de paiement.
</p>

<a class="btn"
href="/contact">
Contacter par e-mail
</a>

</div>

</div>
`
    )
  );
});

/* =========================================================
   DEMANDE DE PAIEMENT
========================================================= */

app.get("/payer", auth, (req, res) => {

  const plan =
    req.query.plan === "30"
      ? "30"
      : "15";

  const amount =
    plan === "30"
      ? 100
      : 70;

  const user =
    db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(
      req.session.userId
    );

  res.send(
    page(
      req,
      "Paiement",
      `
<div class="formbox">

<h1>
💳 Paiement
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
<b>${amount} €</b>
</p>

<div class="notice">

<p>
🔒 Le numéro Orange Money n'est pas
affiché publiquement sur le site.
</p>

<p>
Contactez-nous par e-mail afin de recevoir
le numéro de paiement.
</p>

<a class="btn"
href="/contact">
📧 Contacter
</a>

</div>

<hr>

<p>
Après votre paiement, renseignez
les informations ci-dessous.
</p>

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
Numéro utilisé pour le paiement

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

<button class="btn success">
Envoyer la demande
</button>

</form>

</div>
`
    )
  );
});

app.post("/payer", auth, (req, res) => {

  const plan =
    req.body.plan === "30"
      ? "30"
      : "15";

  const amount =
    plan === "30"
      ? 100
      : 70;

  const phone =
    (req.body.phone || "").trim();

  const transactionRef =
    (req.body.transaction_ref || "").trim();

  if (
    !phone ||
    !transactionRef
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
Veuillez renseigner le numéro utilisé
et la référence de transaction.
</p>

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
    VALUES (?,?,?,?,?)
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
      "Demande envoyée",
      `
<div class="formbox">

<h1>
✅ Demande reçue
</h1>

<p>
Votre demande de paiement a été enregistrée.
</p>

<p>
L'administrateur vérifiera le paiement puis
activera votre accès VIP.
</p>

<a class="btn"
href="/compte">
Mon compte
</a>

</div>
`
    )
  );
});

/* =========================================================
   COMPTE
========================================================= */

app.get("/compte", auth, (req, res) => {

  const user =
    db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(
      req.session.userId
    );

  if (!user) {

    req.session.destroy(
      () => res.redirect(
        "/connexion"
      )
    );

    return;
  }

  const payments =
    db.prepare(`
      SELECT *
      FROM payments
      WHERE user_id=?
      ORDER BY id DESC
    `).all(user.id);

  const active =
    isVip(user);

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
</p>

<b>
${safe(
  new Date(
    user.vip_until
  ).toLocaleString("fr-FR")
)}
</b>

<br><br>

<a class="btn"
href="/pronostic">
🔐 Accéder au pronostic
</a>

</div>
`
    : `
<a class="btn"
href="/abonnement">
Choisir un abonnement
</a>
`
}

<h2>
Mes paiements
</h2>

${
  payments.length
    ? payments.map(p => `
<div class="row">

<b>
Commande #${p.id}
</b>

<br>

Montant :
${p.amount_eur} €

<br>

Statut :
<b>
${safe(p.status)}
</b>

<br>

Référence :
${safe(
  p.transaction_ref || "-"
)}

<br>

Date :
${safe(p.created_at)}

</div>
`).join("")
    : "<p>Aucun paiement.</p>"
}

</div>
`
    )
  );
});

/* =========================================================
   PRONOSTIC VIP
========================================================= */

app.get("/pronostic", auth, (req, res) => {

  const user =
    db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(
      req.session.userId
    );

  if (!user) {

    return res.redirect(
      "/connexion"
    );
  }

  if (
    !isVip(user) &&
    user.role !== "admin"
  ) {

    return res.redirect(
      "/abonnement"
    );
  }

  const t =
    db.prepare(`
      SELECT *
      FROM tips
      WHERE published=1
      ORDER BY race_date DESC,id DESC
      LIMIT 1
    `).get();

  if (!t) {

    return res.send(
      page(
        req,
        "Pronostic VIP",
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

<b>Date :</b>
${safe(t.race_date)}

<br>

<b>Heure :</b>
${safe(t.start_time)}

<br>

<b>Hippodrome :</b>
${safe(t.course)}

<br>

<b>Distance :</b>
${safe(t.distance)}

<br>

<b>Partants :</b>
${safe(t.runners)}

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

${
  t.tierce ||
  t.quarte ||
  t.quinte
    ? `
<div class="card">

<h2>
Combinaisons
</h2>

${
  t.tierce
    ? `
<p>
<b>Tiercé :</b>
<br>
${safe(t.tierce)}
</p>
`
    : ""
}

${
  t.quarte
    ? `
<p>
<b>Quarté :</b>
<br>
${safe(t.quarte)}
</p>
`
    : ""
}

${
  t.quinte
    ? `
<p>
<b>Quinté :</b>
<br>
${safe(t.quinte)}
</p>
`
    : ""
}

</div>
`
    : ""
}

${
  t.notes
    ? `
<div class="notice">
${safe(t.notes)}
</div>
`
    : ""
}

</div>
`
    )
  );
});

/* =========================================================
   ADMINISTRATION
========================================================= */

app.get("/admin", admin, (req, res) => {

  const users =
    db.prepare(`
      SELECT
        id,
        name,
        email,
        phone,
        role,
        vip_until
      FROM users
      ORDER BY id DESC
    `).all();

  const payments =
    db.prepare(`
      SELECT
        p.*,
        u.name,
        u.email
      FROM payments p
      JOIN users u
        ON u.id=p.user_id
      ORDER BY p.id DESC
    `).all();

  const tips =
    db.prepare(`
      SELECT *
      FROM tips
      ORDER BY race_date DESC,id DESC
    `).all();

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
Bienvenue dans l'espace administrateur
de <b>Spécial Quinté Français</b>.
</p>

<hr>

<h2>
🏇 Pronostics
</h2>

<p>
Les nouveaux pronostics sont ajoutés à la base.
Ils ne remplacent jamais les anciens.
</p>

<a class="btn success"
href="/admin/tip/new">
➕ Nouveau pronostic
</a>

${

tips.length
  ? tips.map(t => `
<div class="row">

<h3>
${safe(t.race_date)}
—
${safe(t.title)}
</h3>

<p>

${safe(t.course)}
•
${safe(t.start_time)}
•
${safe(t.distance)}
•
${safe(t.runners)}
partants

</p>

<p>
Statut :

${
  Number(t.published)
    ? `
<span class="badge">
VISIBLE
</span>
`
    : `
<span class="badge badge-off">
MASQUÉ
</span>
`
}

</p>

<div class="admin-actions">

<a class="btn"
href="/admin/tip/edit/${t.id}">
✏️ Modifier
</a>

<form
method="post"
action="/admin/tip/toggle"
style="display:inline"
>

<input
type="hidden"
name="id"
value="${t.id}"
>

<button
class="btn secondary"
type="submit"
>
${
  Number(t.published)
    ? "Masquer"
    : "Publier"
}
</button>

</form>

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
onclick="return confirm('Supprimer définitivement ce pronostic ?')"
>
🗑️ Supprimer
</button>

</form>

</div>

</div>
`).join("")

  : "<p>Aucun pronostic enregistré.</p>"

}

<hr>

<h2>
💳 Demandes de paiement
</h2>

${
  payments.length

    ? payments.map(p => `
<div class="row">

<b>
Commande #${p.id}
</b>

<br>

Client :
${safe(p.name)}

<br>

E-mail :
${safe(p.email)}

<br>

Montant :
${p.amount_eur} €

<br>

Téléphone utilisé :
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
type="submit"
>
✅ Confirmer le paiement
</button>

</form>
`

    : `
<p>
<span class="badge">
CONFIRMÉ
</span>
</p>
`
}

</div>
`).join("")

    : "<p>Aucune demande de paiement.</p>"
}

<hr>

<h2>
👥 Comptes
</h2>

${
  users.length

    ? users.map(u => `
<div class="row">

<b>
${safe(u.name)}
</b>

<br>

E-mail :
${safe(u.email)}

<br>

Rôle :
${safe(u.role)}

<br>

VIP :

${
  u.vip_until
    ? safe(
        new Date(
          u.vip_until
        ).toLocaleString("fr-FR")
      )
    : "non"
}

</div>
`).join("")

    : "<p>Aucun compte.</p>"
}

</div>
`
    )
  );
});

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

<p class="small">
Ce pronostic sera ajouté aux archives.
Les anciens pronostics resteront disponibles.
</p>

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

<label>
Tiercé

<input
name="tierce"
placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2"
>
</label>

<label>
Quarté

<input
name="quarte"
placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2 – 11"
>
</label>

<label>
Quinté

<input
name="quinte"
placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2 – 11 – 14"
>
</label>

<label>
Commentaire

<textarea
name="notes"
></textarea>
</label>

<label>
Publication

<select name="published">

<option value="1">
Publier immédiatement
</option>

<option value="0">
Enregistrer masqué
</option>

</select>

</label>

<button class="btn success">
Publier le pronostic
</button>

</form>

</div>
`
      )
    );
  }
);

app.post(
  "/admin/tip/new",
  admin,
  (req, res) => {

    const runners =
      Number(req.body.runners);

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
      !req.body.outsiders
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
les champs obligatoires.
</p>

<a class="btn"
href="/admin/tip/new">
Retour
</a>

</div>
`
        )
      );
    }

    const now =
      new Date().toISOString();

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
        tierce,
        quarte,
        quinte,
        notes,
        published,
        created_at,
        updated_at
      )
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      req.body.race_date,
      req.body.title,
      req.body.start_time,
      req.body.course,
      req.body.distance,
      runners,
      req.body.bases,
      req.body.second_chances,
      req.body.outsiders,
      req.body.replacement || "",
      req.body.tierce || "",
      req.body.quarte || "",
      req.body.quinte || "",
      req.body.notes || "",
      req.body.published === "0"
        ? 0
        : 1,
      now,
      now
    );

    res.redirect("/admin");
  }
);

/* =========================================================
   MODIFIER PRONOSTIC
========================================================= */

app.get(
  "/admin/tip/edit/:id",
  admin,
  (req, res) => {

    const t =
      db.prepare(
        "SELECT * FROM tips WHERE id=?"
      ).get(
        req.params.id
      );

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Introuvable",
          `
<div class="card">

<h1>
Pronostic introuvable.
</h1>

<a class="btn"
href="/admin">
Retour
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
min="1"
value="${safe(t.runners)}"
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
value="${safe(t.replacement || "")}"
>
</label>

<label>
Tiercé

<input
name="tierce"
value="${safe(t.tierce || "")}"
>
</label>

<label>
Quarté

<input
name="quarte"
value="${safe(t.quarte || "")}"
>
</label>

<label>
Quinté

<input
name="quinte"
value="${safe(t.quinte || "")}"
>
</label>

<label>
Commentaire

<textarea
name="notes"
>${safe(t.notes || "")}</textarea>

</label>

<label>
Publication

<select name="published">

<option
value="1"
${Number(t.published)
  ? "selected"
  : ""}
>
Publié
</option>

<option
value="0"
${!Number(t.published)
  ? "selected"
  : ""}
>
Masqué
</option>

</select>

</label>

<button
class="btn success"
>
💾 Enregistrer
</button>

</form>

</div>
`
      )
    );
  }
);

app.post(
  "/admin/tip/edit/:id",
  admin,
  (req, res) => {

    const runners =
      Number(req.body.runners);

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
      !req.body.outsiders
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
Champs obligatoires incorrects.
</p>

<a class="btn"
href="/admin">
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
        race_date=?,
        title=?,
        start_time=?,
        course=?,
        distance=?,
        runners=?,
        bases=?,
        second_chances=?,
        outsiders=?,
        replacement=?,
        tierce=?,
        quarte=?,
        quinte=?,
        notes=?,
        published=?,
        updated_at=?
      WHERE id=?
    `).run(
      req.body.race_date,
      req.body.title,
      req.body.start_time,
      req.body.course,
      req.body.distance,
      runners,
      req.body.bases,
      req.body.second_chances,
      req.body.outsiders,
      req.body.replacement || "",
      req.body.tierce || "",
      req.body.quarte || "",
      req.body.quinte || "",
      req.body.notes || "",
      req.body.published === "0"
        ? 0
        : 1,
      new Date().toISOString(),
      req.params.id
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   PUBLIER / MASQUER
========================================================= */

app.post(
  "/admin/tip/toggle",
  admin,
  (req, res) => {

    const t =
      db.prepare(
        "SELECT published FROM tips WHERE id=?"
      ).get(
        req.body.id
      );

    if (!t) {

      return res.status(404).send(
        "Pronostic introuvable."
      );
    }

    db.prepare(`
      UPDATE tips
      SET
        published=?,
        updated_at=?
      WHERE id=?
    `).run(
      Number(t.published)
        ? 0
        : 1,
      new Date().toISOString(),
      req.body.id
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   SUPPRIMER
========================================================= */

app.post(
  "/admin/tip/delete",
  admin,
  (req, res) => {

    db.prepare(
      "DELETE FROM tips WHERE id=?"
    ).run(
      req.body.id
    );

    res.redirect(
      "/admin"
    );
  }
);

/* =========================================================
   CONFIRMER PAIEMENT
   L'abonnement est activé directement.
========================================================= */

app.post(
  "/admin/confirm",
  admin,
  (req, res) => {

    const payment =
      db.prepare(
        "SELECT * FROM payments WHERE id=?"
      ).get(
        req.body.payment_id
      );

    if (!payment) {

      return res.status(404).send(
        "Paiement introuvable."
      );
    }

    if (
      payment.status ===
      "confirmed"
    ) {

      return res.redirect(
        "/admin"
      );
    }

    const user =
      db.prepare(
        "SELECT * FROM users WHERE id=?"
      ).get(
        payment.user_id
      );

    if (!user) {

      return res.status(404).send(
        "Utilisateur introuvable."
      );
    }

    const days =
      payment.plan === "30"
        ? 30
        : 15;

    /*
      Si le client a déjà un VIP actif,
      le nouveau paiement prolonge son abonnement
      au lieu de supprimer le temps restant.
    */

    const currentUntil =
      user.vip_until &&
      new Date(user.vip_until) >
        new Date()
        ? new Date(
            user.vip_until
          )
        : new Date();

    const until =
      new Date(
        currentUntil.getTime() +
        days *
          24 *
          60 *
          60 *
          1000
      ).toISOString();

    db.prepare(`
      UPDATE payments
      SET
        status='confirmed',
        confirmed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      payment.id
    );

    db.prepare(`
      UPDATE users
      SET vip_until=?
      WHERE id=?
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
   HEALTH CHECK
========================================================= */

app.get(
  "/health",
  (req, res) => {

    res.status(200)
      .send("OK");
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

<p>
La page demandée n'existe pas.
</p>

<a class="btn"
href="/">
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
      "======================================"
    );

    console.log(
      "SPÉCIAL QUINTÉ FRANÇAIS"
    );

    console.log(
      "Serveur lancé sur le port " +
      PORT
    );

    console.log(
      "Base de données : " +
      dbPath
    );

    console.log(
      "Contact : " +
      CONTACT_EMAIL
    );

    console.log(
      "======================================"
    );
  }
);
