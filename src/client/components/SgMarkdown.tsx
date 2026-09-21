import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sgAssetUrl } from "@/lib/studyguideApi";
import { DrawioDiagram } from "./DrawioDiagram";
import { SgPairTabs } from "./SgPairTabs";

/**
 * The studyguide's markdown renderer — one ReactMarkdown config shared
 * by the top-level document and the nested sg-pair tab content so both
 * render identically:
 *
 *   - relative `studyguide_images/<file>` image srcs are rewritten to
 *     the proxy's sg-asset route via urlTransform (contract C2);
 *   - `language-drawio` fences render as inline diagrams (C3);
 *   - `language-sg-pair` fences render as a two-tab switcher whose
 *     tab content recurses through this same component (C4);
 *   - while a per-section regenerate is in flight, the matching H2
 *     gets an inline spinner.
 */
export function SgMarkdown({
  markdown,
  lectureId,
  regeneratingTitle,
}: {
  markdown: string;
  lectureId: string;
  /** Blueprint title of the section currently being regenerated —
   *  its `##` heading shows an in-progress spinner. */
  regeneratingTitle?: string | null;
}) {
  const urlTransform = (url: string): string | null => {
    if (url.startsWith("studyguide_images/")) {
      return sgAssetUrl(lectureId, url.slice("studyguide_images/".length));
    }
    return defaultUrlTransform(url) || null;
  };

  const components: Components = {
    // Fenced code: route our structured block languages to their
    // dedicated components; everything else stays a plain code tag.
    code({ node, className, children, ...props }) {
      const lang = languageOf(className);
      if (lang === "drawio") {
        return <DrawioDiagram xml={fenceText(children)} />;
      }
      if (lang === "sg-pair") {
        return (
          <SgPairTabs
            data={fenceText(children)}
            renderMarkdown={(md) => <SgMarkdown markdown={md} lectureId={lectureId} />}
          />
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    // Unwrap the <pre> around our structured blocks — a diagram or a
    // tab switcher inside a styled <pre> card would double-frame it.
    pre({ node, children, ...props }) {
      const lang = preFenceLanguage(node);
      if (lang === "drawio" || lang === "sg-pair") {
        return <>{children}</>;
      }
      return <pre {...props}>{children}</pre>;
    },
    h2({ node, children, ...props }) {
      const active =
        !!regeneratingTitle &&
        flattenText(children).trim().toLowerCase() === regeneratingTitle.trim().toLowerCase();
      return (
        <h2 {...props} className={cn(active && "sg-h2-regenerating")}>
          {children}
          {active && (
            <Loader2
              className="ml-2 inline h-4 w-4 animate-spin align-middle text-primary"
              aria-label="Regenerating section"
            />
          )}
        </h2>
      );
    },
    img({ node, ...props }) {
      return <img loading="lazy" {...props} />;
    },
  };

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={urlTransform} components={components}>
      {markdown}
    </ReactMarkdown>
  );
}

function languageOf(className: string | undefined): string | null {
  const m = /language-([\w-]+)/.exec(className ?? "");
  return m ? m[1] : null;
}

/** Language of the code child inside a <pre> hast node, if any. */
function preFenceLanguage(node: unknown): string | null {
  const children = (node as { children?: unknown[] } | undefined)?.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const el = child as {
      tagName?: string;
      properties?: { className?: unknown };
    };
    if (el?.tagName !== "code") continue;
    const cls = el.properties?.className;
    const list = Array.isArray(cls) ? cls : typeof cls === "string" ? [cls] : [];
    for (const c of list) {
      const lang = languageOf(String(c));
      if (lang) return lang;
    }
  }
  return null;
}

/** Text of a fenced block's children (a string, or an array of them). */
function fenceText(children: ReactNode): string {
  return flattenText(children).replace(/\n$/, "");
}

function flattenText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: ReactNode }).children);
  }
  return "";
}
