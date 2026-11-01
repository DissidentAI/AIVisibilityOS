import { test } from "@playwright/test";
import { responsiveFlow } from "./responsive-flow";
test.use({ browserName: "webkit", reducedMotion: "reduce" });
test("webkit: responsive pages, locales and dialogs", async ({ page }, info) => {
  await responsiveFlow(page, info, "webkit");
});
