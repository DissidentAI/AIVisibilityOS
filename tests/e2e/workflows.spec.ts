import { test } from "@playwright/test";
import { workflowsFlow } from "./workflows-flow";
test.use({
  browserName: "chromium",
  reducedMotion: "reduce",
  viewport: { width: 1440, height: 1000 },
});
test("chromium: proofs, themes, actions and history", async ({ page }, info) => {
  await workflowsFlow(page, info, "chromium");
});
