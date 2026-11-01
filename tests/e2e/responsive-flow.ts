import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

const titles = [
  "Vue d’ensemble",
  "Requêtes suivies",
  "Concurrents",
  "Sources & citations",
  "Opportunités GEO",
  "Audit de site",
  "Historique & exports",
  "Planification",
  "Rapports clients",
  "Paramètres",
  "Consommation",
];
const headers = { origin: "http://127.0.0.1:3100" };
const worker = (name: string, failed = false) =>
  promisify(execFile)(process.execPath, ["--import", "tsx", `tests/e2e/${name}.ts`], {
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgres://test:test-only@127.0.0.1:55434/visibility_test",
      ENCRYPTION_KEY: "12".repeat(32),
      E2E_FAILURES: failed ? "1" : "0",
    },
  });

async function navigate(page: Page, index: number) {
  await expect(page.locator(".main-shell")).toBeVisible();
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator(".sidebar .nav-item").nth(index).click();
  await expect(page.locator(".sidebar .nav-item").nth(index)).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** Check rendered text geometry, not scrollWidth alone (shine pseudo-elements can inflate it). */
async function checkLayout(page: Page, scope = "body") {
  const issues = await page.locator(scope).evaluate((root) => {
    const issues: string[] = [];
    const visible = (e: Element) =>
      e.getClientRects().length > 0 &&
      getComputedStyle(e).visibility !== "hidden" &&
      !e.closest("[inert]") &&
      (!document.querySelector("dialog[open]") || !!e.closest("dialog[open]"));
    if (document.documentElement.scrollWidth > innerWidth + 1)
      issues.push("Page overflows horizontally");
    const brand = root.querySelector(".auth-brand");
    const controls = root.querySelector(".auth-controls");
    if (brand && controls) {
      const a = brand.getBoundingClientRect(),
        b = controls.getBoundingClientRect();
      if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)
        issues.push("Auth controls overlap the logo");
    }
    for (const e of root.querySelectorAll<HTMLElement>(
      "button,.btn,input:not([type=hidden]),select,textarea",
    )) {
      if (!visible(e)) continue;
      const box = e.getBoundingClientRect();
      const name = e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 55) ?? e.tagName;
      if ((box.left < -1 || box.right > innerWidth + 1) && !e.closest(".table-wrap,.answer-table"))
        issues.push(`Outside viewport: ${name}`);
      if (e.matches("button,.btn") && innerWidth <= 760 && box.height < 43.5)
        issues.push(`Short touch target: ${name} (${box.height})`);
      if (
        innerWidth <= 760 &&
        e.matches("input:not([type=checkbox]):not([type=radio]),select,textarea") &&
        Number.parseFloat(getComputedStyle(e).fontSize) < 16
      )
        issues.push(`Small form text: ${name}`);
      if (e.matches("button,.btn")) {
        const walker = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const rect of range.getClientRects()) {
            if (rect.width && (rect.left < box.left - 1 || rect.right > box.right + 1))
              issues.push(`Clipped label: ${name}`);
          }
        }
      }
    }
    for (const e of root.querySelectorAll<HTMLElement>(".metric-value")) {
      if (visible(e) && e.scrollWidth > e.clientWidth + 1)
        issues.push(`Clipped metric: ${e.textContent}`);
    }
    return [...new Set(issues)];
  });
  expect.soft(issues).toEqual([]);
}

async function checkAccessibility(page: Page, label: string, info: TestInfo) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  if (result.violations.length)
    await info.attach(`accessibility-${label}`, {
      body: JSON.stringify(result.violations, null, 2),
      contentType: "application/json",
    });
  expect
    .soft(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
      })),
      label,
    )
    .toEqual([]);
}

export async function responsiveFlow(page: Page, info: TestInfo, browserName: string) {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await worker("reset-limits");
  await page.goto("/");
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await checkLayout(page);
  }
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
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(`/api/${path}`, { headers, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  };
  const project = await post("projects", {
    name: "Karburo laboratoire de comparaison internationale",
    domain: "responsive.example",
    industry: "Logiciels de mobilité",
    description: "TEST SYNTHÉTIQUE — audit ergonomique, pas des mesures réelles",
    language: "fr",
    country: "FR",
    competitors: [
      { name: "Concurrent Test", domain: "concurrent.example" },
      {
        name: "Compagnie internationale des solutions de mobilité durable",
        domain: "international.example",
      },
    ],
    queries: [
      "[MARKDOWN_FIXTURE] Quelles sont les meilleures solutions de comparaison des tarifs et de planification des déplacements professionnels en Europe ?",
      "[RETRY_FIXTURE] Quels services disposent de données vérifiables ?",
      "Comment choisir une solution pour son entreprise ?",
    ],
  });
  await post("credentials", {
    provider: "openai",
    key: "synthetic-provider-key-not-production",
  });
  const run = await post("runs", {
    projectId: project.id,
    providers: ["openai"],
    samples: 1,
    mode: "web",
  });
  await worker("fixture-worker", true);
  const state = await page.request.get("/api/state").then((r) => r.json());
  const brands = state.projects.find((p: { id: string }) => p.id === project.id).brands;
  await post("audits", {
    projectId: project.id,
    maxPages: 10,
    competitorIds: brands
      .filter((b: { is_primary: boolean }) => !b.is_primary)
      .map((b: { id: string }) => b.id),
  });
  await worker("audit-worker");
  await post("reports", {
    runId: run.id,
    previousRunId: null,
    locale: "fr",
    notes: "TEST SYNTHÉTIQUE",
    brandScope: "current",
  });
  await page.reload();
  await page.getByLabel("Projet actif", { exact: true }).selectOption(project.id);
  await expect(page.locator(".run-status")).toContainText("Campagne terminée");
  await page.locator(".methodology summary").click();
  await expect(page.locator(".methodology")).toContainText("Recherche web demandée");
  const forbidden: string[] = [];
  page.on("request", (r) => {
    if (
      r.method() === "POST" &&
      /\/api\/(runs|suggestions|audits)(\/[^/]+\/(retry|ai))?$/.test(r.url())
    )
      forbidden.push(r.url());
  });
  const captures = process.env.CAPTURE_RESPONSIVE === "1";
  if (captures) await mkdir(".local/responsive-after", { recursive: true });
  for (const locale of ["fr", "en", "zh-CN"]) {
    await page.locator(".topbar .language-select").selectOption(locale);
    const sizes =
      locale === "fr"
        ? [
            [320, 844],
            [390, 844],
            [768, 1024],
            [1024, 768],
            [1440, 1000],
            [844, 390],
          ]
        : [
            [320, 844],
            [1440, 1000],
          ];
    for (const [width, height] of sizes) {
      await page.setViewportSize({ width, height });
      for (let index = 0; index < titles.length; index++) {
        await test.step(`${locale} ${width}×${height} ${titles[index]}`, async () => {
          await navigate(page, index);
          // Allow fonts/ResizeObserver to settle, without waiting for ongoing periodic reads.
          await page.evaluate(() => document.fonts.ready);
          await checkLayout(page);
          if (browserName === "chromium" && locale === "fr" && width === 1440)
            await checkAccessibility(page, titles[index], info);
          if (
            captures &&
            ((locale === "fr" && (width === 320 || width === 1440)) ||
              (locale !== "fr" && width === 320 && index === 8))
          ) {
            await page.evaluate(() => {
              (document.activeElement as HTMLElement)?.blur();
              window.scrollTo(0, 0);
            });
            await page.screenshot({
              path: `.local/responsive-after/${browserName}-${locale}-${index}-${width}.png`,
              fullPage: true,
              animations: "disabled",
            });
          }
        });
      }
    }
  }
  await page.locator(".topbar .language-select").selectOption("fr");
  await page.setViewportSize({ width: 320, height: 740 });
  await navigate(page, 0);
  for (const button of [
    "Nouveau projet",
    "Modifier le projet et le scan",
    "Lancer une mesure",
    "Réessayer 1 échec",
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await checkLayout(page, "dialog[open]");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  for (const [index, name] of [
    [1, "Ajouter"],
    [2, "Ajouter"],
    [7, "Configurer le planning"],
    [9, "Connecter une clé"],
  ] as const) {
    await navigate(page, index);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await checkLayout(page, "dialog[open]");
    await page.keyboard.press("Escape");
  }
  await navigate(page, 9);
  await page.locator(".execution-row summary").first().click();
  await checkLayout(page);
  await page.getByRole("button", { name: "Supprimer mon espace", exact: true }).click();
  await checkLayout(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await navigate(page, 6);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).first().click();
  await checkLayout(page, "dialog[open]");
  await page.setViewportSize({ width: 844, height: 390 });
  await checkLayout(page, "dialog[open]");
  await page.keyboard.press("Escape");
  await navigate(page, 5);
  const table = page.getByRole("region", { name: "Comparaison des pages", exact: true });
  await expect(table).toHaveAttribute("tabindex", "0");
  await expect(page.locator(".table-scroll-hint").first()).toBeVisible();
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => table.evaluate((e) => e.scrollLeft)).toBeGreaterThan(0);
  // Theme changes and 200% text enlargement must preserve action access.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Changer de thème", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  for (let index = 0; index < titles.length; index++) {
    await navigate(page, index);
    await checkLayout(page);
    if (browserName === "chromium") await checkAccessibility(page, `light-${titles[index]}`, info);
  }
  await page.addStyleTag({ content: ".content { zoom: 2; }" });
  await checkLayout(page);
  // A failed read must remain recoverable and must not surface as an unhandled rejection.
  await page.route("**/api/runs?*", (route) => route.abort("failed"));
  await page.reload();
  await expect(page.locator(".alert.error")).toContainText("Connexion interrompue");
  await page.unroute("**/api/runs?*");
  await page.reload();
  await expect(page.locator(".run-status")).toBeVisible();
  await expect(page.locator(".alert.error")).toHaveCount(0);
  expect(forbidden).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach("coverage", {
    body: "110 page/viewport/language combinations; 10 dialogs; auth; table keyboard scrolling; light/dark; 200% content zoom. Synthetic isolated fixtures only.",
    contentType: "text/plain",
  });
}
