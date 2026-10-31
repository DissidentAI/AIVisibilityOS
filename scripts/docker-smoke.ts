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
const state = await fetch(`${origin}/api/state`, { headers: { cookie } }).then((r) => r.json());
if (state.projects.length !== 1 || !state.workerOnline)
  throw new Error("Workspace or worker unavailable");
console.log(
  "Compose smoke passed: registration, project persistence, authenticated state, worker heartbeat. No provider call made.",
);
