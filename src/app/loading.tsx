import { BrandMark } from "@/components/ui/brand-mark";

export default function Loading() {
  return (
    <main className="auth" aria-busy="true">
      <div className="loading-mark" role="status">
        <BrandMark large />
        <p>Ouverture de votre espace / Opening your workspace…</p>
      </div>
    </main>
  );
}
