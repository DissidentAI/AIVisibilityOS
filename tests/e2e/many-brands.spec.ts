import { test, expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test.use({ browserName: "webkit", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
const headers = { origin: "http://127.0.0.1:3100" };
const env = () => ({
  ...process.env,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://test:test-only@127.0.0.1:55434/visibility_test",
  ENCRYPTION_KEY: "12".repeat(32),
});
async function navigate(page: Page, name: string) {
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
test("mobile: more than two onboarding rows persist, fifty competitors compare and ten sites can be selected", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Suggestions have their own end-to-end fixture; this scenario makes no inference request.
  await page.route("**/api/suggestions", (route) =>
    route.fulfill({ status: 400, json: { error: "credentials_required" } }),
  );
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  if ((await page.request.get("/api/auth/status").then((r) => r.json())).setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.locator(".main-shell")).toBeVisible();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await page.getByLabel("Nom de votre marque").fill("Large comparison fixture");
  await page.getByLabel("Domaine web", { exact: true }).fill("large.example");
  await page.getByLabel("Secteur d’activité").fill("Logiciel de gestion");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  for (let i = 0; i < 12; i++) {
    if (i >= 2)
      await page.getByRole("button", { name: "Ajouter un concurrent", exact: true }).click();
    await page
      .getByLabel("Nom", { exact: true })
      .nth(i)
      .fill(`Concurrent ${i + 1}`);
    await page
      .getByLabel("Domaine", { exact: true })
      .nth(i)
      .fill(`brand${i + 1}.example`);
  }
  await page.getByRole("button", { name: "Retirer le concurrent 3", exact: true }).click();
  await expect(page.getByLabel("Nom", { exact: true }).nth(2)).toHaveValue("Concurrent 4");
  await page.reload();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByLabel("Nom", { exact: true })).toHaveCount(11);
  await expect(page.getByLabel("Nom", { exact: true }).nth(10)).toHaveValue("Concurrent 12");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page
    .getByLabel("Questions à surveiller", { exact: true })
    .fill("Quelle solution de gestion comparer ?");
  await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Créer un projet", exact: true })).toHaveCount(0);
  let state = await page.request.get("/api/state").then((r) => r.json());
  let project = state.projects.find((p: { name: string }) => p.name === "Large comparison fixture");
  expect(project.brands).toHaveLength(12);
  const competitors = Array.from({ length: 50 }, (_, i) => ({
    name: `Concurrent ${i + 1}`,
    domain: `brand${i + 1}.example`,
  }));
  const update = await page.request.post(`/api/projects/${project.id}`, {
    headers,
    data: {
      ...project,
      competitors,
      competitorIds: competitors.map(
        (c) => project.brands.find((b: { name: string }) => b.name === c.name)?.id ?? null,
      ),
      queries: project.queries.map((q: { text: string }) => q.text),
      scanSettings: {
        providers: ["openai"],
        mode: "baseline",
        samples: 1,
        openrouterModel: "openai/gpt-4.1-mini",
      },
    },
  });
  expect(update.ok()).toBe(true);
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-key-test-only" },
  });
  const run = await page.request.post("/api/runs", {
    headers,
    data: { projectId: project.id, providers: ["openai"], samples: 1 },
  });
  expect(run.ok()).toBe(true);
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/fixture-worker.ts"], {
    env: env(),
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await navigate(page, "Concurrents");
  await expect(page.locator(".brand-line")).toHaveCount(51);
  await expect(page.getByRole("button", { name: "Ajouter", exact: true })).toBeDisabled();
  await expect(page.locator(".comparison-row")).toHaveCount(51);
  await page.getByLabel("Rechercher une marque dans la comparaison").fill("Concurrent 50");
  await expect(page.locator(".comparison-row")).toHaveCount(1);
  await expect(page.locator(".comparison-row")).toContainText("0 / 1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Modifier le projet et le scan", exact: true }).click();
  await expect(page.getByLabel("Nom 50", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Ajouter un concurrent", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await navigate(page, "Audit de site");
  const selections = page.locator(".audit-targets input[type=checkbox]");
  await expect(selections).toHaveCount(50);
  for (let i = 3; i < 10; i++) await selections.nth(i).check();
  await expect(selections.nth(10)).toBeDisabled();
  await expect(page.getByText(/550 pages maximum/)).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
