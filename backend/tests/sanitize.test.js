'use strict';

const { sanitizePlain, sanitizeRich } = require('../src/utils/sanitize');

describe('sanitizePlain (short fields: names, titles, category, location)', () => {
  test('removes <script> tag and its contents entirely', () => {
    expect(sanitizePlain("<script>alert('XSS')</script>")).toBe('');
  });

  test('strips markup but keeps the visible text', () => {
    expect(sanitizePlain('<b>Alice</b>')).toBe('Alice');
  });

  test('removes an image with an onerror event handler', () => {
    expect(sanitizePlain('<img src=x onerror=alert(1)>')).toBe('');
  });

  test('neutralises a javascript: link, keeping only the text', () => {
    expect(sanitizePlain('<a href="javascript:alert(1)">click</a>')).toBe('click');
  });

  test('preserves safe plain text and apostrophes/quotes', () => {
    expect(sanitizePlain("O'Brien said \"hi\"")).toBe('O\'Brien said "hi"');
    expect(sanitizePlain('Hello World')).toBe('Hello World');
  });

  test('handles null/undefined without throwing', () => {
    expect(sanitizePlain(null)).toBeNull();
    expect(sanitizePlain(undefined)).toBeUndefined();
  });
});

describe('sanitizeRich (long fields: event description, bio)', () => {
  test('removes <script> but keeps allow-listed formatting', () => {
    expect(sanitizeRich('<script>alert(1)</script><b>keep</b>')).toBe('<b>keep</b>');
  });

  test('drops a javascript: href from an anchor', () => {
    const out = sanitizeRich('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/href=/i);
  });

  test('keeps a safe https href', () => {
    expect(sanitizeRich('<a href="https://ok.com">ok</a>'))
      .toBe('<a href="https://ok.com">ok</a>');
  });

  test('strips inline event-handler attributes', () => {
    const out = sanitizeRich('<p onclick="evil()">para</p>');
    expect(out).toBe('<p>para</p>');
    expect(out).not.toMatch(/onclick/i);
  });

  test('removes disallowed tags like <img> entirely', () => {
    expect(sanitizeRich('<img src=x onerror=alert(1)>desc')).toBe('desc');
  });
});
