"use client";

import { useEffect } from "react";

export function FixStuckUI() {
  useEffect(() => {
    const html = document.documentElement;

    const hasAnyOpenOverlay = () => {
      // Radix dialog/sheet มักมี data-state="open"
      if (document.querySelector('[data-state="open"]')) return true;

      // fallback: role dialog (บางกรณี)
      if (document.querySelector('[role="dialog"]')) return true;

      return false;
    };

    const fix = () => {
      // ถ้าไม่มี overlay เปิดอยู่ แต่ prevent-scroll ค้าง ให้ลบ
      if (!hasAnyOpenOverlay() && html.classList.contains("prevent-scroll")) {
        html.classList.remove("prevent-scroll");
      }

      // ถ้า body ถูกล็อกคลิกค้าง ให้คืนค่า
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    };

    fix();

    const mo = new MutationObserver(() => fix());
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    mo.observe(document.body, { childList: true, subtree: true });

    const t = window.setInterval(fix, 500);

    return () => {
      mo.disconnect();
      window.clearInterval(t);
    };
  }, []);

  return null;
}
