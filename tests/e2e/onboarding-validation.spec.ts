import { test, expect } from "@playwright/test";

test.use({ browserName: "webkit", viewport: { width: 390, height: 844 } });

test("mobile onboarding: pasted URLs, precise errors and retained entries after server rejection", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  const setup = await page.request.get("/api/auth/status").then((response) => response.json());
  if (setup.setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await page.getByLabel("Nom de votre marque").fill("Karburo mobile");
  await page
    .getByLabel("Domaine web", { exact: true })
    .fill("HTTPS://KARBURO.EXAMPLE/fr-fr/?source=phone");
  await page
    .getByLabel("Secteur d’activité")
    .fill("Application de station essence et borne de recharge avec IA");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  const names = page.getByLabel("Nom", { exact: true });
  const domains = page.getByLabel("Domaine", { exact: true });
  await names.nth(0).fill("Karbu France");
  await domains.nth(0).fill("karbu france");
  await names.nth(1).fill("Gasoil Now");
  await domains.nth(1).fill("https://gasoil.example/fr/");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(domains.nth(0)).toHaveAttribute("aria-invalid", "true");
  await expect(domains.nth(0)).toBeFocused();
  await expect(page.getByText("Saisissez un domaine public", { exact: false })).toBeVisible();
  await page.screenshot({
    path: ".local/onboarding-field-error.png",
    fullPage: true,
    animations: "disabled",
  });
  await domains.nth(0).fill("https://karbu-france.example/prix/");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await page.getByRole("button", { name: "Proposer 10 questions" }).click();
  const questions = page.getByLabel("Questions à surveiller", { exact: true });
  const original = await questions.inputValue();
  await questions.fill(original + "\n" + original.split("\n")[0]);
  await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(questions).toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Question 11 : Cette question est déjà présente.", { exact: false }),
  ).toBeVisible();
  await questions.fill(original);
  // Test-only simulated server rejection verifies that a previous-step error is recoverable.
  let rejected = false;
  await page.route("**/api/projects", async (route) => {
    if (route.request().method() === "POST" && !rejected) {
      rejected = true;
      await route.fulfill({
        status: 400,
        json: {
          error: "invalid_input",
          issues: [{ field: "competitors.1.domain", code: "public_domain" }],
        },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(domains.nth(1)).toHaveAttribute("aria-invalid", "true");
  await expect(domains.nth(1)).toBeFocused();
  await expect(names.nth(0)).toHaveValue("Karbu France");
  await expect(names.nth(1)).toHaveValue("Gasoil Now");
  await domains.nth(1).fill("https://gasoil.example/contact/");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(questions).toHaveValue(original);
  await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Paramètres", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Créer un projet", exact: true })).toHaveCount(0);
  const state = await page.request.get("/api/state").then((response) => response.json());
  const project = state.projects.find((item: { name: string }) => item.name === "Karburo mobile");
  expect(project.domain).toBe("karburo.example");
  expect(project.queries).toHaveLength(10);
  expect(project.brands.map((brand: { domain: string }) => brand.domain)).toEqual(
    expect.arrayContaining(["karbu-france.example", "gasoil.example"]),
  );
  expect(errors).toEqual([]);
});
