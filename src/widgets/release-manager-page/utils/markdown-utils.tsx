import DOMPurify from 'dompurify';
import {marked} from 'marked';

// Configure marked for safe, basic markdown rendering suitable for description blocks
marked.setOptions({
  breaks: true,
  gfm: true
});

export function renderMarkdownToSafeHtml(markdown?: string): string {
  if (!markdown) {
    return '';
  }
  // Render markdown to HTML
  const rawHtml = marked.parse(markdown) as string;
  // Sanitize the HTML
  return DOMPurify.sanitize(rawHtml, {
    // Allow common formatting and links; images are allowed but could be restricted if needed
    ALLOWED_TAGS: [
      'a', 'b', 'i', 'em', 'strong', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'blockquote', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel']
  });
}
