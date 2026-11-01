import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test.use({ browserName: "webkit" });

const headers = { origin: "http://127.0.0.1:3100" };
async function fixtureWorker(fail = false) {
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/fixture-worker.ts"], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://test:test-only@127.0.0.1:55434/visibility_test",
      ENCRYPTION_KEY: "12".repeat(32),
      E2E_FAILURES: fail ? "1" : "0",
    },
  });
}
async function setup(page: Page) {
  // Existing scenarios deliberately exercise login repeatedly; keep this scenario isolated.
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/reset-limits.ts"], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://test:test-only@127.0.0.1:55434/visibility_test",
    },
  });
  await page.route("**/api/credentials/check", (route) => route.fulfill({ json: { valid: true } }));
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  const { setupRequired } = await page.request.get("/api/auth/status").then((r) => r.json());
  if (setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible();
  const p = await page.request
    .post("/api/projects", {
      headers,
      data: {
        name: `Reprise ${Date.now()}`,
        domain: "retry.example",
        industry: "Mobilité",
        country: "FR",
        language: "fr",
        competitors: [{ name: "Concurrent Test", domain: "competitor.example" }],
        queries: [
          "[RETRY_FIXTURE] Quelle application comparer ?",
          "[RETRY_FIXTURE] Quel service de mobilité ?",
          "Quelle solution de carburant est disponible ?",
        ],
      },
    })
    .then((r) => r.json());
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-provider-key-not-production" },
  });
  const r = await page.request
    .post("/api/runs", { headers, data: { projectId: p.id, providers: ["openai"], samples: 1 } })
    .then((r) => r.json());
  expect(r.id).toBeTruthy();
  await fixtureWorker(true);
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(p.id);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Historique & exports", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Journal des réponses", exact: true }),
  ).toBeVisible();
  return { projectId: p.id, sourceId: r.id };
}
test.describe("retry workflow on desktop", () => {
  test.use({ reducedMotion: "reduce" });
  test("filtered single and bulk retries preserve the original campaign and reveal evidence", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { projectId, sourceId } = await setup(page);
    await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toHaveCount(2);
    await page.getByLabel("Statut", { exact: true }).selectOption("failed");
    await page.getByLabel("Rechercher dans les réponses", { exact: true }).fill("application");
    await expect(page.getByText("1 / 3 réponses affichées", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Réessayer", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Réessayer les échecs", exact: true });
    await expect(dialog.getByText(/1 appel à réessayer/)).toBeVisible();
    await expect(dialog.getByText(/peuvent déjà avoir été facturées/)).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmer la reprise", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByLabel("Campagne sélectionnée", { exact: true })).toHaveValue(sourceId);
    await expect(page.getByText("TENTATIVE DE REPRISE", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Reprises ciblées", exact: true }),
    ).toBeVisible();
    // Existing filters and successful answers must survive a retry launch.
    await expect(page.getByText("1 / 3 réponses affichées", { exact: true })).toBeVisible();
    await page.getByLabel("Rechercher dans les réponses", { exact: true }).fill("");
    await page.getByLabel("Statut", { exact: true }).selectOption("all");
    await expect(page.getByText("3 / 3 réponses affichées", { exact: true })).toBeVisible();
    const successfulRow = page
      .locator(".history-panel tbody tr")
      .filter({ hasText: "Quelle solution de carburant est disponible ?" });
    await successfulRow.getByRole("button", { name: "Ouvrir", exact: true }).click();
    await expect(page.locator(".answer")).toContainText("TEST SYNTHÉTIQUE");
    await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
    let runs = await page.request.get(`/api/runs?project=${projectId}`).then((r) => r.json());
    expect(runs).toHaveLength(2);
    expect(runs[0].total).toBe(1);
    expect(runs[1].failed).toBe(2);
    await fixtureWorker();
    await page.reload();
    await page.getByRole("button", { name: "Historique & exports", exact: true }).click();
    await expect(page.getByLabel("Campagne sélectionnée", { exact: true })).toHaveValue(sourceId);
    await expect(page.getByText("3 / 3 réponses affichées", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Reprises ciblées", { exact: true })).toContainText(
      "1/1 réponses valides",
    );
    await expect(page.getByRole("button", { name: "Voir la reprise", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Réessayer l’échec affiché", exact: true }).click();
    await page.getByRole("button", { name: "Confirmer la reprise", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Réessayer les échecs", exact: true }),
    ).toHaveCount(0);
    await fixtureWorker();
    await page.reload();
    await page.getByRole("button", { name: "Historique & exports", exact: true }).click();
    await expect(page.getByLabel("Campagne sélectionnée", { exact: true })).toHaveValue(sourceId);
    await expect(page.getByText("3 / 3 réponses affichées", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Voir la reprise", exact: true })).toHaveCount(2);
    // A subset is displayed only after explicitly asking to inspect a retry.
    await page.getByRole("button", { name: "Consulter la reprise", exact: true }).first().click();
    await expect(page.getByText("TENTATIVE DE REPRISE", { exact: true })).toBeVisible();
    await expect(page.getByText("1 / 1 réponses affichées", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Campagne d’origine", exact: true }).click();
    await expect(page.getByText("3 / 3 réponses affichées", { exact: true })).toBeVisible();
    const original = await page.request.get(`/api/runs/${sourceId}`).then((r) => r.json());
    expect(original.run.failed).toBe(2);
    expect(original.run.valid).toBe(1);
    runs = await page.request.get(`/api/runs?project=${projectId}`).then((r) => r.json());
    expect(runs).toHaveLength(3);
    await page.getByRole("button", { name: "Ouvrir", exact: true }).first().click();
    await expect(
      page.getByRole("heading", { name: "Preuve de mesure", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
    await page.getByRole("button", { name: "Opportunités GEO", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Les questions à approfondir.", exact: true }),
    ).toBeVisible();
    await page.locator(".opportunity-evidence summary").first().click();
    await page.locator(".opportunity-evidence button").first().click();
    await expect(
      page.getByRole("heading", { name: "Preuve de mesure", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".answer")).toContainText("TEST SYNTHÉTIQUE");
    expect(errors).toEqual([]);
  });
});
test.describe("retry workflow on mobile Safari", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  test("canceling a retry during credential verification never creates a campaign", async ({
    page,
  }) => {
    const { projectId } = await setup(page);
    await expect(page.getByRole("button", { name: "Réessayer", exact: true })).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: "docs/screenshots/history-retries-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    let reached!: () => void;
    const checkStarted = new Promise<void>((r) => {
      reached = r;
    });
    let release!: () => void;
    const checkRelease = new Promise<void>((r) => {
      release = r;
    });
    await page.route("**/api/credentials/check", async (route) => {
      reached();
      await checkRelease;
      await route.fulfill({ json: { valid: true } });
    });
    await page.getByRole("button", { name: "Réessayer", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Réessayer les échecs", exact: true });
    await dialog.getByRole("button", { name: "Confirmer la reprise", exact: true }).click();
    await checkStarted;
    await dialog.getByRole("button", { name: "Close / Fermer", exact: true }).click();
    release();
    await expect(dialog).toHaveCount(0);
    await page.reload();
    const runs = await page.request.get(`/api/runs?project=${projectId}`).then((r) => r.json());
    expect(runs).toHaveLength(1);
    // The explicit cancellation leaves no browser-side retry queue.
    await page.getByRole("button", { name: "Changer de thème", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
});
