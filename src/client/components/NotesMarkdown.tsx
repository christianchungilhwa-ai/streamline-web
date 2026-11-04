import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

/**
 * A slide's AI notes. The server's notes generator writes markdown plus
 * two inline HTML highlight tiers from its emphasis hierarchy (see
 * `generate_notes` in Streamline-Server api_clients.py):
 *
 *   - `<mark>…</mark>` — yellow "memorize this" lines;
 *   - `<span class="hl-red">…</span>` — red top-tier callouts.
 *
 * rehype-raw parses that HTML; `ALLOWED` then unwraps every other element
 * to its text, so model output can't inject arbitrary markup (iframes,
 * images, styles) into the viewer.
 */
const ALLOWED = [
  "p", "strong", "em", "del", "br", "hr",
  "ul", "ol", "li", "blockquote", "code", "pre", "a",
  "h1", "h2", "h3", "h4",
  "table", "thead", "tbody", "tr", "th", "td",
  "mark", "span",
];

const components: Components = {
  // Keep only the one span class the generator emits; drop any other
  // attributes raw HTML may carry.
  span({ className, children }) {
    return <span className={className === "hl-red" ? "notes-hl-red" : undefined}>{children}</span>;
  },
  mark({ children }) {
    return <mark>{children}</mark>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  },
  // Wide tables scroll inside their own box instead of pushing the card
  // sideways on phones (styles: .prose-table-wrap in index.css). Raw-HTML
  // attributes are dropped, same as span/mark above.
  table({ children }) {
    return (
      <div className="prose-table-wrap">
        <table>{children}</table>
      </div>
    );
  },
};

export function NotesMarkdown({ markdown }: { markdown: string }) {
  return (
    <div className="notes-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
