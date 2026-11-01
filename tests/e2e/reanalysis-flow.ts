import { expect, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const headers = { origin: "http://127.0.0.1:3100" };
const env = () => ({
  ...process.env,
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://test:test-only@127.0.0.1:55434/visibility_test",
  ENCRYPTION_KEY: "12".repeat(32),
});
async function navigate(page: Page, name: string) {
  // A reload may still be showing the loading screen; visibility checks do not auto-wait.
  await expect(page.locator(".main-shell")).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
export async function reanalysisFlow(page: Page, browser: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await expect(page.locator(".main-shell")).toBeVisible();
  const project = await page.request
    .post("/api/projects", {
      headers,
      data: {
        name: `Karburo fixture ${browser}`,
        domain: "karburo.example",
        industry: "Mobilité",
        country: "FR",
        language: "fr",
        competitors: [{ name: "Ancien concurrent", domain: "ancien.example" }],
        queries: ["Quelle application comparer ?"],
      },
    })
    .then((r) => r.json());
  expect(project.id).toBeTruthy();
  const credential = await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-provider-key-not-production" },
  });
  expect(credential.status()).toBe(200);
  const run = await page.request
    .post("/api/runs", {
      headers,
      data: { projectId: project.id, providers: ["openai"], samples: 1 },
    })
    .then((r) => r.json());
  expect(run.id).toBeTruthy();
  await promisify(execFile)(process.execPath, ["--import", "tsx", "tests/e2e/fixture-worker.ts"], {
    env: env(),
  });
  const before = await page.request.get(`/api/runs/${run.id}`).then((r) => r.json());
  const state = await page.request.get("/api/state").then((r) => r.json());
  for (const c of state.credentials)
    await page.request.delete(`/api/credentials/${c.provider}`, { headers });
  if (browser === "chromium")
    await page.request.post("/api/credentials", {
      headers,
      data: { provider: "openai", key: "synthetic-provider-key-not-production" },
    });
  const inferenceRequests: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && /\/api\/(runs|suggestions)(\/|$)/.test(r.url()))
      inferenceRequests.push(r.url());
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await navigate(page, "Concurrents");
  await expect(page.getByLabel("Marques à comparer", { exact: true })).toHaveValue("current");
  await expect(page.locator(".comparison-row")).toHaveCount(2);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Ajouter un concurrent", exact: true });
  // Deliberately outlast the 700 ms suggestion debounce to prove no automatic paid work is queued.
  await page.waitForTimeout(950);
  await dialog.getByLabel("Nom de la marque", { exact: true }).fill("Concurrent Test");
  await dialog.getByLabel("Domaine", { exact: true }).fill("concurrent.example");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".comparison-row")).toHaveCount(3);
  await expect(
    page.locator(".comparison-row").filter({ hasText: "Concurrent Test" }),
  ).toContainText("1 / 1");
  await expect(page.getByText("0 appel IA supplémentaire", { exact: true })).toBeVisible();
  expect(await page.locator('a[href*="/export"]').getAttribute("href")).toContain(
    "brandScope=current",
  );
  const csv = await page.request.get(`/api/runs/${run.id}/export?brandScope=current`);
  expect(await csv.text()).toContain("Concurrent Test");
  await page.getByLabel("Marques à comparer", { exact: true }).selectOption("original");
  await expect(page.locator(".comparison-row")).toHaveCount(2);
  await page.reload();
  await navigate(page, "Concurrents");
  await expect(page.getByLabel("Marques à comparer", { exact: true })).toHaveValue("original");
  await expect(page.locator(".comparison-row")).toHaveCount(2);
  await page.getByLabel("Marques à comparer", { exact: true }).selectOption("current");
  await expect(page.locator(".comparison-row")).toHaveCount(3);
  await navigate(page, "Historique & exports");
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator("blockquote").filter({ hasText: "Concurrent Test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await navigate(page, "Rapports clients");
  await page.getByRole("button", { name: "Créer le rapport PDF", exact: true }).click();
  await expect(
    page.getByText("Rapport enregistré. Téléchargez-le ci-dessous.", { exact: true }),
  ).toBeVisible();
  const reports = await page.request
    .get(`/api/reports?project=${project.id}`)
    .then((r) => r.json());
  const payload = await page.request
    .get(`/api/reports/${reports[0].id}/data`)
    .then((r) => r.json());
  expect(payload.current.brandAnalysis.scope).toBe("current");
  expect(payload.current.brandAnalysis.brands).toHaveLength(3);
  expect(payload.current.run.snapshot.brands).toHaveLength(2);
  expect(payload.current.responses).toEqual(before.responses);
  const pdf = await page.request.get(`/api/reports/${reports[0].id}/pdf`);
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  const after = await page.request.get(`/api/runs/${run.id}`).then((r) => r.json());
  expect(after).toEqual(before);
  const nextState = await page.request.get("/api/state").then((r) => r.json());
  expect(nextState.usage).toEqual(state.usage);
  expect(inferenceRequests).toEqual([]);
  expect(
    await page.request.get(`/api/runs?project=${project.id}`).then((r) => r.json()),
  ).toHaveLength(1);
  await navigate(page, "Concurrents");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `.local/reanalysis-${browser}.png`, fullPage: true });
  expect(errors).toEqual([]);
}
