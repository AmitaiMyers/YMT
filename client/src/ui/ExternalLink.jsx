import { ExternalLink as ExternalIcon } from 'lucide-react';

/** Link that leaves the app. URLs are always rendered LTR. */
export function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline decoration-from-font underline-offset-2 [overflow-wrap:anywhere]">
      <bdi dir={children ? undefined : 'ltr'}>{children ?? href}</bdi>
      <ExternalIcon aria-hidden="true" size={13} className="shrink-0" />
    </a>
  );
}
