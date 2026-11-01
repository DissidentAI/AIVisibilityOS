import { test } from "@playwright/test";
import { reanalysisFlow } from "./reanalysis-flow";
test.use({ browserName: "webkit", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
test("mobile: saved-answer reanalysis preserves evidence, exports and reports without credentials", async ({
  page,
}) => {
  await reanalysisFlow(page, "webkit");
});
