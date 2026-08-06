#!/usr/bin/env node
/* ============================================================
   Kawaii Shop Hop — site builder
   Reads members.json, writes the whole static ring into docs/.
   Zero dependencies. Node 20+.

   node scripts/build.mjs          build docs/
   node scripts/build.mjs --dry    validate only, write nothing
   ============================================================ */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "docs");
const DRY = process.argv.includes("--dry");

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])$/;
const TIERS = ["ring", "friend"];
const STATES = ["pending", "active", "warned", "suspended"];

/* ---------- helpers ---------- */

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function put(rel, body) {
  if (DRY) return;
  const path = join(OUT, rel);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body, "utf8");
}

/* ---------- validation ---------- */

function validate(data) {
  const errors = [];
  const cfg = data.ring || {};
  for (const k of ["name", "host", "applyUrl"]) {
    if (!cfg[k]) errors.push(`ring.${k} is missing`);
  }
  if (cfg.host && cfg.host.endsWith("/")) errors.push("ring.host must not end in a slash");

  const seen = new Set();
  for (const [i, m] of (data.members || []).entries()) {
    const at = `members[${i}] (${m.slug || "no slug"})`;
    if (!SLUG_RE.test(m.slug || "")) {
      errors.push(`${at}: slug must be lowercase letters, numbers and hyphens, 2-32 chars`);
    }
    if (seen.has(m.slug)) errors.push(`${at}: duplicate slug`);
    seen.add(m.slug);

    if (!m.name) errors.push(`${at}: name is required`);
    if (!m.blurb) errors.push(`${at}: blurb is required`);
    if (m.blurb && m.blurb.length > 70) errors.push(`${at}: blurb must be 70 characters or fewer`);
    if (!TIERS.includes(m.tier)) errors.push(`${at}: tier must be one of ${TIERS.join(", ")}`);
    if (!STATES.includes(m.status)) errors.push(`${at}: status must be one of ${STATES.join(", ")}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.joined || "")) errors.push(`${at}: joined must be YYYY-MM-DD`);

    try {
      const u = new URL(m.url);
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
    } catch {
      errors.push(`${at}: url must be a full http(s) address`);
    }
  }
  if (errors.length) {
    console.error("members.json is not valid:\n" + errors.map((e) => "  - " + e).join("\n"));
    process.exit(1);
  }
}

/* ---------- ring order ----------
   Sorted by join date so approving a new shop appends to the ring
   instead of reshuffling everyone's neighbours. Ties break on slug
   so the order is identical on every machine. */

const byJoined = (a, b) => a.joined.localeCompare(b.joined) || a.slug.localeCompare(b.slug);

/* ---------- shared chrome ---------- */

const CSS = `
:root{
  --blue:#6dcff6;--green:#8cd9a8;--purple:#a186be;--fuchsia:#d80c8c;
  --thistle:#e5bbfa;--pink:#f49ac1;--orange:#fdc689;--yellow:#fff799;
  --gum:var(--pink);--grape:var(--purple);--mint:var(--green);
  --sky:#f3e6fc;--floss:#fcd9ea;--enamel:#fffbfe;--face:#f7eefc;
  --ink:#40274f;--ink-soft:#7b6690;
  --line:#dfc6ee;--hi:#fff;--lo:#8a70a6;
  --bar-a:#f49ac1;--bar-b:#a186be;
  --ui:Tahoma,Verdana,Geneva,sans-serif;
  --chrome:"Trebuchet MS",Tahoma,sans-serif;
  --bitmap:"Silkscreen","Courier New",monospace;
}
*{box-sizing:border-box}
body{
  margin:0;padding:26px 16px 60px;font:12px/1.55 var(--ui);color:var(--ink);
  background:var(--sky);
  background-image:
    linear-gradient(180deg,#f6e3fb 0%,#f9dcef 42%,#e8f6ec 42%,#dff0e6 100%);
  background-attachment:fixed;
  -webkit-font-smoothing:antialiased;
}
a{color:#8f2f78}
a:hover{color:var(--fuchsia)}
:focus-visible{outline:2px dashed var(--ink);outline-offset:2px}

/* the hub is one Toothache OS window sitting on the desktop */
.win{
  max-width:760px;margin:0 auto;background:var(--enamel);
  border:1px solid var(--lo);border-radius:8px 8px 4px 4px;
  box-shadow:0 6px 0 rgba(120,90,150,.18),0 14px 34px rgba(90,60,120,.18);
  overflow:hidden;
}
.title{
  display:flex;align-items:center;gap:8px;padding:6px 8px;
  background:linear-gradient(180deg,var(--bar-a),var(--bar-b));
  color:#fff;font:bold 13px var(--chrome);text-shadow:0 1px 0 rgba(0,0,0,.25);
}
.title .dots{margin-left:auto;display:flex;gap:4px}
.title .dots i{
  width:15px;height:14px;border-radius:2px;background:rgba(255,255,255,.32);
  border:1px solid rgba(255,255,255,.5);display:block;
}
.addr{
  display:flex;align-items:center;gap:7px;padding:6px 9px;background:var(--face);
  border-bottom:1px solid var(--line);font:10px var(--bitmap);color:var(--ink-soft);
  overflow:hidden;white-space:nowrap;
}
.addr span{background:#fff;border:1px solid var(--lo);border-radius:3px;padding:3px 8px;flex:1;overflow:hidden;text-overflow:ellipsis}
.body{padding:20px}

.marquee{
  overflow:hidden;border:1px solid var(--line);border-radius:4px;padding:5px 0;margin-bottom:18px;
  background:linear-gradient(90deg,var(--floss),#e5d3f5,var(--mint));
}
.marquee span{display:inline-block;white-space:nowrap;font:11px var(--bitmap);animation:slide 22s linear infinite;padding-left:100%}
@keyframes slide{to{transform:translateX(-100%)}}

h1{font:bold 21px var(--chrome);margin:0 0 4px;text-align:center}
h2{font:bold 14px var(--chrome);margin:28px 0 10px;padding-bottom:5px;border-bottom:1px solid var(--line)}
.lede{max-width:46ch;margin:0 auto 18px;text-align:center;color:#5c4568}
.count{display:block;text-align:center;font:10px var(--bitmap);color:var(--ink-soft);margin-bottom:16px}

.nav{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin:20px 0 4px}
.btn{
  display:inline-block;padding:7px 14px;text-decoration:none;color:var(--ink);
  background:linear-gradient(180deg,#fff,var(--face));
  border:1px solid var(--lo);border-radius:4px;box-shadow:inset 0 1px 0 #fff;
  font:12px var(--ui);cursor:pointer;
}
.btn:hover{background:linear-gradient(180deg,#fff,var(--floss));border-color:var(--gum);color:var(--ink)}
.btn.primary{background:linear-gradient(180deg,#fbb5d4,var(--gum));border-color:#c76a9c;color:#4a1b3a;font-weight:bold}
.btn.primary:hover{background:linear-gradient(180deg,#ffc9e0,#f6a8c9)}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(214px,1fr));gap:10px}
.card{
  display:flex;gap:10px;align-items:flex-start;padding:10px;text-decoration:none;color:var(--ink);
  background:#fff;border:1px solid var(--line);border-radius:5px;
}
.card:hover{border-color:var(--gum);background:#fffafd;color:var(--ink)}
.card .n{font:10px var(--bitmap);color:var(--ink-soft);padding-top:2px;min-width:20px}
.card b{display:block;font-weight:bold}
.card small{color:var(--ink-soft);display:block}
.card[data-me="1"]{border-color:var(--gum);background:linear-gradient(180deg,#fff,#fdeef6)}

code,pre{font-family:"Courier New",monospace;font-size:12px}
pre{
  background:#fff;border:1px solid var(--line);border-radius:5px;padding:12px;
  overflow:auto;white-space:pre;line-height:1.5;
}
.field{width:100%;padding:7px 9px;border:1px solid var(--lo);border-radius:4px;font:12px var(--ui);background:#fff;color:var(--ink)}
label{display:block;font-weight:bold;margin:14px 0 5px}
.note{background:var(--face);border:1px solid var(--line);border-radius:5px;padding:11px 13px;margin:14px 0}
ol,ul{padding-left:20px}
li{margin:6px 0}
footer{max-width:760px;margin:16px auto 0;text-align:center;font:10px var(--bitmap);color:#7b6690}
footer a{color:#7b6690}
table{width:100%;border-collapse:collapse;margin-top:8px}
th,td{text-align:left;padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:bold 11px var(--chrome);color:var(--ink-soft);text-transform:uppercase;letter-spacing:.4px}
@media (prefers-reduced-motion:reduce){.marquee span{animation:none;padding-left:0}}
@media (max-width:520px){body{padding:10px 8px 40px}.body{padding:14px}}
`;

const badgeSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="31" viewBox="0 0 88 31" role="img" aria-label="Kawaii Shop Hop">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fcd9ea"/><stop offset=".55" stop-color="#e5d3f5"/><stop offset="1" stop-color="#8cd9a8"/>
    </linearGradient>
  </defs>
  <rect width="88" height="31" fill="url(#g)"/>
  <rect x=".5" y=".5" width="87" height="30" fill="none" stroke="#8a70a6"/>
  <rect x="2.5" y="2.5" width="83" height="26" fill="none" stroke="#fff" opacity=".75"/>
  <g fill="#40274f" font-family="'Courier New',monospace" font-size="8" font-weight="bold" text-anchor="middle">
    <text x="44" y="14">KAWAII</text>
    <text x="44" y="24">SHOP HOP</text>
  </g>
  <g fill="#d80c8c"><rect x="6" y="6" width="2" height="2"/><rect x="80" y="23" width="2" height="2"/></g>
</svg>`;

function shell({ title, addr, body, robots = "" }) {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${robots}
<link rel="stylesheet" href="/ring.css">
<link rel="icon" href="/badge/badge.svg">
</head><body>
<div class="win">
  <div class="title"><span>${esc(title)}</span><span class="dots"><i></i><i></i><i></i></span></div>
  <div class="addr"><span>${esc(addr)}</span></div>
  <div class="body">
${body}
  </div>
</div>
<footer>kept by <a href="https://toothacheshop.com">Toothache</a> · <a href="/">the ring</a> · <a href="/join/">join</a> · <a href="/about/">about the crawler</a></footer>
</body></html>`;
}

/* ---------- redirect page ----------
   GitHub Pages can't issue a 302, so every hop is a pre-generated page:
   location.replace fires instantly, meta refresh covers no-JS, and a real
   link covers both failing. Nobody should ever see this for more than a blink. */

function redirectPage({ to, label, from, kind, host }) {
  const j = JSON.stringify(to);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="refresh" content="0;url=${esc(to)}">
<link rel="canonical" href="${esc(to)}">
<title>Hopping to ${esc(label)}…</title>
<link rel="stylesheet" href="/ring.css">
</head><body>
<div class="win"><div class="title"><span>Kawaii Shop Hop</span></div>
<div class="body" style="text-align:center">
  <img src="/badge/badge.svg" width="88" height="31" alt="">
  <p style="margin:14px 0 4px">Hopping ${esc(kind)} to <b>${esc(label)}</b>…</p>
  <p><a href="${esc(to)}">Go there now</a></p>
  <p style="font:10px var(--bitmap);color:var(--ink-soft)">from ${esc(from)} · <a href="/">back to the ring</a></p>
</div></div>
<script>location.replace(${j});</script>
</body></html>`;
}

/* ---------- pages ---------- */

function hubPage(cfg, rotation, friends) {
  const cards = rotation.map((m, i) => `      <a class="card" href="${esc(m.url)}" data-me="${m.slug === "toothache" ? 1 : 0}">
        <span class="n">${String(i + 1).padStart(2, "0")}</span>
        <span><b>${esc(m.name)}</b><small>${esc(m.blurb)}</small></span>
      </a>`).join("\n");

  const friendCards = friends.length ? `
    <h2>Friends of the ring</h2>
    <p style="color:#5c4568;margin:0 0 10px">Shops that live on social rather than a site of their own. They're listed here, but they sit outside the hop — a profile page can't pass you along to the next stop.</p>
    <div class="grid">
${friends.map((m) => `      <a class="card" href="${esc(m.url)}"><span class="n">✿</span><span><b>${esc(m.name)}</b><small>${esc(m.blurb)}</small></span></a>`).join("\n")}
    </div>` : "";

  return shell({
    title: `${cfg.name} — the ring`,
    addr: `${cfg.host}/`,
    body: `    <div class="marquee"><span>✿ ${esc(cfg.name)} ✿ ${rotation.length} shops and counting ✿ no algorithm, no ads, no pay-to-rank ✿ hop responsibly ✿</span></div>
    <p style="text-align:center;margin:0 0 10px"><img src="/badge/badge.svg" width="88" height="31" alt="${esc(cfg.name)}"></p>
    <h1>${esc(cfg.name)}</h1>
    <p class="lede">${esc(cfg.tagline)}. Every shop here links to the next one. Follow it far enough and you come back where you started.</p>
    <span class="count">${rotation.length} shop${rotation.length === 1 ? "" : "s"} in the ring · kept by ${esc(cfg.keeper)}</span>
    <div class="nav">
      <a class="btn" href="/random/">Take me somewhere</a>
      <a class="btn primary" href="/join/">Add your shop</a>
    </div>
    <h2>Every shop, in the order they joined</h2>
    <div class="grid">
${cards}
    </div>${friendCards}`,
  });
}

function joinPage(cfg, sample) {
  const snippet = `<!-- Kawaii Shop Hop -->
<div class="kawaii-shop-hop" style="text-align:center;font:12px sans-serif;padding:14px 0">
  <a href="${cfg.host}/prev/YOUR-SLUG/">&#8592; prev</a>
  <a href="${cfg.host}/" style="margin:0 10px"><img
     src="${cfg.host}/badge/badge.svg"
     alt="Kawaii Shop Hop" width="88" height="31" style="vertical-align:middle"></a>
  <a href="${cfg.host}/next/YOUR-SLUG/">next &#8594;</a>
</div>`;

  return shell({
    title: `${cfg.name} — add your shop`,
    addr: `${cfg.host}/join/`,
    body: `    <h1>Add your shop</h1>
    <p class="lede">The ring is small on purpose and every shop is read by a person before it goes in. Here's the whole process.</p>

    <h2>1. Send your details</h2>
    <p>Fill in the short form on the Toothache site: shop name, address, one line about what you make, and an email we can reach you at.</p>
    <p><a class="btn primary" href="${esc(cfg.applyUrl)}">Open the form</a></p>

    <h2>2. We reply with your slug</h2>
    <p>Your slug is your shop's short name in the ring — <code>${esc(sample)}</code>, for instance. It goes in the code below and never changes.</p>

    <h2>3. Paste the code on your site</h2>
    <p>Anywhere a visitor will see it: footer, sidebar, an "internet friends" page. Swap <code>YOUR-SLUG</code> for the slug we send you.</p>
    <label for="slug">Try it — type your slug and the code updates</label>
    <input class="field" id="slug" placeholder="your-slug" autocomplete="off" spellcheck="false">
    <pre id="snippet">${esc(snippet)}</pre>
    <p><button class="btn" type="button" id="copy">Copy the code</button> <span id="copied" style="color:var(--ink-soft)"></span></p>

    <div class="note"><b>It's plain HTML on purpose.</b> No script tag, so it survives Shopify rich text, Squarespace code blocks, Wix embeds, WordPress custom HTML, Neocities and Carrd alike. Restyle it however you like — the crawler only looks for the two links, not the styling.</div>

    <h2>4. Tell us it's live</h2>
    <p>Reply to the email and we'll add you. Once you're in, your prev and next links start working immediately.</p>

    <h2>Staying in</h2>
    <ul>
      <li>A crawler visits each shop once a day and checks the code is still on your page.</li>
      <li>If your site is simply unreachable — maintenance, a firewall, a bad afternoon — that's not held against you.</li>
      <li>If the code is gone for three days running we email you.</li>
      <li>After fourteen days we quietly take the shop out of the rotation. Your record stays, so coming back is one email.</li>
    </ul>

    <h2>No website?</h2>
    <p>If you sell through Instagram or TikTok alone, you can still be listed as a friend of the ring on the front page. You can't be part of the hop itself, because a profile page can't carry a visitor on to the next shop.</p>
<script>
(function(){
  var tpl = ${JSON.stringify(snippet)};
  var i = document.getElementById("slug"), out = document.getElementById("snippet"), c = document.getElementById("copy"), ok = document.getElementById("copied");
  function slugify(v){ return v.toLowerCase().replace(/[^a-z0-9-]+/g,"-").replace(/^-+|-+$/g,""); }
  function render(){ out.textContent = tpl.replace(/YOUR-SLUG/g, slugify(i.value) || "YOUR-SLUG"); }
  i.addEventListener("input", render); render();
  c.addEventListener("click", function(){
    navigator.clipboard.writeText(out.textContent).then(function(){
      ok.textContent = "Copied."; setTimeout(function(){ ok.textContent = ""; }, 2200);
    }, function(){ ok.textContent = "Select the code above and copy it."; });
  });
})();
</script>`,
  });
}

function aboutPage(cfg) {
  return shell({
    title: `${cfg.name} — about the crawler`,
    addr: `${cfg.host}/about/`,
    body: `    <h1>About the crawler</h1>
    <p class="lede">If you found this page in your server logs, here's what came knocking.</p>
    <table>
      <tr><th>User agent</th><td><code>KawaiiShopHopBot/1.0</code></td></tr>
      <tr><th>What it does</th><td>Requests the home page of each shop in the ring, once a day, and checks the HTML for that shop's ring links.</td></tr>
      <tr><th>What it stores</th><td>The date, the HTTP status, and whether the links were found. Nothing else. No page content is kept.</td></tr>
      <tr><th>Rate</th><td>One request per shop per day, a few seconds apart.</td></tr>
      <tr><th>Opting out</th><td>Ask to leave the ring and it stops the same day.</td></tr>
    </table>
    <p style="margin-top:18px">The whole ring — member list, build script, crawler — is open at <a href="https://github.com/toothachebrand/kawaii-shop-hop">github.com/toothachebrand/kawaii-shop-hop</a>.</p>`,
  });
}

function randomPage(cfg, rotation) {
  const urls = JSON.stringify(rotation.map((m) => m.url));
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Somewhere in the ring…</title>
<link rel="stylesheet" href="/ring.css">
</head><body>
<div class="win"><div class="title"><span>Kawaii Shop Hop</span></div>
<div class="body" style="text-align:center">
  <img src="/badge/badge.svg" width="88" height="31" alt="">
  <p style="margin:14px 0 4px">Picking a shop…</p>
  <p><a href="/">Back to the ring</a></p>
</div></div>
<script>
var u = ${urls};
if (u.length) location.replace(u[Math.floor(Math.random() * u.length)]);
</script>
<noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</body></html>`;
}

function notFound(cfg) {
  return shell({
    title: `${cfg.name} — no such shop`,
    addr: `${cfg.host}/404`,
    robots: '\n<meta name="robots" content="noindex">',
    body: `    <h1>No shop by that name</h1>
    <p class="lede">That slug isn't in the ring. It may have been retired, or the link may have a typo in it.</p>
    <div class="nav"><a class="btn" href="/">See every shop</a><a class="btn" href="/random/">Take me somewhere</a></div>`,
  });
}

/* ---------- embed.js ----------
   Optional convenience for members who can run a script tag. The plain
   HTML snippet is the supported path; this exists so a merchant can drop
   one line into a theme footer and be done. */

function embedJS(cfg) {
  return `/* Kawaii Shop Hop — optional script embed.
   <script src="${cfg.host}/embed.js" data-slug="your-slug" defer></script>
   Renders the same markup as the plain HTML snippet, in place. */
(function () {
  var s = document.currentScript;
  if (!s) return;
  var slug = (s.getAttribute("data-slug") || "").trim();
  if (!slug) return;
  var host = ${JSON.stringify(cfg.host)};
  var d = document.createElement("div");
  d.className = "kawaii-shop-hop";
  d.style.cssText = "text-align:center;font:12px sans-serif;padding:14px 0";
  d.innerHTML =
    '<a href="' + host + '/prev/' + slug + '/">&#8592; prev</a>' +
    '<a href="' + host + '/" style="margin:0 10px"><img src="' + host +
    '/badge/badge.svg" alt="Kawaii Shop Hop" width="88" height="31" style="vertical-align:middle"></a>' +
    '<a href="' + host + '/next/' + slug + '/">next &#8594;</a>';
  s.parentNode.insertBefore(d, s);
})();
`;
}

/* ---------- main ---------- */

const data = JSON.parse(await readFile(join(ROOT, "members.json"), "utf8"));
validate(data);

const cfg = data.ring;
const inRing = (m) => m.tier === "ring" && (m.status === "active" || m.status === "warned");
const rotation = data.members.filter(inRing).sort(byJoined);
const friends = data.members.filter((m) => m.tier === "friend" && m.status !== "suspended" && m.status !== "pending").sort(byJoined);

if (!rotation.length) {
  console.error("No active shops in the ring — refusing to build an empty ring.");
  process.exit(1);
}

if (DRY) {
  console.log(`members.json is valid — ${rotation.length} in the hop, ${friends.length} friend(s).`);
  process.exit(0);
}

// Wipe generated output but keep CNAME, which GitHub wrote and Pages needs.
if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

await put("CNAME", new URL(cfg.host).hostname + "\n");
await put("ring.css", CSS.trim() + "\n");
await put("badge/badge.svg", badgeSVG);
await put("embed.js", embedJS(cfg));
await put("robots.txt", `User-agent: *\nDisallow: /next/\nDisallow: /prev/\nDisallow: /random/\nSitemap: ${cfg.host}/sitemap.txt\n`);
await put("sitemap.txt", [`${cfg.host}/`, `${cfg.host}/join/`, `${cfg.host}/about/`].join("\n") + "\n");
await put("index.html", hubPage(cfg, rotation, friends));
await put("join/index.html", joinPage(cfg, rotation[0].slug));
await put("about/index.html", aboutPage(cfg));
await put("random/index.html", randomPage(cfg, rotation));
await put("404.html", notFound(cfg));

const n = rotation.length;
for (const [i, m] of rotation.entries()) {
  const next = rotation[(i + 1) % n];
  const prev = rotation[(i - 1 + n) % n];
  await put(`next/${m.slug}/index.html`, redirectPage({ to: next.url, label: next.name, from: m.name, kind: "forward", host: cfg.host }));
  await put(`prev/${m.slug}/index.html`, redirectPage({ to: prev.url, label: prev.name, from: m.name, kind: "back", host: cfg.host }));
}

// Public directory. Deliberately excludes anything private — the repo is
// public, so contact addresses live in the application inbox, not here.
await put("members.json", JSON.stringify({
  ring: { name: cfg.name, tagline: cfg.tagline, host: cfg.host, join: `${cfg.host}/join/` },
  updated: new Date().toISOString().slice(0, 10),
  count: n,
  members: rotation.map((m, i) => ({
    position: i + 1, slug: m.slug, name: m.name, url: m.url,
    blurb: m.blurb, tags: m.tags || [], joined: m.joined,
  })),
  friends: friends.map((m) => ({ slug: m.slug, name: m.name, url: m.url, blurb: m.blurb, platform: m.platform || null })),
}, null, 2) + "\n");

console.log(`Built docs/ — ${n} shop${n === 1 ? "" : "s"} in the hop, ${friends.length} friend(s), ${n * 2 + 7} pages.`);
