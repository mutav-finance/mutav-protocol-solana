import type { FocusEvent, PointerEvent } from "react";

/**
 * Marks a control focused by a pointer (`data-mouse-focus`) until it blurs,
 * so tab-like controls can drop the amber focus box on a click
 * (`data-[mouse-focus]:outline-none`) while keyboard focus keeps the
 * global `:focus-visible` ring. Arrow keys move focus to a sibling, which
 * carries no mark, so keyboard users still see the ring there.
 */
export const mouseFocusProps = {
  onPointerDown: (e: PointerEvent<HTMLElement>) => e.currentTarget.setAttribute("data-mouse-focus", ""),
  onBlur: (e: FocusEvent<HTMLElement>) => e.currentTarget.removeAttribute("data-mouse-focus"),
};
