"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="auth"><div className="card"><h1>Une erreur est survenue / Something went wrong</h1><p>Vos données enregistrées sont conservées. / Your saved data is preserved.</p><Button onClick={reset}>Réessayer / Retry</Button></div></main>; }
