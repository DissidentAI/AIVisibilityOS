import { test, expect } from "@playwright/test";

test.use({ browserName: "webkit", viewport: { width: 390, height: 844 } });

test("WebKit phone: sign in, navigation, modal focus and narrow layouts", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Adresse e-mail").fill("owner@example.com");
  await page.getByLabel("Mot de passe", { exact: true }).fill("e2e-fixture-password");
  // Also runnable independently on the isolated test installation.
  const setup = await page.request.get("/api/auth/status").then((response) => response.json());
  if (setup.setupRequired) {
    await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");
    await page.getByRole("button", { name: "Créer mon espace", exact: true }).click();
  } else {
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "Vue d’ensemble", exact: true })).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const name of ["Paramètres", "Consommation", "Vue d’ensemble"]) {
      await page.getByRole("button", { name: "Menu", exact: true }).click();
      await page.getByRole("button", { name, exact: true }).click();
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
  }
  await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Créer un projet", exact: true })).toBeVisible();
  await page.getByLabel("Nom de votre marque").fill("Brouillon mobile");
  await page.getByLabel("Domaine web").fill("mobile.example");
  await page.getByLabel("Secteur d’activité").fill("Mobilité");
  await page.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByLabel("Nom", { exact: true }).first()).toBeFocused();
  await page.getByRole("button", { name: "Retour", exact: true }).click();
  await expect(page.getByLabel("Nom de votre marque")).toHaveValue("Brouillon mobile");
  await page.getByRole("button", { name: "Close / Fermer", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Créer un projet", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nouveau projet", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("WebKit: reduced motion and restricted browser storage keep sign-in usable", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/");
  await expect(page.getByLabel("Adresse e-mail")).toBeVisible();
  await expect(page.getByRole("button", { name: "Animations", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Changer de thème", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("Langue de l’interface", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Email address")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
