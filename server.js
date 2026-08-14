require("dotenv").config();

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const db = new Database("data-francais.db");
db.pragma("journal_mode = WAL");

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
  meeting TEXT NOT NULL,
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

const adminEmail =
  process.env.ADMIN_EMAIL ||
  "admin@special-quinte-francais.com";

const adminPassword =
  process.env.ADMIN_PASSWORD ||
  "ChangeMeNow123!";

const adminExists = db
  .prepare("SELECT id FROM users WHERE email=?")
  .get(adminEmail);

if (!adminExists) {
  const hash = bcrypt.hashSync(adminPassword, 12);

  db.prepare(`
    INSERT INTO users
    (name,email,phone,password_hash,role)
    VALUES (?,?,?,?,?)
  `).run(
    "Administrateur",
    adminEmail,
    "0000000000",
    hash,
    "admin"
  );
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || "CHANGE-ME",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 7 * 24 * 60 * 60 * 1000
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

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
    return res
      .status(403)
      .send(
        page(
          "Accès refusé",
          "<p>Accès administrateur requis.</p>",
          req
        )
      );
  }

  next();
}

function page(title, body, req) {
  const connected =
    !!(req && req.session && req.session.userId);

  const isAdmin =
    !!(
      req &&
      req.session &&
      req.session.role === "admin"
    );

  return `
<!doctype html>
<html lang="fr">

<head>
<meta charset="utf-8">
<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>
${title} — Spécial Quinté Français
</title>

<link rel="stylesheet" href="/style.css">
</head>

<body>

<header>

<a class="logo" href="/">
♞ SPÉCIAL QUINTÉ
<small>FRANÇAIS</small>
</a>

<nav>

<a href="/">Accueil</a>

<a href="/pronostic">
Pronostic VIP
</a>

<a href="/abonnement">
Abonnement
</a>

${
  connected
    ? '<a href="/compte">Mon compte</a>'
    : '<a href="/inscription">Créer un compte</a>'
}

${
  isAdmin
    ? '<a href="/admin">Admin</a>'
    : ""
}

${
  connected
    ? '<a href="/deconnexion">Déconnexion</a>'
    : '<a href="/connexion">Connexion</a>'
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

app.get("/", (req, res) => {
  res.send(
    page(
      "Accueil",
      `
<section class="hero">

<h1>
SPÉCIAL QUINTÉ FRANÇAIS
</h1>

<p>
Pronostics hippiques VIP — France
</p>

<div class="race">

<b>
QUINTÉ DU JOUR
</b>

<strong>
PRONOSTIC VIP
</strong>

<span>
Bases • Secondes chances • Outsiders • Remplaçant
</span>

</div>

<a class="btn" href="/abonnement">
Voir les abonnements
</a>

</section>

<section class="grid">

<div class="card">

<h2>
🔒 Pronostic du jour
</h2>

<p>
Le pronostic complet est réservé
aux abonnés VIP.
</p>

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

<a class="btn" href="/abonnement">
S’abonner
</a>

</div>

</section>
`,
      req
    )
  );
});

app.get("/inscription", (req, res) => {
  res.send(
    page(
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
Téléphone Orange Money
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
`,
      req
    )
  );
});

app.post("/inscription", (req, res) => {

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
    return res
      .status(400)
      .send(
        page(
          "Erreur",
          "<p>Informations manquantes.</p>",
          req
        )
      );
  }

  try {

    const hash =
      bcrypt.hashSync(password, 12);

    const info =
      db.prepare(`
        INSERT INTO users
        (name,email,phone,password_hash)
        VALUES (?,?,?,?)
      `).run(
        name,
        email.toLowerCase(),
        phone,
        hash
      );

    req.session.userId =
      info.lastInsertRowid;

    req.session.role =
      "member";

    res.redirect("/abonnement");

  } catch (e) {

    res
      .status(400)
      .send(
        page(
          "Erreur",
          "<p>Cette adresse e-mail existe déjà.</p>",
          req
        )
      );
  }
});

app.get("/connexion", (req, res) => {

  res.send(
    page(
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
`,
      req
    )
  );
});

app.post("/connexion", (req, res) => {

  const email =
    (req.body.email || "")
      .toLowerCase();

  const password =
    req.body.password || "";

  const user =
    db.prepare(
      "SELECT * FROM users WHERE email=?"
    ).get(email);

  if (
    !user ||
    !bcrypt.compareSync(
      password,
      user.password_hash
    )
  ) {

    return res
      .status(401)
      .send(
        page(
          "Connexion",
          "<p>Identifiants incorrects.</p>",
          req
        )
      );
  }

  req.session.userId = user.id;
  req.session.role = user.role;

  res.redirect("/compte");
});

app.get("/deconnexion", (req, res) => {

  req.session.destroy(() => {
    res.redirect("/");
  });

});app.get("/abonnement", auth, (req, res) => {
  res.send(page("Abonnement", `
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

<a class="btn" href="/payer?plan=15">
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

<a class="btn" href="/payer?plan=30">
Payer avec Orange Money
</a>

</div>

</div>

<div class="card">

<h2>
ℹ️ Paiement Orange Money
</h2>

<p>
Après votre transfert Orange Money,
indiquez votre numéro et la référence
de la transaction.
</p>

<p>
L'administrateur confirme ensuite
le paiement et active votre accès VIP.
</p>

</div>

</div>
`, req));
});


app.get("/payer", auth, (req, res) => {

  const plan =
    req.query.plan === "30"
      ? "30"
      : "15";

  const amount =
    plan === "30"
      ? 100
      : 70;

  const number =
    process.env.ORANGE_MONEY_NUMBER ||
    "À CONFIGURER";

  const merchantName =
    process.env.ORANGE_MONEY_NAME ||
    "À CONFIGURER";

  const user =
    db.prepare(
      "SELECT phone FROM users WHERE id=?"
    ).get(req.session.userId);

  res.send(page("Paiement Orange Money", `

<div class="formbox">

<h1>
Paiement Orange Money
</h1>

<p>
Abonnement :
<b>
${plan === "30" ? "1 mois" : "15 jours"}
</b>
—
<b>
${amount} €
</b>
</p>

<div class="notice">

Numéro marchand :
<b>
${number}
</b>

<br>

Nom marchand :
<b>
${merchantName}
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
value="${user ? user.phone : ""}"
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

<button class="btn">
Envoyer la demande
</button>

</form>

</div>

`, req));

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

  db.prepare(`
    INSERT INTO payments
    (user_id,plan,amount_eur,phone,transaction_ref)
    VALUES (?,?,?,?,?)
  `).run(
    req.session.userId,
    plan,
    amount,
    req.body.phone,
    req.body.transaction_ref
  );

  res.send(page("Paiement envoyé", `

<div class="formbox">

<h1>
Demande reçue ✅
</h1>

<p>
Votre demande de paiement a été enregistrée.
</p>

<p>
Après confirmation du paiement,
votre accès VIP sera activé.
</p>

<a class="btn" href="/compte">
Mon compte
</a>

</div>

`, req));

});


app.get("/compte", auth, (req, res) => {

  const user =
    db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(req.session.userId);

  const payments =
    db.prepare(`
      SELECT *
      FROM payments
      WHERE user_id=?
      ORDER BY id DESC
    `).all(user.id);

  const active =
    user.vip_until &&
    new Date(user.vip_until) > new Date();

  res.send(page("Mon compte", `

<div class="card">

<h1>
Bonjour ${user.name}
</h1>

<p>
${user.email}
•
${user.phone}
</p>

<h2>
Statut :
${active ? "🟢 VIP actif" : "⚪ Non abonné"}
</h2>

${
  active
    ? `
<p>
Votre accès VIP expire le
<b>
${new Date(user.vip_until).toLocaleString("fr-FR")}
</b>.
</p>

<a class="btn" href="/pronostic">
Accéder au pronostic
</a>
`
    : `
<a class="btn" href="/abonnement">
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
<p>
Commande #${p.id}
—
${p.amount_eur} €
—
${p.status}
</p>
`).join("")
    : "<p>Aucun paiement.</p>"
}

</div>

`, req));

});


app.get("/pronostic", auth, (req, res) => {

  const user =
    db.prepare(
      "SELECT * FROM users WHERE id=?"
    ).get(req.session.userId);

  const active =
    user.vip_until &&
    new Date(user.vip_until) > new Date();

  if (!active) {
    return res.redirect("/abonnement");
  }

  const tip =
    db.prepare(`
      SELECT *
      FROM tips
      ORDER BY race_date DESC, id DESC
      LIMIT 1
    `).get();

  if (!tip) {
    return res.send(page("Pronostic VIP", `

<div class="card">

<h1>
🔐 PRONOSTIC VIP
</h1>

<p>
Aucun pronostic n'est encore publié.
</p>

</div>

`, req));
  }

  res.send(page("Pronostic VIP", `

<div class="card">

<h1>
🔐 PRONOSTIC VIP
</h1>

<h2>
${tip.title}
</h2>

<p>
${tip.race_date}
•
${tip.meeting}
•
${tip.course}
•
${tip.start_time}
•
${tip.distance}
•
${tip.runners} partants
</p>

<div class="picks">

<b>
BASES
<br>
<span>
${tip.bases}
</span>
</b>

<b>
SECONDES CHANCES
<br>
<span>
${tip.second_chances}
</span>
</b>

<b>
OUTSIDERS
<br>
<span>
${tip.outsiders}
</span>
</b>

<b>
REMPLAÇANT
<br>
<span>
${tip.replacement || "-"}
</span>
</b>

</div>

${
  tip.tierce
    ? `<p><b>Tiercé :</b> ${tip.tierce}</p>`
    : ""
}

${
  tip.quarte
    ? `<p><b>Quarté :</b> ${tip.quarte}</p>`
    : ""
}

${
  tip.quinte
    ? `<p><b>Quinté :</b> ${tip.quinte}</p>`
    : ""
}

<p class="notice">
${tip.notes || ""}
</p>

</div>

`, req));

});


app.get("/admin", admin, (req, res) => {

  const users =
    db.prepare(`
      SELECT id,name,email,phone,role,vip_until
      FROM users
      ORDER BY id DESC
    `).all();

  const payments =
    db.prepare(`
      SELECT p.*,u.name,u.email
      FROM payments p
      JOIN users u ON u.id=p.user_id
      ORDER BY p.id DESC
    `).all();

  const tips =
    db.prepare(`
      SELECT *
      FROM tips
      ORDER BY race_date DESC,id DESC
    `).all();

  res.send(page("Administration", `

<div class="card">

<h1>
⚙️ Tableau de bord administrateur
</h1>

<p>
<a class="btn" href="/admin/pronostic/nouveau">
➕ Nouveau pronostic
</a>
</p>

<h2>
🏇 Historique des pronostics
</h2>

${
  tips.length
    ? tips.map(t => `

<div class="row">

<b>
${t.race_date}
</b>

—
${t.title}

<br>

Bases :
${t.bases}

|

Secondes chances :
${t.second_chances}

|

Outsiders :
${t.outsiders}

|

Remplaçant :
${t.replacement || "-"}

<br>

<a
class="btn"
href="/admin/pronostic/modifier/${t.id}"
>
✏️ Modifier
</a>

<form
method="post"
action="/admin/pronostic/supprimer/${t.id}"
style="display:inline"
onsubmit="return confirm('Supprimer ce pronostic ?')"
>

<button class="btn">
🗑️ Supprimer
</button>

</form>

</div>

`).join("")
    : "<p>Aucun pronostic.</p>"
}

<h2>
💳 Demandes de paiement
</h2>

${
  payments.length
    ? payments.map(p => `

<div class="row">

<b>
#${p.id}
</b>

${p.name}
—
${p.amount_eur} €
—
${p.phone}
—
${p.status}

${
  p.status === "pending"
    ? `
<form
method="post"
action="/admin/confirm"
style="display:inline"
>

<input
type="hidden"
name="payment_id"
value="${p.id}"
>

<button class="btn">
Confirmer
</button>

</form>
`
    : ""
}

</div>

`).join("")
    : "<p>Aucune demande de paiement.</p>"
}

<h2>
👥 Comptes
</h2>

${
  users.map(u => `

<div class="row">

${u.name}
—
${u.email}
—

VIP :
${u.vip_until || "non"}

</div>

`).join("")
}

</div>

`, req));

});


app.get(
  "/admin/pronostic/nouveau",
  admin,
  (req, res) => {

    res.send(page("Nouveau pronostic", `

<div class="formbox">

<h1>
➕ Nouveau pronostic
</h1>

<form
method="post"
action="/admin/pronostic/nouveau"
>

<label>
Date
<input
type="date"
name="race_date"
required
>
</label>

<label>
Réunion
<input
name="meeting"
placeholder="R1"
>
</label>

<label>
Course
<input
name="course"
placeholder="C1"
>
</label>

<label>
Titre
<input
name="title"
placeholder="PRIX ..."
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
Distance
<input
name="distance"
placeholder="2 000 M"
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
placeholder="6 - 5 - 4"
required
>
</label>

<label>
Secondes chances
<input
name="second_chances"
placeholder="12 - 8 - 7"
required
>
</label>

<label>
Outsiders
<input
name="outsiders"
placeholder="9 - 16"
required
>
</label>

<label>
Remplaçant
<input
name="replacement"
placeholder="13"
>
</label>

<label>
Tiercé
<input
name="tierce"
>
</label>

<label>
Quarté
<input
name="quarte"
>
</label>

<label>
Quinté
<input
name="quinte"
>
</label>

<label>
Commentaire
<textarea
name="notes"
rows="4"
></textarea>
</label>

<button class="btn">
🚀 Publier le pronostic
</button>

</form>

</div>

`, req));

});


app.post(
  "/admin/pronostic/nouveau",
  admin,
  (req, res) => {

    const x = req.body;

    if (
      !x.race_date ||
      !x.title ||
      !x.start_time ||
      !x.distance ||
      !x.runners ||
      !x.bases ||
      !x.second_chances ||
      !x.outsiders
    ) {

      return res
        .status(400)
        .send(
          page(
            "Erreur",
            "<p>Champs obligatoires manquants.</p>",
            req
          )
        );
    }

    db.prepare(`
      INSERT INTO tips
      (
        race_date,
        title,
        start_time,
        meeting,
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
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      x.race_date,
      x.title,
      x.start_time,
      x.meeting || "",
      x.course || "",
      x.distance,
      Number(x.runners),
      x.bases,
      x.second_chances,
      x.outsiders,
      x.replacement || "",
      x.tierce || "",
      x.quarte || "",
      x.quinte || "",
      x.notes || ""
    );

    res.redirect("/admin");
  }
);


app.get(
  "/admin/pronostic/modifier/:id",
  admin,
  (req, res) => {

    const tip =
      db.prepare(
        "SELECT * FROM tips WHERE id=?"
      ).get(req.params.id);

    if (!tip) {
      return res
        .status(404)
        .send(
          page(
            "Erreur",
            "<p>Pronostic introuvable.</p>",
            req
          )
        );
    }

    res.send(page("Modifier le pronostic", `

<div class="formbox">

<h1>
✏️ Modifier le pronostic
</h1>

<form
method="post"
action="/admin/pronostic/modifier/${tip.id}"
>

<label>
Date
<input
type="date"
name="race_date"
value="${tip.race_date}"
required
>
</label>

<label>
Réunion
<input
name="meeting"
value="${tip.meeting}"
>
</label>

<label>
Course
<input
name="course"
value="${tip.course}"
>
</label>

<label>
Titre
<input
name="title"
value="${tip.title}"
required
>
</label>

<label>
Heure
<input
name="start_time"
value="${tip.start_time}"
required
>
</label>

<label>
Distance
<input
name="distance"
value="${tip.distance}"
required
>
</label>

<label>
Partants
<input
type="number"
name="runners"
value="${tip.runners}"
required
>
</label>

<label>
Bases
<input
name="bases"
value="${tip.bases}"
required
>
</label>

<label>
Secondes chances
<input
name="second_chances"
value="${tip.second_chances}"
required
>
</label>

<label>
Outsiders
<input
name="outsiders"
value="${tip.outsiders}"
required
>
</label>

<label>
Remplaçant
<input
name="replacement"
value="${tip.replacement || ""}"
>
</label>

<label>
Tiercé
<input
name="tierce"
value="${tip.tierce || ""}"
>
</label>

<label>
Quarté
<input
name="quarte"
value="${tip.quarte || ""}"
>
</label>

<label>
Quinté
<input
name="quinte"
value="${tip.quinte || ""}"
>
</label>

<label>
Commentaire
<textarea
name="notes"
rows="4"
>${tip.notes || ""}</textarea>
</label>

<button class="btn">
💾 Enregistrer
</button>

</form>

</div>

`, req));

  }
);


app.post(
  "/admin/pronostic/modifier/:id",
  admin,
  (req, res) => {

    const x = req.body;

    db.prepare(`
      UPDATE tips SET
        race_date=?,
        title=?,
        start_time=?,
        meeting=?,
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
        notes=?
      WHERE id=?
    `).run(
      x.race_date,
      x.title,
      x.start_time,
      x.meeting || "",
      x.course || "",
      x.distance,
      Number(x.runners),
      x.bases,
      x.second_chances,
      x.outsiders,
      x.replacement || "",
      x.tierce || "",
      x.quarte || "",
      x.quinte || "",
      x.notes || "",
      req.params.id
    );

    res.redirect("/admin");
  }
);


app.post(
  "/admin/pronostic/supprimer/:id",
  admin,
  (req, res) => {

    db.prepare(
      "DELETE FROM tips WHERE id=?"
    ).run(req.params.id);

    res.redirect("/admin");
  }
);


app.post(
  "/admin/confirm",
  admin,
  (req, res) => {

    const payment =
      db.prepare(
        "SELECT * FROM payments WHERE id=?"
      ).get(req.body.payment_id);

    if (!payment) {
      return res
        .status(404)
        .send("Paiement introuvable");
    }

    const days =
      payment.plan === "30"
        ? 30
        : 15;

    const until =
      new Date(
        Date.now() +
        days * 86400000
      ).toISOString();

    db.prepare(`
      UPDATE payments
      SET status='confirmed',
          confirmed_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(payment.id);

    db.prepare(`
      UPDATE users
      SET vip_until=?
      WHERE id=?
    `).run(
      until,
      payment.user_id
    );

    res.redirect("/admin");
  }
);


app.get("/health", (req, res) => {
  res.status(200).send("OK");
});


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
