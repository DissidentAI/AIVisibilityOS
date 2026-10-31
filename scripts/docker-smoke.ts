import "dotenv/config";
import { randomBytes } from "node:crypto";
// Intended only for the disposable Compose stack created by CI.
if (process.env.CI !== "true")
  throw new Error("Docker smoke test is limited to disposable CI stacks");
const origin = "http://localhost:3000";
const health = await fetch(`${origin}/api/health`);
if (!health.ok) throw new Error("Database readiness check failed");
const auth = await fetch(`${origin}/api/auth/register`, {
  method: "POST",
  headers: { origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: "ci-smoke@example.com",
    password: randomBytes(24).toString("hex"),
    bootstrapToken: process.env.BOOTSTRAP_TOKEN,
  }),
});
if (!auth.ok) throw new Error(`Owner registration failed: ${auth.status}`);
const cookie = auth.headers.get("set-cookie")?.split(";")[0];
if (!cookie) throw new Error("Session cookie missing");
const project = await fetch(`${origin}/api/projects`, {
  method: "POST",
  headers: { origin, cookie, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "CI Smoke Project",
    domain: "example.com",
    industry: "Test",
    country: "FR",
    language: "fr",
    competitors: [],
    queries: ["Synthetic configuration for a CI smoke test?"],
  }),
});
if (!project.ok) throw new Error(`Project creation failed: ${project.status}`);
const projectInfo = await project.json();
const estimate = await fetch(`${origin}/api/runs/estimate`, {
  method: "POST",
  headers: { origin, cookie, "Content-Type": "application/json" },
  body: JSON.stringify({
    projectId: projectInfo.id,
    providers: ["openai", "gemini"],
    samples: 1,
    mode: "web",
  }),
});
if (!estimate.ok) throw new Error("Search estimate unavailable");
const quote = await estimate.json();
if (
  quote.responses !== 2 ||
  quote.reservedMicros < 50000 ||
  quote.snapshot.parameters.search !== true
)
  throw new Error("Invalid search budget estimate");
for (const path of [
  `schedules?project=${projectInfo.id}`,
  `reports?project=${projectInfo.id}`,
  "branding",
]) {
  const result = await fetch(`${origin}/api/${path}`, { headers: { cookie } });
  if (!result.ok) throw new Error("Agency tables unavailable");
}
const state = await fetch(`${origin}/api/state`, { headers: { cookie } }).then((r) => r.json());
if (state.projects.length !== 1 || !state.workerOnline)
  throw new Error("Workspace or worker unavailable");
console.log(
  "Compose smoke passed: registration, project persistence, authenticated state, search estimate, agency tables, worker heartbeat. No provider call made.",
);
