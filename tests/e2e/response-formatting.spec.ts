import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { markdownFixture } from "../fixtures/markdown";

test.use({ browserName: "webkit", reducedMotion: "reduce" });
const headers = { origin: "http://127.0.0.1:3100" };
const fixtureEnv = () => ({
  ...process.env,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://test:test-only@127.0.0.1:55434/visibility_test",
  ENCRYPTION_KEY: "12".repeat(32),
});
async function login(page: Page) {
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/reset-limits.ts"], {
    env: fixtureEnv(),
  });
  await page.goto("/");
  await expect(page.locator(".auth-brand .brand-mark img")).toBeVisible();
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  const status = await page.request.get("/api/auth/status").then((r) => r.json());
  if (status.setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible();
}
async function navigate(page: Page, name: string) {
  // After reload the authenticated shell mounts asynchronously. Checking the
  // absent Menu immediately mistakes a still-loading phone layout for desktop.
  await expect(page.locator(".main-shell")).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}

test("formatted response, exact Markdown export, copy feedback and safe manual fallback on mobile Safari", async ({
  page,
}) => {
  const errors: string[] = [],
    requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().includes("tracking-image")) requests.push(request.url());
  });
  // Clipboard permission is browser/OS dependent. Exercise success and denial deterministically.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          (window as unknown as { copied: string }).copied = text;
        },
      },
    });
  });
  await login(page);
  const p = await page.request
    .post("/api/projects", {
      headers,
      data: {
        name: "Lecture synthétique",
        domain: "reading.example",
        industry: "Mobilité",
        country: "FR",
        language: "fr",
        competitors: [{ name: "Concurrent Test", domain: "competitor.example" }],
        queries: ["[MARKDOWN_FIXTURE] Quel service choisir ?"],
      },
    })
    .then((r) => r.json());
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-markdown-provider-key" },
  });
  const run = await page.request
    .post("/api/runs", {
      headers,
      data: { projectId: p.id, providers: ["openai"], samples: 1, mode: "web" },
    })
    .then((r) => r.json());
  expect(run.id).toBeTruthy();
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/fixture-worker.ts"], {
    env: fixtureEnv(),
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(p.id);
  await navigate(page, "Historique & exports");
  await page.getByRole("button", { name: "Ouvrir", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Preuve de mesure" });
  await expect(dialog.getByRole("heading", { name: "Comparatif synthétique" })).toBeVisible();
  await expect(dialog.locator(".answer-markdown strong")).toHaveText("Karburo");
  await expect(dialog.locator(".answer-table table")).toBeVisible();
  await expect(dialog.locator(".citation-marker")).toHaveCount(1);
  expect(
    await dialog
      .locator(
        ".answer-markdown a[href^='javascript:'], .answer-markdown img, .answer-markdown script",
      )
      .count(),
  ).toBe(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { unsafeMarkdownExecuted?: boolean }).unsafeMarkdownExecuted,
    ),
  ).toBeUndefined();
  expect(requests).toEqual([]);
  await dialog.getByRole("button", { name: "Copier le texte", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Réponse copiée.");
  const copied = await page.evaluate(() => (window as unknown as { copied: string }).copied);
  expect(copied).toContain("Comparatif synthétique");
  expect(copied).not.toContain("**Karburo**");
  expect(copied).not.toContain("Copier le texte");
  const txtEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter .txt", exact: true }).click();
  const txt = await txtEvent;
  expect(await readFile((await txt.path())!, "utf8")).toBe(copied);
  await dialog.getByRole("button", { name: "Source Markdown", exact: true }).click();
  await dialog.getByRole("button", { name: "Copier le Markdown", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { copied: string }).copied))
    .toBe(markdownFixture);
  const mdEvent = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Exporter .md", exact: true }).click();
  const md = await mdEvent;
  expect(md.suggestedFilename()).toMatch(/^ai-visibility-openai-.*\.md$/);
  expect(await readFile((await md.path())!, "utf8")).toBe(markdownFixture);
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole("button", { name: "Lecture", exact: true }).click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await dialog.getByRole("button", { name: "Copier le texte", exact: true }).click();
  await expect(dialog.getByLabel("Texte à copier")).toBeVisible();
  await expect(dialog.getByLabel("Texte à copier")).toHaveValue(copied);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await dialog.getByRole("button", { name: "Lecture", exact: true }).click();
  await page.screenshot({ path: "docs/screenshots/response-markdown-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("scan limits persist, show effective headroom and remain usable on mobile", async ({
  page,
}) => {
  await login(page);
  await navigate(page, "Paramètres");
  const settings = page.locator(".execution-settings");
  const mimo = settings
    .locator("details")
    .filter({ has: page.getByText("Xiaomi MiMo", { exact: true }) })
    .first();
  await mimo.locator("summary").click();
  await mimo.getByLabel("Requêtes / minute", { exact: true }).fill("80");
  await mimo.getByLabel("Tokens / minute", { exact: true }).fill("500000");
  await mimo.getByLabel("Appels simultanés max.", { exact: true }).fill("6");
  await mimo.getByRole("button", { name: "Enregistrer les plafonds" }).click();
  await expect(mimo.getByRole("status")).toHaveText("Plafonds enregistrés.");
  await expect(mimo.getByText(/68 RPM/)).toBeVisible();
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "Paramètres");
  await mimo.locator("summary").click();
  await expect(mimo.getByLabel("Requêtes / minute", { exact: true })).toHaveValue("80");
  await expect(mimo.getByLabel("Appels simultanés max.", { exact: true })).toHaveValue("6");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
