# Interface et mouvement / Interface and motion

L’évolution du 1er novembre s’inspire de la hiérarchie éditoriale observée sur [oyin.design](https://www.oyin.design/) : titres expressifs, petits repères typographiques et respirations entre sections. Elle utilise une palette papier/encre chaude, des titres en police système à empattements et l’accent ambre propre à l’application. Aucun actif du site n’est copié. La navigation conserve son verre translucide ; les tableaux privilégient la lisibilité. Les animations restent interrompables et aucun écran d’introduction ne bloque l’accès aux mesures.

Le journal se transforme en lignes structurées sur téléphone, avec recherche, filtres et boutons de reprise. Les changements de progression utilisent une transition de largeur, arrêtée en mouvement réduit. Les opportunités sont présentées comme des notes éditoriales : fait, hypothèse, action, preuves.

L’interface utilise une palette ambre et encre, des surfaces translucides, une navigation flottante et Manrope Variable servie localement. Les thèmes clair/sombre, la langue et la pause des animations sont conservés sur l’appareil lorsque son navigateur autorise le stockage local. La licence OFL de Manrope est incluse dans la distribution standalone, comme celle de Noto Sans utilisée dans les PDF.

Les contrastes chauds, les formes arrondies et le mouvement de [Karburo](https://karburo.io/fr-fr/) ont servi de référence visuelle ; aucune illustration ou ressource du site n’est réutilisée. L’identité et la composition sont propres à AI Visibility OS.

## Mouvement utile

- Entrées décalées des cartes, transition de page et indicateur actif de navigation animé.
- Ouverture/fermeture des fenêtres, transitions des étapes d’onboarding et retours sur les boutons/formulaires.
- Apparition des valeurs et tracé des graphiques issus de mesures réelles. Le polling ne remonte pas les formulaires et ne relance pas un graphique inchangé.
- Orbites décoratives sur la connexion, lumières d’arrière-plan, indicateur du worker et chargement. Les illustrations ne représentent aucun score ni résultat de mesure.

Le bouton **Animations** met en pause les mouvements CSS et JavaScript. La préférence système `prefers-reduced-motion` reste prioritaire. Aucun mouvement n’est nécessaire pour lire une donnée ou réaliser une action. Les animations permanentes utilisent les transformations et l’opacité ; les illustrations complexes sont masquées sur les petits écrans.

## Comportements accessibles

- Fenêtres natives `<dialog>` nommées, fermeture avec Échap, restitution du focus et arrière-plan non défilable.
- Navigation mobile avec arrière-plan inerte, boucle de focus, fermeture clavier et retour au bouton Menu.
- Lien d’évitement, labels de formulaires, état courant de navigation et préférence de mouvement exposés aux technologies d’assistance.
- Champs de 16 px sur mobile pour éviter le zoom automatique ; tableaux défilants dans leur propre conteneur.
- Tests de navigation Chromium et WebKit, formats de 320 à 1440 px, thèmes, langue, mouvement réduit et stockage navigateur indisponible. Ces contrôles ne constituent pas une certification WCAG ni un test sur tous les appareils physiques.

## Maintenance

Les tokens et styles se trouvent dans `src/app/globals.css`, la préférence partagée dans `src/components/ui/motion.tsx`, et le comportement du menu dans `use-mobile-navigation.ts`. Ne pas indexer les transitions sur une réponse de polling. Toute nouvelle animation doit consulter `useMotionPreferences` ou respecter le sélecteur `data-motion="reduced"` et la media query système.

Références : [Motion pour React](https://motion.dev/docs/react), [accessibilité de Motion](https://motion.dev/docs/react-accessibility).

## English

The amber-and-ink interface uses locally served Manrope, translucent surfaces and a floating navigation. Motion covers page/card entrances, active navigation, dialogs, onboarding, controls and real-data charts. Background illustrations do not depict measurements. Theme, language and animation preferences persist when browser storage is available; restricted storage does not break sign-in.

The **Animations** control pauses decorative motion. OS reduced-motion preferences take priority, including live changes. Native dialogs restore focus; the mobile drawer traps keyboard focus and makes the background inert. Chromium and WebKit checks cover the phone layout, keyboard navigation, preferences and restricted storage. This is not a WCAG certification or a physical-device compatibility guarantee.
