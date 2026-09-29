"use client";

import { useEffect } from "react";

/**
 * Attaches a single mousemove listener that updates --mx/--my
 * CSS custom properties on any .spotlight element under the cursor.
 * Lets us drive `.spotlight::before` (radial gradient at cursor)
 * without per-component wiring.
 */
export default function SpotlightRoot() {
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const el = target.closest(".spotlight") as HTMLElement | null;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      el.style.setProperty("--mx", `${x}%`);
      el.style.setProperty("--my", `${y}%`);
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return null;
}
