import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AI Visibility OS",
  description:
    "Mesurez les mentions de votre marque dans les réponses des API IA, avec des preuves vérifiables.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
