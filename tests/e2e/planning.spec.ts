import { test, expect, type Page } from "@playwright/test";
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
const worker = (name: string) =>
  promisify(execFile)(process.execPath, ["--import", "tsx", `tests/e2e/${name}.ts`], {
    env: env(),
  });
async function navigate(page: Page, name: string) {
  await expect(page.locator(".main-shell")).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
test("bulk and AI questions, contextual competitors, saved editable settings and three report/interface languages", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await worker("reset-limits");
  await page.route("**/api/credentials/check", (r) => r.fulfill({ json: { valid: true } }));
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
        name: "Studio Comptable Test",
        domain: "studio.example",
        industry: "Logiciel de comptabilité",
        description: "Cabinets comptables pour petites entreprises",
        language: "fr",
        country: "FR",
        competitors: [],
        queries: ["Quels logiciels comptables comparer pour une PME ?"],
      },
    })
    .then((r) => r.json());
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "test-only-synthetic-key" },
  });
  const run = await page.request
    .post("/api/runs", {
      headers,
      data: { projectId: project.id, providers: ["openai"], samples: 1 },
    })
    .then((r) => r.json());
  await worker("fixture-worker");
  const original = await page.request.get(`/api/runs/${run.id}`).then((r) => r.json());
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await navigate(page, "Requêtes suivies");
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  let dialog = page.getByRole("dialog", { name: "Ajouter des questions", exact: true });
  await dialog
    .getByLabel("Questions à ajouter, une par ligne", { exact: true })
    .fill(
      "Quels outils de facturation choisir ?\nQuels outils de facturation choisir ?\nComment comparer les outils comptables ?",
    );
  await dialog.getByRole("button", { name: "Ajouter les questions", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(
    (await page.request.get("/api/state").then((r) => r.json())).projects.find(
      (p: { id: string }) => p.id === project.id,
    ).queries,
  ).toHaveLength(3);
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Ajouter des questions", exact: true });
  const generation = page.waitForResponse(
    (r) => r.url().endsWith("/api/suggestions") && r.request().method() === "POST",
  );
  await dialog.getByRole("button", { name: "Générer avec l’IA", exact: true }).click();
  expect((await generation).status()).toBe(202);
  await worker("suggestion-worker");
  await expect(dialog.locator(".suggestion-item")).toHaveCount(10);
  await expect(dialog.locator(".suggestion-item").first()).toContainText(
    "Logiciel de comptabilité",
  );
  await dialog.locator(".suggestion-item").first().click();
  await dialog.getByRole("button", { name: "Ajouter les questions", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await navigate(page, "Concurrents");
  const auto = page.waitForResponse(
    (r) => r.url().endsWith("/api/suggestions") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Ajouter", exact: true }).click();
  expect((await auto).status()).toBe(202);
  await worker("suggestion-worker");
  dialog = page.getByRole("dialog", { name: "Ajouter un concurrent", exact: true });
  await expect(dialog.locator(".suggestion-item")).toHaveCount(2);
  await dialog.getByLabel("Nom de la marque", { exact: true }).fill("Concurrent IA");
  await expect(dialog.locator(".suggestion-item")).toHaveCount(1);
  await dialog.locator(".suggestion-item").click();
  await expect(dialog.getByLabel("Domaine", { exact: true })).toHaveValue("suggested.example");
  await dialog.getByRole("button", { name: "Ajouter", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Modifier le projet et le scan", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Modifier le projet et le scan", exact: true });
  await dialog.getByLabel("Nom de votre marque", { exact: true }).fill("Studio Comptable Modifié");
  await dialog
    .getByLabel("Description de l’activité et des clients", { exact: true })
    .fill("Description modifiée et sauvegardée pour les suggestions.");
  await dialog
    .getByLabel("Échantillons par requête et fournisseur", { exact: true })
    .selectOption("3");
  await dialog.getByRole("button", { name: "Enregistrer les modifications", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Lancer une mesure", exact: true }).click();
  dialog = page.getByRole("dialog", { name: "Nouvelle campagne de mesure", exact: true });
  await expect(
    dialog.getByLabel("Échantillons par requête et fournisseur", { exact: true }),
  ).toHaveValue("3");
  await dialog.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  expect(
    (await page.request.get(`/api/runs/${run.id}`).then((r) => r.json())).run.snapshot,
  ).toEqual(original.run.snapshot);
  await page.getByLabel("Langue de l’interface", { exact: true }).selectOption("zh-CN");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.reload();
  await expect(page.getByRole("heading", { name: "概览", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, "客户报告");
  await page.getByLabel("报告语言", { exact: true }).selectOption("en");
  await page.getByRole("button", { name: "创建 PDF 报告", exact: true }).click();
  await expect(page.getByText("报告已保存，可在下方下载。", { exact: true })).toBeVisible();
  const bundle = await page.request.get(`/api/reports?project=${project.id}`).then((r) => r.json());
  const report = await page.request.get(`/api/reports/${bundle[0].id}/data`).then((r) => r.json());
  expect(report.payload?.locale ?? report.locale).toBe("en");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "PDF", exact: true }).first().click();
  const file = await download;
  expect((await readFile((await file.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  await page.screenshot({
    path: "docs/screenshots/reports-chinese-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await expect(page.getByRole("heading", { name: "Client reports", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
