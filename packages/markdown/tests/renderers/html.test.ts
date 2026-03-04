import { describe, it, expect } from "vitest";
import { HtmlRenderer } from "../../src/index.js";

describe("HtmlRenderer", () => {
  it("starts with empty html", () => {
    const r = new HtmlRenderer();
    expect(r.html).toBe("");
  });

  it("renders heading open/close", () => {
    const r = new HtmlRenderer();
    r.open({ type: "heading", attrs: { level: "2" } });
    r.text("Hello");
    r.close({ type: "heading", attrs: { level: "2" } });
    expect(r.html).toBe("<h2>Hello</h2>\n");
  });

  it("renders paragraph", () => {
    const r = new HtmlRenderer();
    r.open({ type: "paragraph", attrs: {} });
    r.text("Text");
    r.close({ type: "paragraph", attrs: {} });
    expect(r.html).toBe("<p>Text</p>\n");
  });

  it("renders code block with language", () => {
    const r = new HtmlRenderer();
    r.open({ type: "code_block", attrs: { lang: "js" } });
    r.text("const x = 1;");
    r.close({ type: "code_block", attrs: { lang: "js" } });
    expect(r.html).toBe(
      '<pre><code class="language-js">const x = 1;</code></pre>\n',
    );
  });

  it("renders code block without language", () => {
    const r = new HtmlRenderer();
    r.open({ type: "code_block", attrs: {} });
    r.text("code");
    r.close({ type: "code_block", attrs: {} });
    expect(r.html).toBe("<pre><code>code</code></pre>\n");
  });

  it("renders inline strong", () => {
    const r = new HtmlRenderer();
    r.open({ type: "strong", attrs: {} });
    r.text("bold");
    r.close({ type: "strong", attrs: {} });
    expect(r.html).toBe("<strong>bold</strong>");
  });

  it("renders inline emphasis", () => {
    const r = new HtmlRenderer();
    r.open({ type: "emphasis", attrs: {} });
    r.text("italic");
    r.close({ type: "emphasis", attrs: {} });
    expect(r.html).toBe("<em>italic</em>");
  });

  it("renders inline code", () => {
    const r = new HtmlRenderer();
    r.open({ type: "code", attrs: {} });
    r.text("x");
    r.close({ type: "code", attrs: {} });
    expect(r.html).toBe("<code>x</code>");
  });

  it("renders strikethrough", () => {
    const r = new HtmlRenderer();
    r.open({ type: "strikethrough", attrs: {} });
    r.text("gone");
    r.close({ type: "strikethrough", attrs: {} });
    expect(r.html).toBe("<del>gone</del>");
  });

  it("renders link", () => {
    const r = new HtmlRenderer();
    r.open({ type: "link", attrs: { href: "https://example.com" } });
    r.text("click");
    r.close({ type: "link", attrs: { href: "https://example.com" } });
    expect(r.html).toBe('<a href="https://example.com">click</a>');
  });

  it("renders image", () => {
    const r = new HtmlRenderer();
    r.open({ type: "image", attrs: { src: "pic.png", alt: "A picture" } });
    r.close({ type: "image", attrs: { src: "pic.png", alt: "A picture" } });
    expect(r.html).toBe('<img src="pic.png" alt="A picture">');
  });

  it("renders hr", () => {
    const r = new HtmlRenderer();
    r.open({ type: "hr", attrs: {} });
    r.close({ type: "hr", attrs: {} });
    expect(r.html).toBe("<hr>\n");
  });

  it("renders blockquote", () => {
    const r = new HtmlRenderer();
    r.open({ type: "blockquote", attrs: {} });
    r.text("quote");
    r.close({ type: "blockquote", attrs: {} });
    expect(r.html).toBe("<blockquote>quote</blockquote>\n");
  });

  it("renders ordered list", () => {
    const r = new HtmlRenderer();
    r.open({ type: "ordered_list", attrs: {} });
    r.open({ type: "list_item", attrs: {} });
    r.text("first");
    r.close({ type: "list_item", attrs: {} });
    r.close({ type: "ordered_list", attrs: {} });
    expect(r.html).toBe("<ol><li>first</li>\n</ol>\n");
  });

  it("renders unordered list", () => {
    const r = new HtmlRenderer();
    r.open({ type: "unordered_list", attrs: {} });
    r.open({ type: "list_item", attrs: {} });
    r.text("item");
    r.close({ type: "list_item", attrs: {} });
    r.close({ type: "unordered_list", attrs: {} });
    expect(r.html).toBe("<ul><li>item</li>\n</ul>\n");
  });

  it("renders line break", () => {
    const r = new HtmlRenderer();
    r.open({ type: "line_break", attrs: {} });
    r.close({ type: "line_break", attrs: {} });
    expect(r.html).toBe("<br>");
  });

  it("escapes HTML in text", () => {
    const r = new HtmlRenderer();
    r.text('<script>alert("xss")</script>');
    expect(r.html).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("escapes HTML in link href", () => {
    const r = new HtmlRenderer();
    r.open({ type: "link", attrs: { href: 'javascript:"alert(1)"' } });
    r.text("click");
    r.close({ type: "link", attrs: {} });
    expect(r.html).toContain("&quot;");
  });

  it("escapes HTML in code block language", () => {
    const r = new HtmlRenderer();
    r.open({ type: "code_block", attrs: { lang: '"><script>' } });
    r.close({ type: "code_block", attrs: {} });
    expect(r.html).toContain("&quot;&gt;&lt;script&gt;");
  });

  it("reset clears html", () => {
    const r = new HtmlRenderer();
    r.text("hello");
    expect(r.html).toBe("hello");
    r.reset();
    expect(r.html).toBe("");
  });
});
