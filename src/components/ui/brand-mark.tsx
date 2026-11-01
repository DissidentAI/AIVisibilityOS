import Image from "next/image";
import mark from "@/assets/brand-mark.png";

/** The supplied A/star artwork, unchanged; the adjacent wordmark is its accessible name. */
export function BrandMark({ large = false }: { large?: boolean }) {
  return (
    <span className={`brand-mark${large ? " brand-mark-large" : ""}`} aria-hidden="true">
      <Image
        src={mark}
        alt=""
        width={large ? 88 : 48}
        height={large ? 88 : 48}
        sizes={large ? "88px" : "48px"}
      />
    </span>
  );
}
