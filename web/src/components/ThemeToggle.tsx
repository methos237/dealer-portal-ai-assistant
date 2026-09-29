"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "./icons";

type Theme = "light" | "dark";

const media = () => matchMedia("(prefers-color-scheme: dark)");

/** Saved choice on <html data-theme> wins; otherwise the OS setting, as the CSS light-dark() sees it. */
const read = (): Theme =>
  (document.documentElement.dataset.theme as Theme | undefined) ??
  (media().matches ? "dark" : "light");

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const m = media();
  m.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    m.removeEventListener("change", onChange);
  };
}

/** Flips <html data-theme>; the cookie lets the server render the choice on the next load. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "light" as Theme);
  const dark = theme === "dark";

  function toggle() {
    const next: Theme = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-pressed={dark}
      className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {dark ? <Sun /> : <Moon />}
    </button>
  );
}
