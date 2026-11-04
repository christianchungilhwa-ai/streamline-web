import { createContext, useContext, useEffect } from "react";

/** AppShell provides a setter; pages report their title so the mobile top
 *  bar (and the browser tab) show it. */
export const PageTitleContext = createContext<(title: string | null) => void>(() => {});

export function usePageTitle(title: string | null | undefined) {
  const setTitle = useContext(PageTitleContext);
  useEffect(() => {
    const t = title ?? null;
    setTitle(t);
    document.title = t ? `${t} · Streamline` : "Streamline";
    return () => {
      setTitle(null);
      document.title = "Streamline";
    };
  }, [title, setTitle]);
}
