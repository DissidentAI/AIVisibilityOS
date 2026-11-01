import { test, expect, type Page } from "@playwright/test";
test.use({ browserName: "webkit", viewport: { width: 390, height: 844 } });
async function signIn(page: Page) {
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  const setup = await page.request.get("/api/auth/status").then((r) => r.json());
  if (setup.setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible();
}
test("mobile draft survives reload and closing, then clears after project creation or discard", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await signIn(page);
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await page.getByLabel("Nom de votre marque").fill("Karburo sauvegardé");
  await page.getByLabel("Domaine web", { exact: true }).fill("https://karburo.example/fr/");
  await page.getByLabel("Secteur d’activité").fill("Stations-service et recharge");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByLabel("Nom", { exact: true }).nth(0).fill("Karbu France");
  await page.getByLabel("Domaine", { exact: true }).nth(0).fill("karbu-france.example");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  const questions =
    "Quelle application de carburant choisir ?\nComment comparer les prix des stations ?";
  await page.getByLabel("Questions à surveiller", { exact: true }).fill(questions);
  await expect(page.getByText("Brouillon sauvegardé sur cet appareil")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByLabel("Questions à surveiller", { exact: true })).toHaveValue(questions);
  await expect(page.getByText("Brouillon repris", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByLabel("Questions à surveiller", { exact: true })).toHaveValue(questions);
  // A confirmed creation must clear the draft even if the following state refresh fails.
  let created = false;
  await page.route("**/api/projects", async (route) => {
    const response = await route.fetch();
    created = response.status() === 201;
    await route.fulfill({ response });
  });
  await page.route("**/api/state", async (route) => {
    if (created) {
      created = false;
      await route.fulfill({ status: 503, json: { error: "internal_error" } });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByLabel("Nom de votre marque")).toHaveValue("");
  await page.getByLabel("Nom de votre marque").fill("À effacer");
  await page.getByRole("button", { name: "Effacer le brouillon", exact: true }).click();
  await expect(page.getByLabel("Nom de votre marque")).toHaveValue("");
  await page.reload();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByLabel("Nom de votre marque")).toHaveValue("");
  expect(errors).toEqual([]);
});
test("Kimi and OpenRouter keys are saved server-side while campaign choices persist without secrets", async ({
  page,
}) => {
  await signIn(page);
  let state = await page.request.get("/api/state").then((r) => r.json());
  if (!state.projects.length) {
    await page.request.post("/api/projects", {
      headers: { origin: "http://127.0.0.1:3100" },
      data: {
        name: "Karburo",
        domain: "karburo.example",
        industry: "Mobilité",
        country: "FR",
        language: "fr",
        queries: ["Quelle application de carburant choisir ?"],
      },
    });
    await page.reload();
  }
  state = await page.request.get("/api/state").then((r) => r.json());
  const selectedProject = state.projects[state.projects.length - 1].id;
  await page.getByLabel("Projet actif", { exact: true }).selectOption(selectedProject);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.getByRole("button", { name: "Paramètres", exact: true }).click();
  for (const provider of ["kimi", "openrouter"]) {
    await page.getByRole("button", { name: "Connecter une clé", exact: true }).click();
    await page.getByLabel("Fournisseur", { exact: true }).selectOption(provider);
    await page
      .getByLabel("Clé API", { exact: true })
      .fill(`synthetic-${provider}-key-not-production`);
    await page.getByRole("button", { name: "Enregistrer la clé", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Connecter un fournisseur" })).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Lancer une mesure", exact: true }).click();
  for (const name of ["OpenAI", "Google Gemini"]) {
    const checkbox = page.getByRole("checkbox", { name, exact: false });
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await page.getByRole("checkbox", { name: "Kimi · Moonshot AI", exact: false }).check();
  await page.getByRole("checkbox", { name: "OpenRouter", exact: false }).check();
  await page.getByLabel("Modèle via OpenRouter").selectOption("moonshotai/kimi-k3.1-pro");
  await page.getByLabel("Échantillons par requête et fournisseur").selectOption("2");
  await expect(
    page.getByRole("option", { name: "API avec recherche web et citations", exact: true }),
  ).toBeDisabled();
  await expect(page.getByText("Réservation prudente par campagne", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Projet actif", { exact: true })).toHaveValue(selectedProject);
  await page.getByRole("button", { name: "Lancer une mesure", exact: true }).click();
  await expect(page.getByLabel("Modèle via OpenRouter")).toHaveValue("moonshotai/kimi-k3.1-pro");
  await expect(page.getByLabel("Échantillons par requête et fournisseur")).toHaveValue("2");
  await expect(
    page.getByRole("checkbox", { name: "Kimi · Moonshot AI", exact: false }),
  ).toBeChecked();
  const saved = await page.evaluate(() => JSON.stringify(localStorage));
  expect(saved).not.toContain("synthetic-kimi-key-not-production");
  expect(saved).not.toContain("synthetic-openrouter-key-not-production");
  state = await page.request.get("/api/state").then((r) => r.json());
  expect(state.credentials.map((c: { provider: string }) => c.provider)).toEqual(
    expect.arrayContaining(["kimi", "openrouter"]),
  );
  expect(JSON.stringify(state)).not.toContain("synthetic-kimi-key-not-production");
  await page.screenshot({
    path: ".local/kimi-openrouter-mobile.png",
    fullPage: false,
    animations: "disabled",
  });
  // No paid calls are launched. Worker execution is covered separately with synthetic adapters.
});
test("blocked browser storage leaves onboarding usable and explains the saving limitation", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await signIn(page);
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByText("La sauvegarde locale est bloquée", { exact: false })).toBeVisible();
  await page.getByLabel("Nom de votre marque").fill("Karburo sans stockage");
  await page.getByLabel("Domaine web", { exact: true }).fill("karburo.example");
  await page.getByLabel("Secteur d’activité").fill("Mobilité");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByLabel("Nom", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
