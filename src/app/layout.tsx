import type { Metadata } from "next";
import { MotionProvider, AmbientBackground } from "@/components/ui/motion";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./editorial.css";
import "./answers.css";
import "./audits.css";
import "./planning.css";
import "./responsive.css";
export const metadata: Metadata = {
  title: "AI Visibility OS",
  description:
    "Mesurez les mentions de votre marque dans les réponses des API IA, avec des preuves vérifiables.",
  robots: { index: false, follow: false },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" data-theme="dark" data-motion="reduced" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;d.dataset.theme=localStorage.getItem('avos-theme')==='light'?'light':'dark';var l=localStorage.getItem('avos-lang');d.lang=l==='en'||l==='zh-CN'?l:'fr';d.dataset.motion=localStorage.getItem('avos-motion')==='paused'||matchMedia('(prefers-reduced-motion: reduce)').matches?'reduced':'full'}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <MotionProvider>
          <AmbientBackground />
          {children}
        </MotionProvider>
      </body>
    </html>
  );
}
