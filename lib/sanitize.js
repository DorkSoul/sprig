'use strict';

// Shared, zero-dependency HTML sanitizer used for any user-supplied HTML that will
// later be rendered via innerHTML (note content, template content). Regex sanitizers
// are inherently fragile against novel obfuscation; this is a deliberate tradeoff to
// avoid a dependency. Keep the checks broad.

const ALLOWED_TAGS = new Set([
  'p','br','strong','em','u','s','h1','h2','h3',
  'ul','ol','li','blockquote','code','pre','a','hr','span','img','input',
  'table','thead','tbody','tr','th','td',
]);

const ALLOWED_ATTRS = {
  a: ['href', 'target', 'rel', 'class'],
  span: ['class'],
  code: ['class'],
  pre: ['class'],
  img: ['src', 'alt', 'style'],
  input: ['type', 'checked'],
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

// Returns true if a URL attribute value resolves to a dangerous scheme once
// whitespace, control characters, and HTML entities are normalized away.
function isDangerousUrl(val) {
  const normalized = val
    // Decode numeric/entity forms that could hide a scheme (e.g. &#106;avascript:).
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&colon;/gi, ':')
    // Decode named whitespace/control entities the browser would resolve inside an
    // attribute value (e.g. javascr&Tab;ipt: -> javascript: once the URL parser
    // drops the tab). These are stripped by the control-char removal below.
    .replace(/&Tab;/gi, '\t')
    .replace(/&NewLine;/gi, '\n')
    // Drop all whitespace and control chars, then lowercase for scheme matching.
    .replace(/[\x00-\x20]+/g, '')
    .toLowerCase();
  return /^(javascript|vbscript|data):/.test(normalized);
}

function sanitizeHTML(html) {
  if (typeof html !== 'string') return '';

  // Strip script/style/iframe blocks entirely, including content. Loop so nested or
  // overlapping constructs (e.g. <script><script>) are fully removed, and also drop
  // any lone/unterminated opening or closing tags of these elements.
  let prev;
  do {
    prev = html;
    html = html.replace(/<(script|style|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  } while (html !== prev);
  html = html.replace(/<\/?(?:script|style|iframe)\b[^>]*>?/gi, '');

  // Process tags. The attribute matcher tolerates '>' inside quoted attribute values.
  // The bare-character class excludes quotes ([^>"']) so each quote can only start a
  // quoted string, making the alternation unambiguous and immune to the exponential
  // backtracking (ReDoS) that [^>] would allow on unbalanced quotes.
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/g, (match, tag, attrs) => {
    const lower = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(lower)) return '';

    const isClosing = match.startsWith('</');
    if (isClosing) return `</${lower}>`;

    const selfClosing = ['br', 'hr', 'img', 'input'].includes(lower);
    const allowed = ALLOWED_ATTRS[lower] || [];
    let cleaned = '';

    for (const attr of allowed) {
      if (attr === 'checked') {
        if (/\bchecked\b/i.test(attrs)) cleaned += ' checked';
        continue;
      }
      const re = new RegExp(`\\b${attr}\\s*=\\s*(?:"([^"]*?)"|'([^']*?)'|([^\\s>]+))`, 'i');
      const m = attrs.match(re);
      if (m) {
        const val = (m[1] ?? m[2] ?? m[3]).trim();
        if ((attr === 'href' || attr === 'src') && isDangerousUrl(val)) continue;
        if (attr === 'type' && lower === 'input' && val.toLowerCase() !== 'checkbox') continue;
        if (attr === 'style') {
          const safe = (val.match(/(?:width|height)\s*:\s*[\d.]+(?:px|%)?/gi) || []).join('; ');
          if (safe) cleaned += ` style="${safe}"`;
          continue;
        }
        cleaned += ` ${attr}="${val.replace(/"/g, '&quot;')}"`;
      }
    }

    return selfClosing ? `<${lower}${cleaned}>` : `<${lower}${cleaned}>`;
  });

  return html;
}

module.exports = { sanitizeHTML, isDangerousUrl, ALLOWED_TAGS, ALLOWED_ATTRS };
