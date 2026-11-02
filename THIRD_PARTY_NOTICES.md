# Third-party notices

The original application is licensed under [AGPL-3.0-only](LICENSE). Third-party components retain their own licenses and copyright notices.

- JavaScript dependencies are pinned in `package-lock.json`. `scripts/third-party-notices.mjs` inventories installed production packages and preserves upstream license, notice and README files. Both Docker application images include this material at `/app/third-party`, with the application license at `/app/LICENSE`.
- A release bundle includes a CycloneDX software bill of materials generated from the lockfile with `npm sbom`, and a notices archive for the operating system on which it was assembled. Platform-specific optional packages vary; the Docker images contain their own matching notices.
- **Manrope** and **Noto Sans** font packages use SIL OFL 1.1. Their notices are preserved. The unmodified **Noto Sans CJK SC** font, pinned source and OFL text are in [src/assets/fonts](src/assets/fonts/README.md).
- **png-js 2.0.0** ships the full MIT license but omits its npm `license` property. The inventory records MIT only after checking its included license file.
- **Sharp** uses prebuilt **libvips** and other native libraries. Their upstream README lists LGPL and other licenses, and `versions.json` records the native dependency versions. These files are preserved in the notices bundle; see [sharp-libvips](https://github.com/lovell/sharp-libvips). Native binaries are obtained through the locked upstream packages when building; no separately maintained binary registry is provided by this beta.
- **caniuse-lite** data is licensed under CC-BY-4.0; its original notices and source attribution are preserved in the inventory.
- The application logo in `src/assets/brand-mark.png` was provided by the repository maintainer. Third-party names and trademarks in the interface identify API providers and do not imply endorsement. Test screenshots are marked as configuration-only or synthetic evidence, not customer results.

This is a component inventory and attribution record, not a blanket legal certification. Redistribution of modified builds or additional third-party assets requires checking their applicable terms. Source-code publication does not grant rights in third-party trademarks.
