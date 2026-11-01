import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
test.use({ browserName: "webkit", reducedMotion: "reduce" });
const headers = { origin: "http://127.0.0.1:3100" };
const env = () => ({
  ...process.env,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://test:test-only@127.0.0.1:55434/visibility_test",
  ENCRYPTION_KEY: "12".repeat(32),
});
const worker = () =>
  promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/audit-worker.ts"], {
    env: env(),
  });
test("website audit compares bounded pages, creates an evidence-backed synthesis and exports on mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/reset-limits.ts"], {
    env: env(),
  });
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  if ((await page.request.get("/api/auth/status").then((r) => r.json())).setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible();
  const project = await page.request
    .post("/api/projects", {
      headers,
      data: {
        name: "Audit navigateur",
        domain: "audit.example",
        industry: "Logiciel de gestion",
        country: "FR",
        language: "fr",
        competitors: [{ name: "Comparaison fixture", domain: "other.example" }],
        queries: ["Quelle application de gestion choisir ?"],
      },
    })
    .then((r) => r.json());
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-key-never-production" },
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await page.getByRole("button", { name: "Audit de site", exact: true }).click();
  await page.getByLabel("Pages maximum par site", { exact: true }).selectOption("10");
  await page.getByRole("button", { name: "Explorer les sites", exact: true }).click();
  await expect(page.getByRole("button", { name: "Arrêter", exact: true })).toBeVisible();
  await worker();
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(page.getByRole("button", { name: "Arrêter", exact: true })).toHaveCount(0);
  await expect(page.locator(".audit-comparison")).toContainText("2 HTML analysées");
  await expect(page.locator(".audit-comparison")).toContainText("1 / 2");
  await page.getByRole("button", { name: "Estimer la synthèse", exact: true }).click();
  await expect(page.getByText(/Réserve de budget estimée/)).toBeVisible();
  await page.getByRole("button", { name: "Lancer la synthèse IA", exact: true }).click();
  await expect(page.getByText(/Synthèse en attente ou en cours/)).toBeVisible();
  await worker();
  await page.getByRole("button", { name: "Actualiser", exact: true }).click();
  await expect(
    page.getByText("TEST SYNTHÉTIQUE — comparaison des pages de test.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Vérifier la page 1", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Preuve de page", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").locator("blockquote")).toContainText(
    "Ces pages de test sont générées",
  );
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: "docs/screenshots/site-audit-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const download = page.waitForEvent("download");
  await page
    .locator(".site-audit-panel a")
    .filter({ hasText: /^JSON$/ })
    .click();
  const file = await download,
    data = JSON.parse(await readFile((await file.path())!, "utf8"));
  expect(data.pages).toHaveLength(8);
  expect(data.analyses[0].synthesis.findings).toHaveLength(1);
  expect(JSON.stringify(data)).not.toContain("synthetic-key-never-production");
  await page.getByRole("button", { name: "Explorer les sites", exact: true }).click();
  await page.getByRole("button", { name: "Arrêter", exact: true }).click();
  await expect(page.locator(".audit-comparison")).toContainText("Arrêté");
  expect(errors).toEqual([]);
});
