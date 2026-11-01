import { test } from "@playwright/test";
import { reanalysisFlow } from "./reanalysis-flow";
test.use({ reducedMotion: "reduce" });
test("desktop: saved-answer reanalysis preserves evidence, exports and reports without paid work", async ({
  page,
}) => {
  await reanalysisFlow(page, "chromium");
});
