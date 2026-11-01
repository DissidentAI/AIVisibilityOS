import { test } from "@playwright/test";
import { workflowsFlow } from "./workflows-flow";
test.use({ browserName: "webkit", reducedMotion: "reduce", viewport: { width: 390, height: 844 } });
test("webkit: proofs, themes, actions and history", async ({ page }, info) => {
  await workflowsFlow(page, info, "webkit");
});
