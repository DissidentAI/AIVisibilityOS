if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith("_test"))
  throw Error("Synthetic fixture worker requires an isolated test database");
const { workOnce } = await import("../../src/lib/queue");
const { sql } = await import("../../src/db/client");
while (
  await workOnce(
    async (_provider, _key, query) => {
      const parsed = JSON.parse(query).untrustedProjectContext;
      if (!parsed || !parsed.industry) throw Error("Unexpected suggestion context");
      return {
        status: "succeeded",
        text: JSON.stringify({
          questions: Array.from(
            { length: 10 },
            (_, i) =>
              `[SYNTHETIC TEST] Comment comparer ${parsed.industry} pour le besoin ${i + 1} ?`,
          ),
          competitors: [
            {
              name: "Concurrent IA Synthétique",
              domain: "suggested.example",
              reason: `Hypothèse de test liée à ${parsed.industry}`,
            },
            {
              name: "Alternative IA Synthétique",
              domain: null,
              reason: "Domaine inconnu, à renseigner manuellement",
            },
          ],
        }),
        model: "synthetic-suggestion-model",
        requestId: "test-fixture",
        input: 100,
        output: 200,
        raw: { syntheticFixture: true },
        citations: [],
      };
    },
    { unregulatedTestOnly: true },
  )
) {}
await sql.end();
export {};
