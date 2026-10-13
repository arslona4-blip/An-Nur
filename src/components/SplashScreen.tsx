"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { PRODUCT_LOGO, PRODUCT_NAME, PRODUCT_TAGLINE, SPLASH_FADE_MS, SPLASH_SHOW_MS } from "@/lib/brand";

const SPLASH_KEY = "an-nur-splash-seen";

export function SplashScreen() {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const splashStyle = {
    "--splash-show": `${SPLASH_SHOW_MS}ms`,
    "--splash-fade": `${SPLASH_FADE_MS}ms`,
  } as CSSProperties;

  useEffect(() => {
    if (sessionStorage.getItem(SPLASH_KEY) || location.pathname === "/ekran" || location.pathname.startsWith("/chek/")) return;
    setVisible(true);
    document.body.classList.add("splash-lock");

    const fadeTimer = window.setTimeout(() => {
      setLeaving(true);
      sessionStorage.setItem(SPLASH_KEY, "1");
      document.body.classList.remove("splash-lock");
    }, SPLASH_SHOW_MS);
    const hideTimer = window.setTimeout(() => setVisible(false), SPLASH_SHOW_MS + SPLASH_FADE_MS);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(hideTimer);
      document.body.classList.remove("splash-lock");
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`splash-screen ${leaving ? "splash-screen--out" : ""}`}
      style={splashStyle}
      aria-hidden={leaving}
    >
      <div className="splash-screen__glow splash-screen__glow--1" />
      <div className="splash-screen__glow splash-screen__glow--2" />
      <div className="splash-screen__ring" />
      <div className="splash-screen__content">
        <div className="splash-screen__logo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PRODUCT_LOGO} alt={PRODUCT_NAME} className="splash-screen__logo" />
        </div>
        <div className="splash-screen__title">{PRODUCT_NAME}</div>
        <div className="splash-screen__tagline">{PRODUCT_TAGLINE.toUpperCase()}</div>
        <div className="splash-screen__loader">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
