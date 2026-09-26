import { useEffect, useState } from "react";

export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      const alignedViewport = viewport && Math.abs(viewport.width - window.innerWidth) < 2;
      const height = alignedViewport ? viewport.height : window.innerHeight;
      const offset = alignedViewport ? viewport.offsetTop : 0;
      document.documentElement.style.setProperty("--viewport-height", `${height}px`);
      document.documentElement.style.setProperty("--viewport-top", `${offset}px`);
    };
    update();
    window.addEventListener("resize", update);
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
    };
  }, []);
}

export function useSystemTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setTheme(media.matches ? "dark" : "light");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return theme;
}
