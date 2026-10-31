// TEST-ONLY executable. No public API mocking route is present in the application.
export {};
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw new Error("Fixtures may only run in a _test database");
const { workOnce } = await import("../../src/lib/queue");
const { sql } = await import("../../src/db/client");
let calls = 0;
while (
  await workOnce(async (provider, _key, _query, _system, mode) => {
    calls++;
    return {
      status: "succeeded",
      text: `TEST SYNTHÉTIQUE — ${calls <= 7 ? "Karburo. " : ""}Concurrent Test.`,
      model: `fixture-${provider}`,
      requestId: `e2e-fixture-${calls}`,
      input: 100,
      output: 50,
      raw: { syntheticFixture: true },
      citations:
        mode === "web"
          ? [
              {
                url: "https://example.com/evidence",
                domain: "example.com",
                title: "Synthetic source",
                provenance:
                  provider === "openai" ? "openai_url_annotation" : "gemini_grounding_metadata",
              },
            ]
          : [],
      grounding: {
        searched: mode === "web",
        toolCalls: mode === "web" ? 1 : 0,
        queries: mode === "web" ? ["synthetic search query"] : [],
        searchEntryHtml:
          mode === "web" && provider === "gemini"
            ? "<div>Google Search — synthetic suggestions</div><script>window.top.unsafeFixtureExecuted = true</script>"
            : null,
        links:
          mode === "web"
            ? [{ end: 16, url: "https://example.com/evidence", title: "Synthetic source" }]
            : [],
      },
    };
  })
);
await sql.end();
