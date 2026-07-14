'use strict';

const sanitizeHtml = require('sanitize-html');

/**
 * Server-side output-safety for user-generated content, backing the
 * defence-in-depth XSS strategy:
 *
 *   1. Input validation (express-validator) rejects malformed data.
 *   2. **These sanitizers** strip dangerous markup BEFORE it is persisted, so a
 *      stored payload can never re-enter a response as executable HTML.
 *   3. The React client renders everything as text (auto-escaped), and a strict
 *      CSP blocks inline/injected scripts.
 *
 * `sanitize-html` removes, by construction: <script>/<style> (tag + content),
 * any tag not on the allow-list, every event-handler attribute (onclick,
 * onerror, …) and any `javascript:`/`data:` URL scheme not explicitly allowed.
 */

// Strip ALL markup — for short single-line fields (names, titles, category,
// location). The visible text is kept; every tag/attribute is discarded.
const PLAIN = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

// Restrictive allow-list for longer rich fields (event description, bio):
// basic formatting only, links limited to safe schemes, no attributes that
// could carry script (no style/on*), no images/iframes/objects.
const RICH = {
  allowedTags: ['b', 'i', 'em', 'strong', 'u', 'p', 'br', 'ul', 'ol', 'li', 'blockquote', 'a'],
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { a: ['http', 'https', 'mailto'] },
  disallowedTagsMode: 'discard',
  enforceHtmlBoundary: true,
};

/** Remove every tag/attribute, returning safe plain text. */
function sanitizePlain(input) {
  if (input === null || input === undefined) return input;
  return sanitizeHtml(String(input), PLAIN).trim();
}

/** Keep a small allow-list of formatting tags; strip everything dangerous. */
function sanitizeRich(input) {
  if (input === null || input === undefined) return input;
  return sanitizeHtml(String(input), RICH).trim();
}

module.exports = { sanitizePlain, sanitizeRich, PLAIN, RICH };
