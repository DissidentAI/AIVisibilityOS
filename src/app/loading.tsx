import { Radio } from "lucide-react";

export default function Loading() {
  return (
    <main className="auth" aria-busy="true">
      <div className="loading-mark" role="status">
        <Radio size={32} />
        <p>Ouverture de votre espace / Opening your workspace…</p>
      </div>
    </main>
  );
}
