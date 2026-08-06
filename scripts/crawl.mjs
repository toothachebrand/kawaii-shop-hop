#!/usr/bin/env node
/* ============================================================
   Kawaii Shop Hop — membership crawler
   Visits every shop in the hop and checks its ring links are still there.
   Zero dependencies. Node 20+.

   node scripts/crawl.mjs             daily run: updates data/health.json,
                                      warns at 3 strikes, suspends at 14
   node scripts/crawl.mjs --preflight checks members marked "pending",
                                      writes nothing (used on pull requests)
   node scripts/crawl.mjs --dry       runs the checks, writes nothing
   ============================================================ */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MEMBERS = join(ROOT, "members.json");
const HEALTH = join(ROOT, "data/health.json");
const REPORT = join(ROOT, "data/last-report.md");
const FLAGS = join(ROOT, "data/flags.txt");

const PREFLIGHT = process.argv.includes("--preflight");
const DRY = process.argv.includes("--dry") || PREFLIGHT;

const WARN_AT = 3;      // consecutive days with the code missing before we email
const SUSPEND_AT = 14;  // and before the shop leaves the rotation
const TIMEOUT = 15000;
const GAP = 1500;       // pause between shops — we are a guest on their server
const UA = "Mozilla/5.0 (compatible; KawaiiShopHopBot/1.0; +https://ring.toothacheshop.com/about/)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- one shop ----------
   Three outcomes, and the difference between the last two is the whole
   point of this script:
     ok          the links are there
     missing     the page loaded fine and the links are not there  -> strike
     unreachable we couldn't read the page at all                  -> no strike
   Plenty of small shops sit behind Cloudflare or bot protection that will
   never let a crawler through. That is not the same as leaving the ring,
   and it must never be punished as though it were. */

async function check(member, host) {
  const target = member.checkUrl || member.url;
  const hostPattern = new RegExp(
    host.replace(/^https?:\/\//, "").replace(/[.]/g, "\\.") + "/next/" + member.slug + "(?![a-z0-9-])",
    "i"
  );

  for (let attempt = 1; attempt <= 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      const res = await fetch(target, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
      });
      clearTimeout(timer);

      if (!res.ok) {
        if (attempt === 1 && res.status >= 500) { await sleep(3000); continue; }
        return { state: "unreachable", http: res.status, note: `HTTP ${res.status}` };
      }

      const html = await res.text();
      if (hostPattern.test(html)) return { state: "ok", http: res.status, note: "" };

      // Loaded, but no ring links. If the document is tiny it is probably a
      // JavaScript shell rather than a shop that removed the code.
      const thin = html.replace(/<script[\s\S]*?<\/script>/gi, "").length < 2000;
      return {
        state: "missing", http: res.status,
        note: thin ? "page renders client-side — needs a human look" : "ring links not found in the HTML",
        thin,
      };
    } catch (err) {
      clearTimeout(timer);
      if (attempt === 1) { await sleep(3000); continue; }
      const why = err.name === "AbortError" ? "timed out" : String(err.cause?.code || err.message).slice(0, 80);
      return { state: "unreachable", http: 0, note: why };
    }
  }
  return { state: "unreachable", http: 0, note: "unknown" };
}

/* ---------- run ---------- */

const data = JSON.parse(await readFile(MEMBERS, "utf8"));
const host = data.ring.host;

const health = existsSync(HEALTH)
  ? JSON.parse(await readFile(HEALTH, "utf8"))
  : { updated: null, sites: {} };

const queue = PREFLIGHT
  ? data.members.filter((m) => m.status === "pending" && m.tier === "ring")
  : data.members.filter((m) => m.tier === "ring" && (m.status === "active" || m.status === "warned") && !m.skipCrawl);

if (!queue.length) {
  console.log(PREFLIGHT ? "No pending shops to pre-check." : "Nothing to crawl.");
  process.exit(0);
}

const rows = [];
const flags = [];

for (const [i, m] of queue.entries()) {
  const r = await check(m, host);
  rows.push({ m, r });

  const prior = health.sites[m.slug] || { strikes: 0 };
  const strikes = r.state === "missing" ? (prior.strikes || 0) + 1 : 0;

  if (!PREFLIGHT) {
    health.sites[m.slug] = {
      lastChecked: today(),
      lastOk: r.state === "ok" ? today() : prior.lastOk || null,
      state: r.state,
      http: r.http,
      strikes,
      unreachableRuns: r.state === "unreachable" ? (prior.unreachableRuns || 0) + 1 : 0,
      note: r.note,
    };

    // Status transitions. Both are reversible: a shop that puts the code
    // back is set straight to active on its next passing crawl.
    if (r.state === "ok" && m.status === "warned") {
      m.status = "active";
      flags.push(`RECOVERED|${m.slug}|${m.name}|code is back, returned to the ring`);
    } else if (strikes >= SUSPEND_AT && m.status !== "suspended") {
      m.status = "suspended";
      flags.push(`SUSPENDED|${m.slug}|${m.name}|${strikes} days without the code — removed from the rotation`);
    } else if (strikes >= WARN_AT && m.status === "active") {
      m.status = "warned";
      flags.push(`WARNED|${m.slug}|${m.name}|${strikes} days without the code — time to email them`);
    } else if (r.state === "missing" && r.thin && strikes === 1) {
      flags.push(`REVIEW|${m.slug}|${m.name}|client-side page, crawler may be wrong — check by hand`);
    }

    // A shop that has been unreachable for a fortnight is worth a look too,
    // but it never gets suspended automatically on that basis alone.
    if (health.sites[m.slug].unreachableRuns === 14) {
      flags.push(`REVIEW|${m.slug}|${m.name}|unreachable for 14 days (${r.note})`);
    }
  }

  const mark = { ok: "ok", missing: "MISSING", unreachable: "unreachable" }[r.state];
  console.log(`${String(i + 1).padStart(3)}. ${m.slug.padEnd(24)} ${mark.padEnd(12)} ${r.note}`);
  if (i < queue.length - 1) await sleep(GAP);
}

/* ---------- report ---------- */

const line = ({ m, r }) => {
  const h = health.sites[m.slug] || {};
  const icon = r.state === "ok" ? "✅" : r.state === "missing" ? "⚠️" : "🌐";
  return `| ${icon} | [${m.name}](${m.url}) | \`${m.slug}\` | ${r.state} | ${h.strikes ?? 0} | ${r.note || "—"} |`;
};

const report = [
  `# Ring check — ${today()}`,
  "",
  `${rows.filter((x) => x.r.state === "ok").length} of ${rows.length} shops passed.`,
  "",
  "| | Shop | Slug | Result | Strikes | Note |",
  "|---|---|---|---|---|---|",
  ...rows.map(line),
  "",
  "🌐 means we couldn't read the page at all — that never counts as a strike.",
].join("\n");

console.log("\n" + report);

if (process.env.GITHUB_STEP_SUMMARY) {
  await writeFile(process.env.GITHUB_STEP_SUMMARY, report + "\n", { flag: "a" });
}

if (!DRY) {
  health.updated = new Date().toISOString();
  await writeFile(HEALTH, JSON.stringify(health, null, 2) + "\n", "utf8");
  await writeFile(REPORT, report + "\n", "utf8");
  await writeFile(FLAGS, flags.join("\n") + (flags.length ? "\n" : ""), "utf8");
  if (flags.length) await writeFile(MEMBERS, JSON.stringify(data, null, 2) + "\n", "utf8");
}

if (PREFLIGHT && rows.some((x) => x.r.state !== "ok")) {
  console.log("\nOne or more pending shops don't have the code up yet.");
}
