import { test } from "@playwright/test";
import { responsiveFlow } from "./responsive-flow";
test.use({ browserName: "chromium", reducedMotion: "reduce" });
test("chromium: responsive pages, locales and dialogs", async ({ page }, info) => {
  await responsiveFlow(page, info, "chromium");
});
