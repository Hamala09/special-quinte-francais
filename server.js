require("dotenv").config();

const express = require("express");
const session = require("express-session");
const connectPgSimple = require("connect-pg-simple");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL || "admin@special-quinte-francais.com";

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "Compta@09";

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  "SPECIAL-QUINTE-FRANCAIS-SECRET-2026";

const DATABASE_URL = process.env.DATABASE_URL;

const ORANGE_MONEY_NUMBER =
  process.env.ORANGE_MONEY_NUMBER || "À CONFIGURER";

const ORANGE_MONEY_NAME =
  process.env.ORANGE_MONEY_NAME || "À CONFIGURER";

if (!DATABASE_URL) {
  console.error("ERREUR : DATABASE_URL n'est pas configurée.");
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

pool.on("error", err => {
  console.error("Erreur PostgreSQL inattendue :", err);
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set("trust proxy", 1);

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: true,
      pruneSessionInterval: 900
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

function safe(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function todayString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const result = {};
  for (const part of parts) result[part.type] = part.value;

  return `${result.year}-${result.month}-${result.day}`;
}

function isVip(user) {
  if (!user || !user.vip_until) return false;

  const expiration = new Date(user.vip_until);

  return (
    !Number.isNaN(expiration.getTime()) &&
    expiration > new Date()
  );
}

function auth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/connexion");
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
        <div class="card">
          <h1>🔒 Accès refusé</h1>
          <p>Accès administrateur requis.</p>
          <a class="btn" href="/connexion">Se connecter</a>
        </div>
        `
      )
    );
  }

  next();
}

function page(req, title, body) {
  const logged = !!req.session.userId;
  const isAdmin = req.session.role === "admin";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="Spécial Quinté Français — Pronostics hippiques VIP">
<title>${safe(title)} — Spécial Quinté Français</title>

<style>
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;
  font-family:Arial,Helvetica,sans-serif;
  background:#f5f7fa;
  color:#222;
  line-height:1.5
}
header{
  background:#111827;
  color:#fff;
  padding:18px
}
.header-inner{
  max-width:1100px;
  margin:auto
}
.logo{
  color:#fff;
  text-decoration:none;
  font-weight:bold;
  font-size:21px;
  display:inline-block
}
.logo small{
  display:block;
  font-size:12px;
  margin-top:3px;
  letter-spacing:2px
}
nav{
  margin-top:15px;
  display:flex;
  flex-wrap:wrap;
  gap:8px
}
nav a{
  color:#fff;
  text-decoration:none;
  padding:9px 11px;
  border-radius:6px;
  font-size:14px
}
nav a:hover{background:#374151}
main{
  max-width:1100px;
  margin:auto;
  padding:25px 15px;
  min-height:65vh
}
footer{
  text-align:center;
  padding:30px 15px;
  color:#666
}
.hero{
  background:#fff;
  padding:35px 25px;
  border-radius:14px;
  margin-bottom:20px;
  text-align:center;
  box-shadow:0 3px 15px rgba(0,0,0,.06)
}
.hero h1{margin-top:0}
.card,.formbox,.plan,.archive-card{
  background:#fff;
  padding:22px;
  border-radius:12px;
  box-shadow:0 3px 15px rgba(0,0,0,.08);
  margin-bottom:20px
}
.grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(280px,1fr));
  gap:20px
}
.race{
  margin:25px 0;
  padding:22px;
  border-radius:12px;
  background:#111827;
  color:#fff
}
.locked{
  background:#f3f4f6;
  padding:30px 20px;
  border-radius:12px;
  text-align:center;
  margin-top:20px
}
.lock-icon{font-size:45px;margin-bottom:10px}
.picks{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
  gap:12px;
  margin:20px 0
}
.picks b{
  padding:18px;
  border-radius:10px;
  background:#eef2ff;
  text-align:center
}
.picks span{
  display:block;
  font-size:21px;
  margin-top:8px
}
.bet-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
  gap:15px;
  margin-top:20px
}
.bet-card{
  background:#eef2ff;
  padding:20px;
  border-radius:12px;
  text-align:center
}
.bet-card h3{margin-top:0}
.bet-card .horses{
  display:block;
  font-size:21px;
  font-weight:bold;
  margin-top:10px
}
.notice{
  background:#fff7ed;
  padding:15px;
  border-radius:8px;
  margin-top:15px
}
.vip{
  background:#fef3c7;
  padding:15px;
  border-radius:8px
}
.btn{
  display:inline-block;
  border:none;
  background:#111827;
  color:#fff;
  text-decoration:none;
  padding:11px 18px;
  border-radius:7px;
  cursor:pointer;
  font-size:14px
}
.btn:hover{opacity:.88}
.success{background:#166534}
.danger{background:#b91c1c}
.secondary{background:#4b5563}
label{
  display:block;
  margin-bottom:15px;
  font-weight:bold
}
input,textarea,select{
  width:100%;
  padding:11px;
  margin-top:6px;
  border:1px solid #ccc;
  border-radius:7px;
  font-size:15px;
  font-family:inherit
}
textarea{
  min-height:100px;
  resize:vertical
}
button{font-family:inherit}
hr{
  border:0;
  border-top:1px solid #ddd;
  margin:25px 0
}
.row{
  background:#f9fafb;
  padding:15px;
  margin:10px 0;
  border-radius:8px
}
.admin-actions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:10px
}
.archive-date{
  color:#555;
  font-size:14px;
  margin-bottom:8px
}
.archive-title{
  margin-top:0;
  color:#111827
}
.archive-info{
  background:#f9fafb;
  padding:12px;
  border-radius:8px;
  margin:12px 0
}
.archive-picks{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
  gap:10px;
  margin-top:15px
}
.archive-pick{
  background:#eef2ff;
  padding:14px;
  border-radius:8px;
  text-align:center
}
.archive-pick strong{
  display:block;
  margin-bottom:7px
}
.archive-pick span{
  font-size:20px;
  font-weight:bold
}
.archive-notes{
  background:#fff7ed;
  padding:14px;
  border-radius:8px;
  margin-top:15px
}
.archive-header{
  text-align:center;
  background:#fff;
  padding:25px;
  border-radius:14px;
  margin-bottom:20px
}
.status-pending{color:#92400e;font-weight:bold}
.status-confirmed{color:#166534;font-weight:bold}
.status-rejected{color:#b91c1c;font-weight:bold}
.small{font-size:13px;color:#666}
.center{text-align:center}

@media(max-width:600px){
  main{padding:15px 10px}
  header{padding:15px 12px}
  .hero{padding:25px 15px}
  .card,.formbox,.archive-card{padding:17px}
  .picks,.archive-picks,.bet-grid{grid-template-columns:1fr 1fr}
}
</style>
</head>

<body>
<header>
<div class="header-inner">

<a class="logo" href="/">
♞ SPÉCIAL QUINTÉ
<small>FRANÇAIS</small>
</a>

<nav>
<a href="/">Accueil</a>
<a href="/pronostic">Pronostic VIP</a>
<a href="/archives">🗂️ Archives</a>
<a href="/abonnement">Abonnement</a>

${
  logged
    ? `
      <a href="/compte">Mon compte</a>
    `
    : `
      <a href="/inscription">Créer un compte</a>
      <a href="/connexion">Connexion</a>
    `
}

${
  isAdmin
    ? `<a href="/admin">⚙️ Admin</a>`
    : ""
}

${
  logged
    ? `<a href="/deconnexion">Déconnexion</a>`
    : ""
}
</nav>
</div>
</header>

<main>
${body}
</main>

<footer>
© 2026 Spécial Quinté Français
</footer>

</body>
</html>`;
}

/* =========================================================
   INITIALISATION POSTGRESQL
========================================================= */

async function initializeDatabase() {

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      vip_until TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
      plan TEXT NOT NULL,
      amount_eur INTEGER NOT NULL,
      phone TEXT NOT NULL,
      transaction_ref TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tips (
      id BIGSERIAL PRIMARY KEY,
      race_date DATE NOT NULL,
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
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await pool.query(`
    ALTER TABLE tips
    ADD COLUMN IF NOT EXISTS tierce TEXT;
  `);

  await pool.query(`
    ALTER TABLE tips
    ADD COLUMN IF NOT EXISTS quarte TEXT;
  `);

  await pool.query(`
    ALTER TABLE tips
    ADD COLUMN IF NOT EXISTS quinte TEXT;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tips_race_date
    ON tips(race_date DESC);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_user_id
    ON payments(user_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_payments_status
    ON payments(status);
  `);

  const adminHash =
    await bcrypt.hash(ADMIN_PASSWORD, 12);

  const adminResult =
    await pool.query(
      `
      SELECT id
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1
      `,
      [ADMIN_EMAIL]
    );

  if (!adminResult.rows.length) {

    await pool.query(
      `
      INSERT INTO users
      (name,email,phone,password_hash,role)
      VALUES
      ($1,$2,$3,$4,'admin')
      `,
      [
        "Administrateur",
        ADMIN_EMAIL,
        "0000000000",
        adminHash
      ]
    );

    console.log(
      "Compte administrateur créé :",
      ADMIN_EMAIL
    );

  } else {

    await pool.query(
      `
      UPDATE users
      SET password_hash = $1,
          role = 'admin'
      WHERE LOWER(email) = LOWER($2)
      `,
      [adminHash, ADMIN_EMAIL]
    );

    console.log(
      "Compte administrateur vérifié :",
      ADMIN_EMAIL
    );
  }

  console.log("Base PostgreSQL initialisée.");
}

/* =========================================================
   ACCUEIL
   Aucun numéro de pronostic n'est affiché.
========================================================= */

app.get("/", async (req, res) => {

  res.send(
    page(
      req,
      "Accueil",
      `
      <section class="hero">

        <h1>♞ SPÉCIAL QUINTÉ FRANÇAIS</h1>

        <h2>Pronostics hippiques VIP</h2>

        <p>
          Retrouvez chaque jour notre sélection
          réservée aux membres VIP.
        </p>

        <div class="locked">

          <div class="lock-icon">🔐</div>

          <h3>
            Le pronostic du jour est réservé aux membres VIP
          </h3>

          <p>
            Les Bases, Secondes chances, Outsiders,
            Tiercé, Quarté et Quinté ne sont
            <strong>jamais affichés sur l'accueil</strong>.
          </p>

          <a class="btn" href="/abonnement">
            👑 Accéder au VIP
          </a>

        </div>

      </section>

      <div class="grid">

        <div class="card">
          <h2>🔒 Pronostic VIP</h2>
          <p>
            Accédez à la sélection complète
            après activation de votre abonnement.
          </p>
          <a class="btn" href="/pronostic">
            Voir le Pronostic VIP
          </a>
        </div>

        <div class="card">
          <h2>🗂️ Archives</h2>
          <p>
            Les pronostics dont la date de course
            est passée sont accessibles librement.
          </p>
          <a class="btn" href="/archives">
            Voir les archives
          </a>
        </div>

        <div class="card">
          <h2>👑 Abonnement VIP</h2>
          <p>VIP 15 jours : <strong>70 €</strong></p>
          <p>VIP 1 mois : <strong>100 €</strong></p>
          <a class="btn" href="/abonnement">
            Voir les abonnements
          </a>
        </div>

      </div>
      `
    )
  );
});

/* =========================================================
   ARCHIVES PUBLIQUES
   IMPORTANT :
   Chaque pronostic est conservé.
   Dès que race_date est passée en heure française,
   il devient une archive publique.
========================================================= */

app.get("/archives", async (req, res) => {

  try {

    const result =
      await pool.query(
        `
        SELECT *
        FROM tips
        WHERE race_date <
          (
            CURRENT_TIMESTAMP
            AT TIME ZONE 'Europe/Paris'
          )::date
        ORDER BY race_date DESC, id DESC
        `
      );

    const archives = result.rows;

    let content = `
      <div class="archive-header">

        <h1>🗂️ ARCHIVES DES PRONOSTICS</h1>

        <p>
          Retrouvez les anciens pronostics
          de <b>Spécial Quinté Français</b>.
        </p>

      </div>
    `;

    if (!archives.length) {

      content += `
        <div class="card center">

          <h2>Aucune archive pour le moment</h2>

          <p>
            Les anciens pronostics apparaîtront
            automatiquement ici après leur date de course.
          </p>

        </div>
      `;

    } else {

      content += archives.map(t => `
        <div class="archive-card">

          <div class="archive-date">
            📅 ${formatDate(t.race_date)}
            • 🕐 ${safe(t.start_time)}
          </div>

          <h2 class="archive-title">
            ${safe(t.title)}
          </h2>

          <div class="archive-info">
            🏇 <b>${safe(t.course)}</b>
            • ${safe(t.distance)}
            • ${safe(t.runners)} partants
          </div>

          <div class="archive-picks">

            <div class="archive-pick">
              <strong>BASES</strong>
              <span>${safe(t.bases)}</span>
            </div>

            <div class="archive-pick">
              <strong>SECONDES CHANCES</strong>
              <span>${safe(t.second_chances)}</span>
            </div>

            <div class="archive-pick">
              <strong>OUTSIDERS</strong>
              <span>${safe(t.outsiders)}</span>
            </div>

            <div class="archive-pick">
              <strong>REMPLAÇANT</strong>
              <span>${safe(t.replacement || "-")}</span>
            </div>

          </div>

          <br>

          <a class="btn" href="/archives/${safe(t.id)}">
            Voir le pronostic complet
          </a>

        </div>
      `).join("");
    }

    res.send(
      page(req, "Archives", content)
    );

  } catch (err) {

    console.error("Erreur archives :", err);

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>Erreur lors du chargement des archives</h1>
          <a class="btn" href="/">Accueil</a>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   DETAIL ARCHIVE
========================================================= */

app.get("/archives/:id", async (req, res) => {

  try {

    const result =
      await pool.query(
        `
        SELECT *
        FROM tips
        WHERE id = $1
          AND race_date <
            (
              CURRENT_TIMESTAMP
              AT TIME ZONE 'Europe/Paris'
            )::date
        `,
        [req.params.id]
      );

    const t = result.rows[0];

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Archive introuvable",
          `
          <div class="card">
            <h1>Archive introuvable</h1>
            <a class="btn" href="/archives">
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
            📅 ${formatDate(t.race_date)}
            • 🕐 ${safe(t.start_time)}
          </div>

          <h1>${safe(t.title)}</h1>

          <div class="archive-info">

            🏇 Hippodrome :
            <b>${safe(t.course)}</b>

            <br><br>

            📏 Distance :
            <b>${safe(t.distance)}</b>

            <br><br>

            🐎 Partants :
            <b>${safe(t.runners)}</b>

          </div>

          <h2>🏇 Sélection</h2>

          <div class="archive-picks">

            <div class="archive-pick">
              <strong>BASES</strong>
              <span>${safe(t.bases)}</span>
            </div>

            <div class="archive-pick">
              <strong>SECONDES CHANCES</strong>
              <span>${safe(t.second_chances)}</span>
            </div>

            <div class="archive-pick">
              <strong>OUTSIDERS</strong>
              <span>${safe(t.outsiders)}</span>
            </div>

            <div class="archive-pick">
              <strong>REMPLAÇANT</strong>
              <span>${safe(t.replacement || "-")}</span>
            </div>

          </div>

          <h2>🎯 Jeux proposés</h2>

          <div class="bet-grid">

            <div class="bet-card">
              <h3>🏇 TIERCE</h3>
              <p>6 chevaux</p>
              <span class="horses">
                ${safe(t.tierce || "-")}
              </span>
            </div>

            <div class="bet-card">
              <h3>🏇 QUARTE</h3>
              <p>7 chevaux</p>
              <span class="horses">
                ${safe(t.quarte || "-")}
              </span>
            </div>

            <div class="bet-card">
              <h3>🏇 QUINTE</h3>
              <p>8 chevaux</p>
              <span class="horses">
                ${safe(t.quinte || "-")}
              </span>
            </div>

          </div>

          ${
            t.notes
              ? `
                <div class="archive-notes">
                  📝 <b>Commentaire :</b>
                  <br><br>
                  ${safe(t.notes)}
                </div>
              `
              : ""
          }

          <br>

          <a class="btn" href="/archives">
            ← Retour aux archives
          </a>

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur détail archive :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>Erreur serveur</h1>
          <a class="btn" href="/archives">
            Retour aux archives
          </a>
        </div>
        `
      )
    );
  }
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

        <h1>Créer un compte</h1>

        <form method="post" action="/inscription">

          <label>
            Nom complet
            <input
              name="name"
              maxlength="100"
              required
            >
          </label>

          <label>
            E-mail
            <input
              type="email"
              name="email"
              maxlength="150"
              autocomplete="username"
              required
            >
          </label>

          <label>
            Téléphone
            <input
              name="phone"
              maxlength="30"
              required
            >
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              name="password"
              minlength="8"
              maxlength="100"
              autocomplete="new-password"
              required
            >
          </label>

          <button class="btn" type="submit">
            Créer mon compte
          </button>

        </form>

      </div>
      `
    )
  );
});

app.post("/inscription", async (req, res) => {

  try {

    const name =
      String(req.body.name || "").trim();

    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const phone =
      String(req.body.phone || "").trim();

    const password =
      String(req.body.password || "");

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
          <div class="card">
            <h1>❌ Données invalides</h1>
            <a class="btn" href="/inscription">
              Retour
            </a>
          </div>
          `
        )
      );
    }

    const hash =
      await bcrypt.hash(password, 12);

    const result =
      await pool.query(
        `
        INSERT INTO users
        (name,email,phone,password_hash,role)
        VALUES
        ($1,$2,$3,$4,'member')
        RETURNING id,role
        `,
        [name, email, phone, hash]
      );

    const user = result.rows[0];

    req.session.regenerate(err => {

      if (err) {
        console.error(err);
        return res.status(500).send(
          "Erreur de session."
        );
      }

      req.session.userId =
        Number(user.id);

      req.session.role =
        user.role;

      req.session.save(saveErr => {

        if (saveErr) {
          console.error(saveErr);
          return res.status(500).send(
            "Erreur de sauvegarde de session."
          );
        }

        res.redirect("/abonnement");
      });
    });

  } catch (err) {

    console.error(
      "Erreur inscription :",
      err
    );

    res.status(400).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Inscription impossible</h1>
          <p>
            Cette adresse e-mail existe déjà
            ou les informations sont invalides.
          </p>
          <a class="btn" href="/connexion">
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

        <h1>Connexion</h1>

        <form method="post" action="/connexion">

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

          <button class="btn" type="submit">
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

app.post("/connexion", async (req, res) => {

  try {

    const email =
      String(req.body.email || "")
        .trim()
        .toLowerCase();

    const password =
      String(req.body.password || "");

    const result =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [email]
      );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(
        password,
        user.password_hash
      ))
    ) {

      return res.status(401).send(
        page(
          req,
          "Connexion",
          `
          <div class="formbox">
            <h1>❌ Connexion refusée</h1>
            <p>
              L'adresse e-mail ou le mot de passe
              est incorrect.
            </p>
            <a class="btn" href="/connexion">
              Réessayer
            </a>
          </div>
          `
        )
      );
    }

    req.session.regenerate(err => {

      if (err) {
        console.error(err);
        return res.status(500).send(
          "Erreur de session."
        );
      }

      req.session.userId =
        Number(user.id);

      req.session.role =
        user.role;

      req.session.save(saveError => {

        if (saveError) {
          console.error(saveError);
          return res.status(500).send(
            "Erreur lors de la sauvegarde de la session."
          );
        }

        if (user.role === "admin") {
          return res.redirect("/admin");
        }

        res.redirect("/compte");
      });
    });

  } catch (err) {

    console.error(
      "Erreur connexion :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>Erreur serveur</h1>
          <a class="btn" href="/connexion">
            Réessayer
          </a>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   DECONNEXION
========================================================= */

app.get("/deconnexion", (req, res) => {

  req.session.destroy(err => {

    if (err) {
      console.error(err);
    }

    res.clearCookie("connect.sid");
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
            👑 Choisissez votre abonnement VIP
          </h1>

          <div class="plan">

            <h2>VIP 15 JOURS</h2>

            <strong>70 €</strong>

            <br><br>

            <a class="btn" href="/payer?plan=15">
              Payer avec Orange Money
            </a>

          </div>

          <div class="plan">

            <h2>VIP 1 MOIS</h2>

            <strong>100 €</strong>

            <br><br>

            <a class="btn" href="/payer?plan=30">
              Payer avec Orange Money
            </a>

          </div>

        </div>

        <div class="card">

          <h2>ℹ️ Paiement Orange Money</h2>

          <p>
            Après votre paiement, indiquez
            votre référence de transaction.
          </p>

          <p>
            L'administrateur vérifie le paiement
            puis active votre accès VIP.
          </p>

        </div>

      </div>
      `
    )
  );
});

/* =========================================================
   PAIEMENT
========================================================= */

app.get("/payer", auth, async (req, res) => {

  try {

    const plan =
      req.query.plan === "30"
        ? "30"
        : "15";

    const amount =
      plan === "30" ? 100 : 70;

    const result =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
      );

    const user = result.rows[0];

    if (!user) {
      return res.redirect("/deconnexion");
    }

    res.send(
      page(
        req,
        "Paiement",
        `
        <div class="formbox">

          <h1>💳 Paiement Orange Money</h1>

          <p>
            Abonnement :
            <b>
              ${plan === "30" ? "1 mois" : "15 jours"}
            </b>
            —
            <b>${amount} €</b>
          </p>

          <div class="notice">

            Numéro Orange Money :
            <br>
            <b>${safe(ORANGE_MONEY_NUMBER)}</b>

            <br><br>

            Nom :
            <br>
            <b>${safe(ORANGE_MONEY_NAME)}</b>

          </div>

          <form method="post" action="/payer">

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
                maxlength="30"
                required
              >
            </label>

            <label>
              Référence / ID de transaction
              <input
                name="transaction_ref"
                maxlength="100"
                required
              >
            </label>

            <button class="btn" type="submit">
              Envoyer la demande
            </button>

          </form>

        </div>
        `
      )
    );

  } catch (err) {

    console.error(err);

    res.status(500).send(
      "Erreur serveur."
    );
  }
});

app.post("/payer", auth, async (req, res) => {

  try {

    const plan =
      req.body.plan === "30"
        ? "30"
        : "15";

    const amount =
      plan === "30" ? 100 : 70;

    const phone =
      String(req.body.phone || "").trim();

    const transactionRef =
      String(
        req.body.transaction_ref || ""
      ).trim();

    if (!phone || !transactionRef) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>❌ Informations manquantes</h1>
            <a class="btn" href="/abonnement">
              Retour
            </a>
          </div>
          `
        )
      );
    }

    const duplicate =
      await pool.query(
        `
        SELECT id
        FROM payments
        WHERE transaction_ref = $1
        LIMIT 1
        `,
        [transactionRef]
      );

    if (duplicate.rows.length) {

      return res.status(400).send(
        page(
          req,
          "Paiement",
          `
          <div class="card">
            <h1>⚠️ Référence déjà utilisée</h1>
            <p>
              Cette référence de transaction
              a déjà été enregistrée.
            </p>
            <a class="btn" href="/compte">
              Mon compte
            </a>
          </div>
          `
        )
      );
    }

    await pool.query(
      `
      INSERT INTO payments
      (
        user_id,
        plan,
        amount_eur,
        phone,
        transaction_ref,
        status
      )
      VALUES
      ($1,$2,$3,$4,$5,'pending')
      `,
      [
        req.session.userId,
        plan,
        amount,
        phone,
        transactionRef
      ]
    );

    res.send(
      page(
        req,
        "Paiement envoyé",
        `
        <div class="formbox">

          <h1>Demande reçue ✅</h1>

          <p>
            Votre demande de paiement
            a été enregistrée.
          </p>

          <p>
            Après confirmation par
            l'administrateur, votre accès VIP
            sera activé.
          </p>

          <a class="btn" href="/compte">
            Mon compte
          </a>

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur paiement :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Erreur lors du paiement</h1>
          <p>Veuillez réessayer.</p>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   COMPTE
========================================================= */

app.get("/compte", auth, async (req, res) => {

  try {

    const userResult =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
      );

    const user = userResult.rows[0];

    if (!user) {
      return req.session.destroy(
        () => res.redirect("/connexion")
      );
    }

    const paymentsResult =
      await pool.query(
        `
        SELECT *
        FROM payments
        WHERE user_id = $1
        ORDER BY id DESC
        `,
        [user.id]
      );

    const payments =
      paymentsResult.rows;

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
            ${active ? "🟢 VIP actif" : "⚪ Non abonné"}
          </h2>

          ${
            active
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

                  <a class="btn" href="/pronostic">
                    🔐 Accéder au pronostic
                  </a>

                </div>
              `
              : `
                <a class="btn" href="/abonnement">
                  👑 Choisir un abonnement
                </a>
              `
          }

          <h2>💳 Mes paiements</h2>

          ${
            payments.length
              ? payments.map(p => {

                  const statusClass =
                    p.status === "confirmed"
                      ? "status-confirmed"
                      : p.status === "rejected"
                      ? "status-rejected"
                      : "status-pending";

                  return `
                    <div class="row">

                      <b>Commande #${safe(p.id)}</b>

                      <br>

                      Abonnement :
                      ${p.plan === "30" ? "1 mois" : "15 jours"}

                      <br>

                      Montant :
                      ${safe(p.amount_eur)} €

                      <br>

                      Statut :
                      <span class="${statusClass}">
                        ${safe(p.status)}
                      </span>

                      <br>

                      Référence :
                      ${safe(p.transaction_ref || "-")}

                    </div>
                  `;

                }).join("")
              : "<p>Aucun paiement.</p>"
          }

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur compte :",
      err
    );

    res.status(500).send(
      "Erreur serveur."
    );
  }
});

/* =========================================================
   PRONOSTIC VIP
   IMPORTANT :
   - Le pronostic du jour est affiché.
   - S'il n'y en a pas aujourd'hui, le prochain à venir
     est affiché.
   - Les pronostics passés ne sont PAS supprimés.
   - Ils restent en PostgreSQL et deviennent des archives.
========================================================= */

app.get("/pronostic", auth, async (req, res) => {

  try {

    const userResult =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        `,
        [req.session.userId]
      );

    const user = userResult.rows[0];

    if (!user) {
      return res.redirect("/deconnexion");
    }

    if (
      !isVip(user) &&
      user.role !== "admin"
    ) {
      return res.redirect("/abonnement");
    }

    const today =
      todayString();

    /*
      1. Chercher le pronostic du jour.
      Si plusieurs ont été enregistrés pour la même date,
      le dernier créé est utilisé.
    */

    let result =
      await pool.query(
        `
        SELECT *
        FROM tips
        WHERE race_date = $1
        ORDER BY id DESC
        LIMIT 1
        `,
        [today]
      );

    let t = result.rows[0];

    /*
      2. S'il n'existe pas de pronostic aujourd'hui,
      chercher le prochain pronostic.
    */

    if (!t) {

      result =
        await pool.query(
          `
          SELECT *
          FROM tips
          WHERE race_date > $1
          ORDER BY race_date ASC, id ASC
          LIMIT 1
          `,
          [today]
        );

      t = result.rows[0];
    }

    /*
      3. Aucun pronostic actuel ou futur.
    */

    if (!t) {

      return res.send(
        page(
          req,
          "Pronostic VIP",
          `
          <div class="card center">

            <h1>🔐 PRONOSTIC VIP</h1>

            <h2>
              Aucun pronostic disponible pour le moment.
            </h2>

            <p>
              L'administrateur pourra publier
              le prochain pronostic depuis
              l'espace Admin.
            </p>

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

          <h1>🔐 PRONOSTIC VIP</h1>

          <h2>${safe(t.title)}</h2>

          <p>
            📅 ${formatDate(t.race_date)}
            • 🕐 ${safe(t.start_time)}
            • 🏇 ${safe(t.course)}
            • 📏 ${safe(t.distance)}
            • 🐎 ${safe(t.runners)} partants
          </p>

          <div class="picks">

            <b>
              BASES
              <span>${safe(t.bases)}</span>
            </b>

            <b>
              SECONDES CHANCES
              <span>${safe(t.second_chances)}</span>
            </b>

            <b>
              OUTSIDERS
              <span>${safe(t.outsiders)}</span>
            </b>

            <b>
              REMPLAÇANT
              <span>${safe(t.replacement || "-")}</span>
            </b>

          </div>

          <h2>🎯 Jeux du jour</h2>

          <div class="bet-grid">

            <div class="bet-card">

              <h3>🏇 TIERCE</h3>

              <p>6 chevaux</p>

              <span class="horses">
                ${safe(t.tierce || "-")}
              </span>

            </div>

            <div class="bet-card">

              <h3>🏇 QUARTE</h3>

              <p>7 chevaux</p>

              <span class="horses">
                ${safe(t.quarte || "-")}
              </span>

            </div>

            <div class="bet-card">

              <h3>🏇 QUINTE</h3>

              <p>8 chevaux</p>

              <span class="horses">
                ${safe(t.quinte || "-")}
              </span>

            </div>

          </div>

          ${
            t.notes
              ? `
                <div class="notice">
                  📝 <b>Commentaire :</b>
                  <br><br>
                  ${safe(t.notes)}
                </div>
              `
              : ""
          }

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur pronostic :",
      err
    );

    res.status(500).send(
      "Erreur serveur."
    );
  }
});

/* =========================================================
   ADMIN
========================================================= */

app.get("/admin", admin, async (req, res) => {

  try {

    const usersResult =
      await pool.query(
        `
        SELECT
          id,name,email,phone,role,
          vip_until,created_at
        FROM users
        ORDER BY id DESC
        `
      );

    const paymentsResult =
      await pool.query(
        `
        SELECT
          p.*,
          u.name,
          u.email
        FROM payments p
        JOIN users u ON u.id = p.user_id
        ORDER BY p.id DESC
        `
      );

    const tipsResult =
      await pool.query(
        `
        SELECT *
        FROM tips
        ORDER BY race_date DESC,id DESC
        `
      );

    const users =
      usersResult.rows;

    const payments =
      paymentsResult.rows;

    const tips =
      tipsResult.rows;

    res.send(
      page(
        req,
        "Administration",
        `
        <div class="card">

          <h1>⚙️ Administration</h1>

          <p>
            Bienvenue dans l'espace administrateur
            du <b>Spécial Quinté Français</b>.
          </p>

          <h2>🏇 Gestion des pronostics</h2>

          <a class="btn success" href="/admin/tip/new">
            ➕ Nouveau pronostic
          </a>

          ${
            tips.length
              ? tips.map(t => `
                <div class="row">

                  <b>
                    ${formatDate(t.race_date)}
                    —
                    ${safe(t.title)}
                  </b>

                  <br><br>

                  Heure :
                  ${safe(t.start_time)}

                  <br>

                  Hippodrome :
                  ${safe(t.course)}

                  <br>

                  Partants :
                  ${safe(t.runners)}

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

                  <b>Tiercé — 6 chevaux :</b>
                  ${safe(t.tierce || "-")}

                  <br>

                  <b>Quarté — 7 chevaux :</b>
                  ${safe(t.quarte || "-")}

                  <br>

                  <b>Quinté — 8 chevaux :</b>
                  ${safe(t.quinte || "-")}

                  <div class="admin-actions">

                    <a
                      class="btn"
                      href="/admin/tip/edit/${safe(t.id)}"
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
                        value="${safe(t.id)}"
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
              `).join("")
              : `
                <div class="row">
                  Aucun pronostic publié.
                </div>
              `
          }

          <h2>💳 Demandes de paiement</h2>

          ${
            payments.length
              ? payments.map(p => `
                <div class="row">

                  <b>#${safe(p.id)}</b>
                  —
                  ${safe(p.name)}
                  —
                  ${safe(p.amount_eur)} €

                  <br>

                  E-mail :
                  ${safe(p.email)}

                  <br>

                  Téléphone :
                  ${safe(p.phone)}

                  <br>

                  Abonnement :
                  ${p.plan === "30" ? "1 mois" : "15 jours"}

                  <br>

                  Référence :
                  ${safe(p.transaction_ref || "-")}

                  <br>

                  Statut :
                  <b>${safe(p.status)}</b>

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
                            value="${safe(p.id)}"
                          >

                          <button
                            class="btn success"
                            type="submit"
                          >
                            ✅ Confirmer le paiement
                          </button>

                        </form>
                      `
                      : ""
                  }

                </div>
              `).join("")
              : "<p>Aucune demande de paiement.</p>"
          }

          <h2>👥 Comptes utilisateurs</h2>

          ${
            users.map(u => `
              <div class="row">

                <b>${safe(u.name)}</b>

                <br>

                E-mail :
                ${safe(u.email)}

                <br>

                Téléphone :
                ${safe(u.phone)}

                <br>

                Rôle :
                <b>${safe(u.role)}</b>

                <br>

                VIP :
                ${
                  u.vip_until
                    ? new Date(
                        u.vip_until
                      ).toLocaleString("fr-FR")
                    : "non"
                }

              </div>
            `).join("")
          }

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur Admin :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Erreur Admin</h1>
          <p>
            Impossible de charger
            les données administratives.
          </p>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   NOUVEAU PRONOSTIC
========================================================= */

app.get("/admin/tip/new", admin, (req, res) => {

  res.send(
    page(
      req,
      "Nouveau pronostic",
      `
      <div class="formbox">

        <h1>➕ Nouveau pronostic</h1>

        <form method="post" action="/admin/tip/new">

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
              max="99"
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

          <h2>🎯 Jeux du jour</h2>

          <label>
            Tiercé — 6 chevaux
            <input
              name="tierce"
              placeholder="5 – 8 – 12 – 3 – 7 – 10"
              required
            >
          </label>

          <label>
            Quarté — 7 chevaux
            <input
              name="quarte"
              placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2"
              required
            >
          </label>

          <label>
            Quinté — 8 chevaux
            <input
              name="quinte"
              placeholder="5 – 8 – 12 – 3 – 7 – 10 – 2 – 11"
              required
            >
          </label>

          <label>
            Notes / commentaire
            <textarea name="notes"></textarea>
          </label>

          <button class="btn success" type="submit">
            Publier le pronostic
          </button>

        </form>

      </div>
      `
    )
  );
});

app.post("/admin/tip/new", admin, async (req, res) => {

  try {

    const raceDate =
      String(req.body.race_date || "").trim();

    const title =
      String(req.body.title || "").trim();

    const startTime =
      String(req.body.start_time || "").trim();

    const course =
      String(req.body.course || "").trim();

    const distance =
      String(req.body.distance || "").trim();

    const runners =
      Number(req.body.runners);

    const bases =
      String(req.body.bases || "").trim();

    const secondChances =
      String(
        req.body.second_chances || ""
      ).trim();

    const outsiders =
      String(req.body.outsiders || "").trim();

    const replacement =
      String(req.body.replacement || "").trim();

    const tierce =
      String(req.body.tierce || "").trim();

    const quarte =
      String(req.body.quarte || "").trim();

    const quinte =
      String(req.body.quinte || "").trim();

    const notes =
      String(req.body.notes || "").trim();

    if (
      !raceDate ||
      !title ||
      !startTime ||
      !course ||
      !distance ||
      !Number.isInteger(runners) ||
      runners < 1 ||
      runners > 99 ||
      !bases ||
      !secondChances ||
      !outsiders ||
      !tierce ||
      !quarte ||
      !quinte
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>❌ Données invalides</h1>
            <p>
              Veuillez remplir tous les champs obligatoires.
            </p>
            <a class="btn" href="/admin/tip/new">
              Retour
            </a>
          </div>
          `
        )
      );
    }

    /*
      IMPORTANT :
      INSERT = création d'un nouveau pronostic.
      Aucun ancien pronostic n'est remplacé.
      PostgreSQL conserve donc toutes les archives.
    */

    await pool.query(
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
      VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      `,
      [
        raceDate,
        title,
        startTime,
        course,
        distance,
        runners,
        bases,
        secondChances,
        outsiders,
        replacement,
        tierce,
        quarte,
        quinte,
        notes
      ]
    );

    res.redirect("/admin");

  } catch (err) {

    console.error(
      "Erreur création pronostic :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Erreur</h1>
          <p>
            Impossible de publier le pronostic.
          </p>
          <a class="btn" href="/admin">
            Retour Admin
          </a>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   MODIFICATION PRONOSTIC
========================================================= */

app.get("/admin/tip/edit/:id", admin, async (req, res) => {

  try {

    const result =
      await pool.query(
        `
        SELECT *
        FROM tips
        WHERE id = $1
        `,
        [req.params.id]
      );

    const t = result.rows[0];

    if (!t) {

      return res.status(404).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>Pronostic introuvable</h1>
            <a class="btn" href="/admin">
              Retour Admin
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

          <h1>✏️ Modifier le pronostic</h1>

          <form
            method="post"
            action="/admin/tip/edit/${safe(t.id)}"
          >

            <label>
              Date
              <input
                type="date"
                name="race_date"
                value="${safe(
                  String(t.race_date).slice(0,10)
                )}"
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
                max="99"
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

            <hr>

            <h2>🎯 Jeux du jour</h2>

            <label>
              Tiercé — 6 chevaux
              <input
                name="tierce"
                value="${safe(t.tierce || "")}"
                required
              >
            </label>

            <label>
              Quarté — 7 chevaux
              <input
                name="quarte"
                value="${safe(t.quarte || "")}"
                required
              >
            </label>

            <label>
              Quinté — 8 chevaux
              <input
                name="quinte"
                value="${safe(t.quinte || "")}"
                required
              >
            </label>

            <label>
              Notes
              <textarea name="notes">${safe(
                t.notes || ""
              )}</textarea>
            </label>

            <button class="btn success" type="submit">
              Enregistrer les modifications
            </button>

          </form>

        </div>
        `
      )
    );

  } catch (err) {

    console.error(
      "Erreur modification GET :",
      err
    );

    res.status(500).send(
      "Erreur serveur."
    );
  }
});

app.post("/admin/tip/edit/:id", admin, async (req, res) => {

  try {

    const runners =
      Number(req.body.runners);

    const raceDate =
      String(req.body.race_date || "").trim();

    const title =
      String(req.body.title || "").trim();

    const startTime =
      String(req.body.start_time || "").trim();

    const course =
      String(req.body.course || "").trim();

    const distance =
      String(req.body.distance || "").trim();

    const bases =
      String(req.body.bases || "").trim();

    const secondChances =
      String(
        req.body.second_chances || ""
      ).trim();

    const outsiders =
      String(req.body.outsiders || "").trim();

    const replacement =
      String(req.body.replacement || "").trim();

    const tierce =
      String(req.body.tierce || "").trim();

    const quarte =
      String(req.body.quarte || "").trim();

    const quinte =
      String(req.body.quinte || "").trim();

    const notes =
      String(req.body.notes || "").trim();

    if (
      !raceDate ||
      !title ||
      !startTime ||
      !course ||
      !distance ||
      !Number.isInteger(runners) ||
      runners < 1 ||
      runners > 99 ||
      !bases ||
      !secondChances ||
      !outsiders ||
      !tierce ||
      !quarte ||
      !quinte
    ) {

      return res.status(400).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>❌ Données invalides</h1>
            <a class="btn" href="/admin">
              Retour Admin
            </a>
          </div>
          `
        )
      );
    }

    const result =
      await pool.query(
        `
        UPDATE tips
        SET
          race_date = $1,
          title = $2,
          start_time = $3,
          course = $4,
          distance = $5,
          runners = $6,
          bases = $7,
          second_chances = $8,
          outsiders = $9,
          replacement = $10,
          tierce = $11,
          quarte = $12,
          quinte = $13,
          notes = $14,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $15
        RETURNING id
        `,
        [
          raceDate,
          title,
          startTime,
          course,
          distance,
          runners,
          bases,
          secondChances,
          outsiders,
          replacement,
          tierce,
          quarte,
          quinte,
          notes,
          req.params.id
        ]
      );

    if (!result.rows.length) {

      return res.status(404).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>Pronostic introuvable</h1>
            <a class="btn" href="/admin">
              Retour Admin
            </a>
          </div>
          `
        )
      );
    }

    res.redirect("/admin");

  } catch (err) {

    console.error(
      "Erreur modification :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Erreur</h1>
          <p>
            Impossible de modifier le pronostic.
          </p>
          <a class="btn" href="/admin">
            Retour Admin
          </a>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   SUPPRESSION PRONOSTIC
========================================================= */

app.post("/admin/tip/delete", admin, async (req, res) => {

  try {

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

    await pool.query(
      `
      DELETE FROM tips
      WHERE id = $1
      `,
      [id]
    );

    res.redirect("/admin");

  } catch (err) {

    console.error(
      "Erreur suppression :",
      err
    );

    res.status(500).send(
      "Erreur serveur."
    );
  }
});

/* =========================================================
   CONFIRMATION PAIEMENT
========================================================= */

app.post("/admin/confirm", admin, async (req, res) => {

  const client =
    await pool.connect();

  try {

    const paymentId =
      Number(req.body.payment_id);

    if (
      !Number.isInteger(paymentId) ||
      paymentId < 1
    ) {
      client.release();
      return res.status(400).send(
        "Identifiant de paiement invalide."
      );
    }

    await client.query("BEGIN");

    const paymentResult =
      await client.query(
        `
        SELECT *
        FROM payments
        WHERE id = $1
        FOR UPDATE
        `,
        [paymentId]
      );

    const payment =
      paymentResult.rows[0];

    if (!payment) {

      await client.query("ROLLBACK");
      client.release();

      return res.status(404).send(
        page(
          req,
          "Erreur",
          `
          <div class="card">
            <h1>Paiement introuvable</h1>
            <a class="btn" href="/admin">
              Retour Admin
            </a>
          </div>
          `
        )
      );
    }

    if (payment.status === "confirmed") {

      await client.query("ROLLBACK");
      client.release();

      return res.send(
        page(
          req,
          "Paiement déjà confirmé",
          `
          <div class="card">
            <h1>✅ Paiement déjà confirmé</h1>
            <p>
              Cette demande a déjà été traitée.
            </p>
            <a class="btn" href="/admin">
              Retour Admin
            </a>
          </div>
          `
        )
      );
    }

    const days =
      payment.plan === "30" ? 30 : 15;

    const userResult =
      await client.query(
        `
        SELECT *
        FROM users
        WHERE id = $1
        FOR UPDATE
        `,
        [payment.user_id]
      );

    const user =
      userResult.rows[0];

    if (!user) {

      await client.query("ROLLBACK");
      client.release();

      return res.status(404).send(
        "Utilisateur introuvable."
      );
    }

    let baseDate = new Date();

    if (
      user.vip_until &&
      new Date(user.vip_until) > baseDate
    ) {
      baseDate =
        new Date(user.vip_until);
    }

    const until =
      new Date(
        baseDate.getTime() +
        days * 24 * 60 * 60 * 1000
      );

    await client.query(
      `
      UPDATE payments
      SET
        status = 'confirmed',
        confirmed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [payment.id]
    );

    await client.query(
      `
      UPDATE users
      SET vip_until = $1
      WHERE id = $2
      `,
      [
        until.toISOString(),
        payment.user_id
      ]
    );

    await client.query("COMMIT");
    client.release();

    res.redirect("/admin");

  } catch (err) {

    try {
      await client.query("ROLLBACK");
    } catch (_) {}

    client.release();

    console.error(
      "Erreur confirmation paiement :",
      err
    );

    res.status(500).send(
      page(
        req,
        "Erreur",
        `
        <div class="card">
          <h1>❌ Erreur de confirmation</h1>
          <p>
            Le paiement n'a pas pu être confirmé.
          </p>
          <a class="btn" href="/admin">
            Retour Admin
          </a>
        </div>
        `
      )
    );
  }
});

/* =========================================================
   HEALTH CHECK RENDER
========================================================= */

app.get("/healthz", async (req, res) => {

  try {

    await pool.query("SELECT 1");

    res.status(200).send("OK");

  } catch (err) {

    console.error(
      "Health check database error :",
      err
    );

    res.status(503).send(
      "Database unavailable"
    );
  }
});

/* =========================================================
   404
========================================================= */

app.use((req, res) => {

  res.status(404).send(
    page(
      req,
      "Page introuvable",
      `
      <div class="card center">

        <h1>404 — Page introuvable</h1>

        <p>
          La page que vous recherchez n'existe pas.
        </p>

        <a class="btn" href="/">
          Retour à l'accueil
        </a>

      </div>
      `
    )
  );
});

/* =========================================================
   ERREURS
========================================================= */

app.use((err, req, res, next) => {

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
      <div class="card center">

        <h1>❌ Erreur serveur</h1>

        <p>
          Une erreur inattendue est survenue.
          Veuillez réessayer.
        </p>

        <a class="btn" href="/">
          Retour à l'accueil
        </a>

      </div>
      `
    )
  );
});

/* =========================================================
   DEMARRAGE
========================================================= */

async function startServer() {

  try {

    console.log(
      "Connexion à PostgreSQL..."
    );

    await pool.query("SELECT 1");

    console.log(
      "PostgreSQL : connexion OK"
    );

    await initializeDatabase();

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
          "Serveur lancé sur le port " + PORT
        );

        console.log(
          "Base : PostgreSQL"
        );

        console.log(
          "Admin : " + ADMIN_EMAIL
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
          "Pronostic : réservé VIP"
        );

        console.log(
          "Archives : publiques après la course"
        );

        console.log(
          "Anciens pronostics : conservés"
        );

        console.log(
          "=========================================="
        );
      }
    );

  } catch (err) {

    console.error(
      "=========================================="
    );

    console.error(
      "IMPOSSIBLE DE DÉMARRER LE SERVEUR"
    );

    console.error(err);

    console.error(
      "Vérifiez DATABASE_URL dans Render."
    );

    console.error(
      "=========================================="
    );

    process.exit(1);
  }
}

/* =========================================================
   ARRET PROPRE
========================================================= */

async function shutdown(signal) {

  console.log(
    `${signal} reçu. Arrêt du serveur...`
  );

  try {

    await pool.end();

    console.log(
      "PostgreSQL fermé."
    );

    process.exit(0);

  } catch (err) {

    console.error(
      "Erreur fermeture PostgreSQL :",
      err
    );

    process.exit(1);
  }
}

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

/* =========================================================
   LANCEMENT
========================================================= */

startServer();
