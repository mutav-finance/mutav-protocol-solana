/**
 * ImageSlot — a named, decorative image frame. Until a slot has a file in
 * IMAGE_SLOTS it renders a brand placeholder (1px border, hairline cross, the
 * slot name and aspect) so layouts can be tuned before the final photos land.
 *
 * Photography is a founder-approved exception to STYLE.md: licensed, grayscale,
 * opacity ≤ 0.2, decorative only (alt=""), never behind numbers. Children sit
 * above the image (headlines or a CTA, never figures).
 */
import type { ReactNode } from "react";

/** Slot → public path. `null` shows the placeholder; set a path to place the final photo. */
export const IMAGE_SLOTS = {
  "reserve-coverage": null,
  "reserve-claims": null,
  "reserve-disclosures": null,
  "reserve-risks": null,
} satisfies Record<string, string | null>;

export type ImageSlotName = keyof typeof IMAGE_SLOTS;

/** `fill`: cover the positioned parent (a background behind a tile's text) instead of sitting in the flow. */
export function ImageSlot({ slot, aspect, className = "", opacity = 0.16, fill = false, children }: { slot: ImageSlotName; aspect: string; className?: string; opacity?: number; fill?: boolean; children?: ReactNode }) {
  const src: string | null = IMAGE_SLOTS[slot];
  return (
    <div className={`overflow-hidden ${fill ? "absolute inset-0" : "bg-(--color-surface) relative border"} ${className}`} data-image-slot={slot}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover grayscale" style={{ opacity: Math.min(opacity, 0.2) }} />
      ) : (
        <div aria-hidden="true" className="absolute inset-0">
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
            <line x1="0" y1="0" x2="100" y2="100" stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <line x1="100" y1="0" x2="0" y2="100" stroke="var(--color-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="font-mono text-(--color-text-3) absolute top-3 right-3 text-2xs uppercase" style={{ letterSpacing: "0.08em" }}>
            image · {slot} · {aspect}
          </span>
        </div>
      )}
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}
