import { expect, type Page, type TestInfo } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AxeBuilder from "@axe-core/playwright";
const headers = { origin: "http://127.0.0.1:3100" };
const worker = (name: string, args: string[] = []) =>
  promisify(execFile)(process.execPath, ["--import", "tsx", `tests/e2e/${name}.ts`, ...args], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://test:test-only@127.0.0.1:55434/visibility_test",
      ENCRYPTION_KEY: "12".repeat(32),
    },
  });
async function navigate(page: Page, name: string) {
  await expect(page.locator(".main-shell")).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function layout(page: Page) {
  const problems = await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push("page overflow");
    for (const element of document.querySelectorAll<HTMLElement>("button,input,select,textarea")) {
      if (
        !element.getClientRects().length ||
        getComputedStyle(element).visibility === "hidden" ||
        element.closest("[inert]")
      )
        continue;
      if (document.querySelector("dialog[open]") && !element.closest("dialog[open]")) continue;
      const box = element.getBoundingClientRect();
      if (
        (box.left < -1 || box.right > innerWidth + 1) &&
        !element.closest(".table-wrap,.answer-table")
      )
        issues.push("control outside viewport: " + element.textContent?.slice(0, 40));
      if (innerWidth <= 640 && element.tagName === "BUTTON" && box.height < 43.5)
        issues.push("short button: " + element.textContent);
    }
    return issues;
  });
  expect(problems).toEqual([]);
}
export async function workflowsFlow(page: Page, info: TestInfo, engine: "chromium" | "webkit") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await worker("reset-limits");
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  const setup = await page.request.get("/api/auth/status").then((r) => r.json());
  if (setup.setupRequired)
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
  await page
    .getByRole("button", {
      name: setup.setupRequired ? "Créer mon espace" : "Se connecter",
      exact: true,
    })
    .click();
  await expect(page.locator(".main-shell")).toBeVisible();
  const existing = await page.request.get("/api/state").then((r) => r.json());
  for (const p of existing.projects)
    if (p.name.startsWith("Workflow fixture"))
      await page.request.delete(`/api/projects/${p.id}`, { headers });
  const response = await page.request.post("/api/projects", {
    headers,
    data: {
      name: `Workflow fixture ${engine}`,
      domain: "workflow.example",
      industry: "Logiciels CRM",
      description: "Solutions CRM pour petites agences",
      language: "fr",
      country: "FR",
      competitors: [{ name: "Concurrent Test", domain: "concurrent.example" }],
      queries: ["Quel CRM choisir pour une agence ?", "Comment comparer les logiciels CRM ?"],
    },
  });
  expect(response.status()).toBe(201);
  const project = await response.json();
  await page.request.post("/api/credentials", {
    headers,
    data: { provider: "openai", key: "synthetic-test-key-not-production" },
  });
  const baseline = await page.request
    .post("/api/runs", {
      headers,
      data: { projectId: project.id, providers: ["openai"], samples: 1, mode: "baseline" },
    })
    .then((r) => r.json());
  expect(baseline.id).toBeTruthy();
  await worker("fixture-worker");
  const web = await page.request
    .post("/api/runs", {
      headers,
      data: { projectId: project.id, providers: ["openai"], samples: 1, mode: "web" },
    })
    .then((r) => r.json());
  expect(web.id).toBeTruthy();
  await worker("fixture-worker");
  const original = await page.request.get(`/api/runs/${web.id}`).then((r) => r.json());
  const inference: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(runs|suggestions|audits)(\/|$)/.test(request.url()))
      inference.push(request.url());
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await navigate(page, "Concurrents");
  const rival = page.locator(".comparison-row").filter({ hasText: "Concurrent Test" });
  await expect(rival).toContainText("2 / 2");
  await rival.getByRole("button", { name: "Concurrent Test", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Historique & exports", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".response-table tbody tr")).toHaveCount(2);
  expect(page.url()).toContain("#evidence?");
  await page.getByRole("button", { name: "Ouvrir", exact: true }).first().click();
  const permalink = page.url();
  expect(permalink).toContain("response=");
  await expect(page.getByRole("dialog", { name: "Preuve de mesure", exact: true })).toContainText(
    "TEST SYNTHÉTIQUE",
  );
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Preuve de mesure", exact: true })).toContainText(
    "TEST SYNTHÉTIQUE",
  );
  expect(page.url()).toBe(permalink);
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByLabel("Question exacte", { exact: true })
    .selectOption(original.run.snapshot.queries[0].id);
  await expect(page.locator(".response-table tbody tr")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".response-table tbody tr")).toHaveCount(1);
  await navigate(page, "Requêtes suivies");
  await page.getByLabel("Sélectionner les questions affichées", { exact: true }).check();
  await page.getByRole("button", { name: "Organiser la sélection", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Modifier le thème", { exact: true }).check();
  await dialog.getByLabel("Thème à appliquer", { exact: true }).fill("Découverte CRM");
  await dialog.getByLabel("Modifier l’intention", { exact: true }).check();
  await dialog.getByLabel("Intention à appliquer", { exact: true }).selectOption("comparison");
  await dialog.getByLabel("Modifier la priorité", { exact: true }).check();
  await dialog.getByLabel("Priorité à appliquer", { exact: true }).selectOption("high");
  await layout(page);
  await dialog.getByRole("button", { name: "Enregistrer l’organisation", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".query-group h3")).toContainText("Découverte CRM");
  await page.getByLabel("Thème", { exact: true }).selectOption({ label: "Découverte CRM" });
  await page.getByLabel("Priorité", { exact: true }).selectOption("high");
  await page.getByLabel("Nom de la vue", { exact: true }).fill("CRM prioritaire");
  await page.getByRole("button", { name: "Enregistrer la vue", exact: true }).click();
  await expect(
    page.getByLabel("Vues enregistrées", { exact: true }).locator("option:checked"),
  ).toHaveText("CRM prioritaire");
  await page.reload();
  await navigate(page, "Requêtes suivies");
  await expect(page.getByLabel("Priorité", { exact: true })).toHaveValue("high");
  await page.getByRole("button", { name: "Effacer les filtres", exact: true }).click();
  await page
    .getByLabel("Vues enregistrées", { exact: true })
    .selectOption({ label: "CRM prioritaire" });
  await expect(page.getByLabel("Priorité", { exact: true })).toHaveValue("high");
  await page.getByRole("button", { name: "1 preuve", exact: true }).first().click();
  await expect(page.locator(".response-table tbody tr")).toHaveCount(1);
  await navigate(page, "Opportunités GEO");
  await page.getByRole("button", { name: "Suivre cette opportunité", exact: true }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titre de l’action", { exact: true }).fill("Publier un guide CRM");
  await dialog.getByLabel("Responsable", { exact: true }).fill("Camille");
  await dialog.getByLabel("Échéance", { exact: true }).fill("2027-01-15");
  await dialog
    .getByLabel("URL de la page concernée", { exact: true })
    .fill("https://workflow.example/guide");
  await dialog
    .getByLabel("Notes et hypothèses", { exact: true })
    .fill("Vérifier les besoins des agences avant publication.");
  await layout(page);
  await dialog.getByRole("button", { name: "Enregistrer l’action", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const action = page.locator(".action-list > li").filter({ hasText: "Publier un guide CRM" });
  await expect(action).toContainText("À vérifier");
  await action.getByRole("button", { name: "Modifier l’action", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Statut de l’action", { exact: true }).selectOption("published");
  await dialog.getByRole("button", { name: "Enregistrer l’action", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(action).toContainText("Publié");
  await page.reload();
  await navigate(page, "Opportunités GEO");
  await expect(action).toContainText("Camille");
  await expect(action).toContainText("Publié");
  await action.getByRole("button", { name: "Preuves archivées", exact: true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Concurrent Test: 1/1");
  await dialog.locator(".archived-answer summary").first().click();
  await expect(dialog.locator(".answer")).toContainText("TEST SYNTHÉTIQUE");
  await layout(page);
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await worker("workflow-history-fixture", [baseline.id]);
  await page.reload();
  await navigate(page, "Historique & exports");
  await page.getByLabel("Campagne sélectionnée", { exact: true }).selectOption(web.id);
  await expect(page.locator(".card.campaign-timeline .timeline-entry")).toHaveCount(20);
  await page
    .getByRole("navigation", { name: "Pages de campagnes", exact: true })
    .getByRole("button", { name: "Suivant", exact: true })
    .click();
  await expect(page.locator(".card.campaign-timeline .timeline-entry")).toHaveCount(4);
  await expect(page.locator(".card.campaign-timeline")).toContainText(
    "Mode de recherche web différent",
  );
  const row = page
    .locator(".timeline-entry")
    .filter({ hasText: "Mode de recherche web différent" })
    .filter({ hasNotText: "Campagne partielle ou sans réponse valide" });
  await row.getByRole("button", { name: "Afficher cette campagne", exact: true }).click();
  await expect(page.getByLabel("Campagne sélectionnée", { exact: true })).toHaveValue(baseline.id);
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const title of ["Requêtes suivies", "Opportunités GEO", "Historique & exports"]) {
      await navigate(page, title);
      await layout(page);
      if (width === 320 || width === 1440) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: `.local/workflows-${engine}-${width}-${["Requêtes suivies", "Opportunités GEO", "Historique & exports"].indexOf(title)}.png`,
          fullPage: true,
        });
      }
    }
  }
  if (engine === "chromium") {
    const accessibility = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
  expect(await page.request.get(`/api/runs/${web.id}`).then((r) => r.json())).toEqual(original);
  expect(inference).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `.local/workflows-${engine}.png`, fullPage: true });
  await info.attach("checks", {
    body: "Real isolated PostgreSQL fixtures; private links survive reload; bulk themes and saved views persist; action proof archived; paginated history; no inference POSTs after seeding.",
    contentType: "text/plain",
  });
}
