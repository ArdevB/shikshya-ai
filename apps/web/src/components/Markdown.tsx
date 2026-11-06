import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

/** Renders teacher and admin markdown. Sanitized, so it cannot inject scripts into the page. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&_a]:text-primary-dark [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown>
    </div>
  );
}
