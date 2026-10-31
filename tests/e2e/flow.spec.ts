import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
test("real browser: registration, Karburo onboarding, fixtures campaign, evidence, CSV and mobile", async ({page})=>{
  const errors: string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");await page.getByLabel("Adresse e-mail").fill("owner@example.com");await page.getByLabel("Mot de passe",{exact:true}).fill("e2e-fixture-password");await page.getByLabel("Code d’installation").fill("e2e-fixture-bootstrap-not-production");await page.getByRole("button",{name:"Créer mon espace"}).click();
  await expect(page.getByRole("heading",{name:"Vue d’ensemble"})).toBeVisible();await page.getByRole("button",{name:"Configurer mon premier projet"}).click();
  await page.getByLabel("Nom de votre marque").fill("Karburo");await page.getByLabel("Domaine web").fill("karburo.example");await page.getByLabel("Secteur d’activité").fill("comparaison des prix des carburants");await page.getByRole("button",{name:"Continuer",exact:true}).click();
  const names=page.getByLabel("Nom",{exact:true}),domains=page.getByLabel("Domaine",{exact:true});await names.nth(0).fill("Concurrent Test");await domains.nth(0).fill("concurrent.example");await names.nth(1).fill("Alternative Test");await domains.nth(1).fill("alternative.example");await page.getByRole("button",{name:"Continuer",exact:true}).click();
  await page.getByRole("button",{name:"Proposer 10 questions"}).click();await expect(page.getByText("10/50 questions",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Créer le projet",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Paramètres",exact:true})).toBeVisible();await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button",{name:"Vue d’ensemble",exact:true}).click();await mkdir("docs/screenshots",{recursive:true});
  await page.screenshot({path:"docs/screenshots/overview-light.png",fullPage:true});
  await page.getByRole("button",{name:"Changer de thème"}).click();await page.screenshot({path:"docs/screenshots/overview-dark.png",fullPage:true});await page.getByRole("button",{name:"Changer de thème"}).click();
  await page.getByRole("button",{name:"Paramètres",exact:true}).click();
  for(const provider of ["openai","gemini"]){await page.getByRole("button",{name:"Connecter une clé"}).click();await page.getByLabel("Fournisseur",{exact:true}).selectOption(provider);await page.getByLabel("Clé API",{exact:true}).fill("e2e-test-only-not-a-real-api-key");await page.getByRole("button",{name:"Enregistrer la clé"}).click();await expect(page.getByRole("dialog")).toHaveCount(0);}
  await page.getByRole("button",{name:"Lancer une mesure"}).click();await page.getByRole("button",{name:"Lancer les appels API"}).click();await expect(page.getByRole("heading",{name:"Historique & exports",exact:true})).toBeVisible();await expect(page.getByText("20 exécutions",{exact:true})).toBeVisible();
  // External test-only worker injects synthetic responses; application has no demo mode or mock endpoint.
  await promisify(execFile)(process.execPath,["--import","tsx","tests/e2e/fixture-worker.ts"],{env:{...process.env,DATABASE_URL:process.env.TEST_DATABASE_URL??"postgres://test:test-only@127.0.0.1:55434/visibility_test",ENCRYPTION_KEY:"12".repeat(32)}});
  await expect(page.getByText("Valide",{exact:true})).toHaveCount(20,{timeout:20000});
  await page.getByRole("button",{name:"Vue d’ensemble",exact:true}).click();await expect(page.getByText("35.0%",{exact:true}).first()).toBeVisible();
  await page.getByRole("button",{name:"Historique & exports",exact:true}).click();await page.getByRole("button",{name:"Ouvrir",exact:true}).first().click();await expect(page.getByRole("heading",{name:"Preuve de mesure"})).toBeVisible();await expect(page.locator(".answer")).toContainText("TEST SYNTHÉTIQUE");await page.getByRole("button",{name:"Close / Fermer"}).click();
  const downloadPromise=page.waitForEvent("download");await page.getByRole("link",{name:"CSV",exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toContain("visibility-");
  await page.getByRole("button",{name:"Passer en anglais"}).click();await expect(page.getByRole("heading",{name:"History & exports",exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.getByRole("button",{name:"Menu",exact:true}).click();await page.getByRole("button",{name:"Overview",exact:true}).click();await expect(page.getByRole("heading",{name:"Overview",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
