import { useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { FileText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Tab switcher for `sg-pair` fenced blocks in the resolved studyguide
 * (contract C4): `{"tabs":[{"label":"From Slide","content":…},
 * {"label":"Visualization","content":…}]}` with markdown content per
 * tab.
 *
 * Mirrors the Mac app's folder-tab UI (StudyguideView.swift, itself a
 * port of Audiofile's "From PDF | Visualization" idiom): tabs sit ON
 * TOP of the content card with rounded top corners and overlap its
 * border, and when the right tab is active the card's top-corner
 * rounding flips so the active tab visually merges with the card.
 *
 * Both panels stay mounted (inactive one display:none) so the print
 * stylesheet can unwind the tabs into labeled stacked panels — same
 * treatment as the Mac's PDF export.
 *
 * Keyboard: standard WAI-ARIA tabs — roving tabindex, Left/Right/
 * Home/End move focus and select.
 */

interface SgPairTab {
  label: string;
  content: string;
}

function parseTabs(data: string): SgPairTab[] | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    const tabs = (parsed as { tabs?: unknown }).tabs;
    if (!Array.isArray(tabs)) return null;
    const out = tabs.flatMap((t): SgPairTab[] => {
      if (!t || typeof t !== "object") return [];
      const rec = t as Record<string, unknown>;
      if (typeof rec.content !== "string") return [];
      return [
        {
          label: typeof rec.label === "string" && rec.label.trim() ? rec.label : "View",
          content: rec.content,
        },
      ];
    });
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function SgPairTabs({
  data,
  renderMarkdown,
}: {
  /** Raw JSON body of the sg-pair fenced block. */
  data: string;
  /** Nested markdown renderer — the caller passes its own configured
   *  markdown component so tab content renders identically to the
   *  surrounding studyguide (including images and diagrams). */
  renderMarkdown: (markdown: string) => ReactNode;
}) {
  const id = useId();
  const tabs = useMemo(() => parseTabs(data), [data]);
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  if (!tabs) {
    // Malformed JSON (writer slip) — show the raw block rather than
    // nothing, matching the app's graceful-degradation posture.
    return (
      <pre>
        <code>{data}</code>
      </pre>
    );
  }

  const select = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        select(active - 1);
        break;
      case "ArrowRight":
        e.preventDefault();
        select(active + 1);
        break;
      case "Home":
        e.preventDefault();
        select(0);
        break;
      case "End":
        e.preventDefault();
        select(tabs.length - 1);
        break;
    }
  };

  return (
    <div className="sg-pair">
      <div
        role="tablist"
        aria-label="Visual source"
        className="sg-pair-tab-bar"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, i) => (
          <button
            key={i}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === active}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === active ? 0 : -1}
            className={cn("sg-pair-tab", i === active && "sg-pair-tab-active")}
            onClick={() => setActive(i)}
          >
            {i === 0 ? (
              <FileText className="h-3.5 w-3.5 text-primary" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-purple-400" aria-hidden />
            )}
            {tab.label}
          </button>
        ))}
      </div>
      <div className={cn("sg-pair-content", active > 0 && "sg-pair-right-active")}>
        {tabs.map((tab, i) => (
          <div
            key={i}
            role="tabpanel"
            id={`${id}-panel-${i}`}
            aria-labelledby={`${id}-tab-${i}`}
            data-label={tab.label}
            tabIndex={0}
            className={cn("sg-pair-panel", i !== active && "sg-pair-panel-hidden")}
          >
            {renderMarkdown(tab.content)}
          </div>
        ))}
      </div>
    </div>
  );
}
