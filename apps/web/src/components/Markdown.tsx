// apps/web/src/components/Markdown.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Markdown({ text }: { text: string }) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({node, ...props}) => (
            <a {...props} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline" />
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
