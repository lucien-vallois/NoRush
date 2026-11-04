#!/usr/bin/env node
/**
 * Captures the screenshots used in README.md and docs/user-guide.md.
 *
 * Run it against a demo with recent data, so levels, trends and alerts are on screen:
 *
 *   npm run infra:up && npm run seed
 *   DAYS=2 npm run backfill --workspace=backend   # optional: 48 h of history for the charts
 *   npm run demo                                  # terminal 1
 *   npm run simulate                              # terminal 2, let it run ~2 minutes
 *   npm run screenshots                           # terminal 3
 *
 * The console is captured in English with imperial units. Nothing is saved:
 * the tank form is filled to show the strapping table and then closed.
 *
 * Env: CONSOLE_URL (http://localhost:3001), API_URL (http://localhost:3000),
 *      SCREENSHOT_DIR (docs/screenshots), DEMO_OPERATOR_EMAIL/PASSWORD, DEMO_ADMIN_EMAIL/PASSWORD.
 * Uses the Puppeteer copy installed with the backend (PDF reports).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";

const CONSOLE = (process.env.CONSOLE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const API = (process.env.API_URL ?? process.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT = path.resolve(process.env.SCREENSHOT_DIR ?? "docs/screenshots");
const OPERATOR = {
  email: process.env.DEMO_OPERATOR_EMAIL ?? "operador@flowback.com",
  password: process.env.DEMO_OPERATOR_PASSWORD ?? "operador123",
};
const ADMIN = {
  email: process.env.DEMO_ADMIN_EMAIL ?? "admin@flowback.com",
  password: process.env.DEMO_ADMIN_PASSWORD ?? "admin123",
};

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/** A gauge chart as it is pasted from the tank's paperwork: 20 ft × 12 ft tank. */
const STRAPPING = [`0'0" 0`, `5'0" 100.7`, `10'0" 201.4`, `15'0" 302.2`, `20'0" 402.9`].join("\n");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const saved = [];

async function login({ email, password }) {
  const response = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept-Language": "en" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Login as ${email} failed (${response.status}). Is the API up and the demo seed loaded?`);
  }
  return response.json();
}

/** Language, units, theme and session live in localStorage; set them before the app boots. */
async function prepare(page, { auth, theme = "light" }) {
  await page.goto(`${CONSOLE}/login`, { waitUntil: "domcontentloaded" });
  await page.evaluate(
    ({ auth, theme }) => {
      localStorage.clear();
      localStorage.setItem("norush.language", "en");
      localStorage.setItem("norush.units", "imperial");
      localStorage.setItem("theme", theme);
      if (auth) {
        localStorage.setItem("auth_token", auth.accessToken);
        localStorage.setItem("refresh_token", auth.refreshToken);
        localStorage.setItem("user", JSON.stringify(auth.user));
      }
    },
    { auth, theme },
  );
}

async function open(page, route, { waitFor } = {}) {
  await page.goto(`${CONSOLE}${route}`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.waitForSelector("h1", { timeout: 30_000 });
  if (waitFor) await page.waitForSelector(waitFor, { timeout: 20_000 }).catch(() => {});
  await sleep(2500); // chart animations and the first live update
}

async function shot(target, name, options = {}) {
  const file = path.join(OUT, name);
  await target.screenshot({ path: file, ...options });
  saved.push(path.relative(process.cwd(), file));
}

async function clickButton(page, label) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") ?? b.textContent ?? "").trim().startsWith(label),
    );
    button?.click();
    return Boolean(button);
  }, label);
  if (!clicked) throw new Error(`Button "${label}" not found`);
}

async function type(page, selector, value) {
  await page.click(selector, { clickCount: 3 });
  await page.type(selector, value);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const [operator, admin] = [await login(OPERATOR), await login(ADMIN)];
  const browser = await puppeteer.launch({ headless: "new", defaultViewport: DESKTOP });
  try {
    const page = await browser.newPage();

    // Sign-in screen
    await prepare(page, { auth: null });
    await page.goto(`${CONSOLE}/login`, { waitUntil: "networkidle2" });
    await sleep(1000);
    await shot(page, "login-desktop.png");

    // Operator views
    await prepare(page, { auth: operator });
    await open(page, "/dashboard", { waitFor: ".recharts-surface" });
    await shot(page, "dashboard-desktop.png");

    await open(page, "/tanks", { waitFor: ".leaflet-tile-loaded" });
    await shot(page, "tanks-desktop.png");
    await clickButton(page, "View details for tank FK-05");
    await page.waitForSelector("dialog[open]");
    await sleep(2000);
    await shot(page, "tank-detail.png");
    await page.keyboard.press("Escape");

    await open(page, "/sensors");
    await shot(page, "sensors-desktop.png");

    await open(page, "/readings", { waitFor: ".recharts-surface" });
    await page.select('select[aria-label="History period"]', "7d");
    await page.select('select[aria-label="History granularity"]', "1h");
    await sleep(3000);
    await shot(page, "readings-desktop.png");

    await open(page, "/alerts", { waitFor: "table" });
    await shot(page, "alerts-desktop.png");

    // Gauge report for the last completed gauge day (needs history: see the backfill above)
    await open(page, "/gauge-report", { waitFor: "table" });
    await shot(page, "gauge-report.png", { fullPage: true });

    // Tank setup (admin), filled but not saved
    await prepare(page, { auth: admin });
    await page.setViewport({ ...DESKTOP, height: 1400 });
    await open(page, "/tanks");
    await clickButton(page, "New tank");
    await page.waitForSelector("#tank-code");
    await type(page, "#tank-code", "OIL-07");
    await type(page, "#tank-name", "Oil Tank 07");
    await type(page, "#tank-height", "20");
    await type(page, "#tank-diameter", "12");
    await clickButton(page, "Suggest from height");
    await type(page, "#tank-strapping", STRAPPING);
    await type(page, "#tank-latitude", "47.9798");
    await type(page, "#tank-longitude", "-103.4214");
    await sleep(800);
    const form = await page.$('dialog[aria-labelledby="tank-form-title"]');
    await shot(form, "tank-form.png");
    await clickButton(page, "Close tank form");
    await page.setViewport(DESKTOP);

    // Dark theme
    await prepare(page, { auth: operator, theme: "dark" });
    await open(page, "/dashboard", { waitFor: ".recharts-surface" });
    await shot(page, "dashboard-dark.png");

    // Phone
    await prepare(page, { auth: operator });
    await page.setViewport(PHONE);
    await open(page, "/dashboard");
    await shot(page, "dashboard-mobile.png");
  } finally {
    await browser.close();
  }
  console.log(`Saved ${saved.length} screenshots:\n  ${saved.join("\n  ")}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
