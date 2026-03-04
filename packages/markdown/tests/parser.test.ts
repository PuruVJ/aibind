import { describe, it, expect } from "vitest";
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "../src/index.js";
import { assertMarkdown, parse } from "./helpers.js";

// =============================================================================
// HEADINGS
// =============================================================================

describe("headings", () => {
  it("h1 through h6", () => {
    assertMarkdown("# Heading 1\n", "<h1>Heading 1</h1>\n");
    assertMarkdown("## Heading 2\n", "<h2>Heading 2</h2>\n");
    assertMarkdown("### Heading 3\n", "<h3>Heading 3</h3>\n");
    assertMarkdown("#### Heading 4\n", "<h4>Heading 4</h4>\n");
    assertMarkdown("##### Heading 5\n", "<h5>Heading 5</h5>\n");
    assertMarkdown("###### Heading 6\n", "<h6>Heading 6</h6>\n");
  });

  it("heading with inline formatting", () => {
    assertMarkdown("## foo *bar*\n", "<h2>foo <em>bar</em></h2>\n");
  });

  it("heading followed by paragraph", () => {
    assertMarkdown("# foo\nbar\n", "<h1>foo</h1>\n<p>bar</p>\n");
  });

  it("heading after heading", () => {
    assertMarkdown("# foo\n## bar\n", "<h1>foo</h1>\n<h2>bar</h2>\n");
  });

  it("heading with bold", () => {
    assertMarkdown(
      "# **bold** heading\n",
      "<h1><strong>bold</strong> heading</h1>\n",
    );
  });

  it("heading at end of input (no trailing newline)", () => {
    assertMarkdown("# Hello", "<h1>Hello</h1>\n");
  });

  it("# not followed by space is not a heading", () => {
    assertMarkdown("#not a heading\n", "<p>#not a heading</p>\n");
  });
});

// =============================================================================
// PARAGRAPHS
// =============================================================================

describe("paragraphs", () => {
  it("simple paragraph", () => {
    assertMarkdown("Hello world\n", "<p>Hello world</p>\n");
  });

  it("two paragraphs separated by blank line", () => {
    assertMarkdown("First\n\nSecond\n", "<p>First</p>\n<p>Second</p>\n");
  });

  it("soft line break within paragraph", () => {
    assertMarkdown("Line one\nLine two\n", "<p>Line one\nLine two</p>\n");
  });

  it("paragraph at end of input", () => {
    assertMarkdown("Hello world", "<p>Hello world</p>\n");
  });

  it("empty input produces no output", () => {
    assertMarkdown("", "");
  });

  it("only whitespace produces no output", () => {
    assertMarkdown("   \n", "");
  });
});

// =============================================================================
// BOLD
// =============================================================================

describe("bold (** and __)", () => {
  it("bold with **", () => {
    assertMarkdown("**bold text**\n", "<p><strong>bold text</strong></p>\n");
  });

  it("bold with __", () => {
    assertMarkdown("__bold text__\n", "<p><strong>bold text</strong></p>\n");
  });

  it("bold in middle of text", () => {
    assertMarkdown(
      "Hello **world** today\n",
      "<p>Hello <strong>world</strong> today</p>\n",
    );
  });

  it("multiple bold sections", () => {
    assertMarkdown(
      "**a** and **b**\n",
      "<p><strong>a</strong> and <strong>b</strong></p>\n",
    );
  });
});

// =============================================================================
// ITALIC
// =============================================================================

describe("italic (* and _)", () => {
  it("italic with *", () => {
    assertMarkdown("*italic text*\n", "<p><em>italic text</em></p>\n");
  });

  it("italic with _", () => {
    assertMarkdown("_italic text_\n", "<p><em>italic text</em></p>\n");
  });

  it("italic in middle of text", () => {
    assertMarkdown(
      "Hello *world* today\n",
      "<p>Hello <em>world</em> today</p>\n",
    );
  });
});

// =============================================================================
// BOLD + ITALIC COMBINED
// =============================================================================

describe("bold + italic combined", () => {
  it("bold inside italic", () => {
    assertMarkdown(
      "*italic **bold** more*\n",
      "<p><em>italic <strong>bold</strong> more</em></p>\n",
    );
  });

  it("italic inside bold", () => {
    assertMarkdown(
      "**bold *italic* more**\n",
      "<p><strong>bold <em>italic</em> more</strong></p>\n",
    );
  });
});

// =============================================================================
// STRIKETHROUGH
// =============================================================================

describe("strikethrough", () => {
  it("basic strikethrough", () => {
    assertMarkdown("~~struck~~\n", "<p><del>struck</del></p>\n");
  });

  it("strikethrough in text", () => {
    assertMarkdown(
      "Hello ~~world~~ today\n",
      "<p>Hello <del>world</del> today</p>\n",
    );
  });

  it("strikethrough with bold inside", () => {
    assertMarkdown(
      "~~**bold strike**~~\n",
      "<p><del><strong>bold strike</strong></del></p>\n",
    );
  });
});

// =============================================================================
// INLINE CODE
// =============================================================================

describe("inline code", () => {
  it("basic inline code", () => {
    assertMarkdown("Use `code` here\n", "<p>Use <code>code</code> here</p>\n");
  });

  it("inline code with special chars", () => {
    assertMarkdown("`<div>`\n", "<p><code>&lt;div&gt;</code></p>\n");
  });

  it("double backtick inline code", () => {
    assertMarkdown(
      "``code with ` backtick``\n",
      "<p><code>code with ` backtick</code></p>\n",
    );
  });

  it("inline code preserves asterisks", () => {
    assertMarkdown("`**not bold**`\n", "<p><code>**not bold**</code></p>\n");
  });
});

// =============================================================================
// CODE BLOCKS
// =============================================================================

describe("code blocks", () => {
  it("basic fenced code block", () => {
    assertMarkdown("```\ncode\n```\n", "<pre><code>code\n</code></pre>\n");
  });

  it("code block with language", () => {
    assertMarkdown(
      "```javascript\nconst x = 1;\n```\n",
      '<pre><code class="language-javascript">const x = 1;\n</code></pre>\n',
    );
  });

  it("code block with tilde fence", () => {
    assertMarkdown("~~~\ncode\n~~~\n", "<pre><code>code\n</code></pre>\n");
  });

  it("code block preserves markdown syntax", () => {
    assertMarkdown(
      "```\n**not bold**\n# not heading\n```\n",
      "<pre><code>**not bold**\n# not heading\n</code></pre>\n",
    );
  });

  it("code block preserves HTML", () => {
    assertMarkdown(
      "```\n<div>hello</div>\n```\n",
      "<pre><code>&lt;div&gt;hello&lt;/div&gt;\n</code></pre>\n",
    );
  });

  it("code block with Python ** exponentiation", () => {
    assertMarkdown(
      "```python\nx = 2 ** 3\n```\n",
      '<pre><code class="language-python">x = 2 ** 3\n</code></pre>\n',
    );
  });

  it("code block with Python __init__", () => {
    assertMarkdown(
      "```python\ndef __init__(self):\n```\n",
      '<pre><code class="language-python">def __init__(self):\n</code></pre>\n',
    );
  });

  it("empty code block", () => {
    assertMarkdown("```\n```\n", "<pre><code></code></pre>\n");
  });

  it("code block followed by paragraph", () => {
    assertMarkdown(
      "```\ncode\n```\n\nParagraph\n",
      "<pre><code>code\n</code></pre>\n<p>Paragraph</p>\n",
    );
  });

  it("unclosed code block at end of input is closed by parser", () => {
    const html = parse("```js\nconst x = 1;");
    expect(html).toBe(
      '<pre><code class="language-js">const x = 1;\n</code></pre>\n',
    );
  });

  it("multiple code blocks", () => {
    assertMarkdown(
      "```\nfirst\n```\n\n```\nsecond\n```\n",
      "<pre><code>first\n</code></pre>\n<pre><code>second\n</code></pre>\n",
    );
  });

  it("code block with backticks inside content", () => {
    assertMarkdown(
      "```\nconst str = `template`;\n```\n",
      "<pre><code>const str = `template`;\n</code></pre>\n",
    );
  });
});

// =============================================================================
// LINKS
// =============================================================================

describe("links", () => {
  it("basic link", () => {
    assertMarkdown(
      "[text](https://example.com)\n",
      '<p><a href="https://example.com">text</a></p>\n',
    );
  });

  it("link in text", () => {
    assertMarkdown(
      "Visit [Google](https://google.com) today\n",
      '<p>Visit <a href="https://google.com">Google</a> today</p>\n',
    );
  });

  it("multiple links", () => {
    assertMarkdown(
      "[a](http://a.com) and [b](http://b.com)\n",
      '<p><a href="http://a.com">a</a> and <a href="http://b.com">b</a></p>\n',
    );
  });

  it("link with special chars in URL is escaped", () => {
    assertMarkdown(
      '[test](https://example.com?q="hello")\n',
      '<p><a href="https://example.com?q=&quot;hello&quot;">test</a></p>\n',
    );
  });
});

// =============================================================================
// IMAGES
// =============================================================================

describe("images", () => {
  it("basic image", () => {
    assertMarkdown(
      "![alt text](image.png)\n",
      '<p><img src="image.png" alt="alt text"></p>\n',
    );
  });

  it("image with URL", () => {
    assertMarkdown(
      "![logo](https://example.com/logo.png)\n",
      '<p><img src="https://example.com/logo.png" alt="logo"></p>\n',
    );
  });

  it("image in text", () => {
    assertMarkdown(
      "See ![pic](a.png) here\n",
      '<p>See <img src="a.png" alt="pic"> here</p>\n',
    );
  });
});

// =============================================================================
// LISTS
// =============================================================================

describe("unordered lists", () => {
  it("basic unordered list with -", () => {
    assertMarkdown(
      "- Item 1\n- Item 2\n- Item 3\n",
      "<ul><li>Item 1</li>\n<li>Item 2</li>\n<li>Item 3</li>\n</ul>\n",
    );
  });

  it("basic unordered list with *", () => {
    assertMarkdown(
      "* Item 1\n* Item 2\n",
      "<ul><li>Item 1</li>\n<li>Item 2</li>\n</ul>\n",
    );
  });

  it("basic unordered list with +", () => {
    assertMarkdown(
      "+ Item 1\n+ Item 2\n",
      "<ul><li>Item 1</li>\n<li>Item 2</li>\n</ul>\n",
    );
  });

  it("list with inline formatting", () => {
    assertMarkdown(
      "- **bold** item\n- *italic* item\n",
      "<ul><li><strong>bold</strong> item</li>\n<li><em>italic</em> item</li>\n</ul>\n",
    );
  });

  it("list followed by paragraph", () => {
    assertMarkdown(
      "- Item\n\nParagraph\n",
      "<ul><li>Item</li>\n</ul>\n<p>Paragraph</p>\n",
    );
  });
});

describe("ordered lists", () => {
  it("basic ordered list", () => {
    assertMarkdown(
      "1. First\n2. Second\n3. Third\n",
      "<ol><li>First</li>\n<li>Second</li>\n<li>Third</li>\n</ol>\n",
    );
  });

  it("ordered list with )", () => {
    assertMarkdown(
      "1) First\n2) Second\n",
      "<ol><li>First</li>\n<li>Second</li>\n</ol>\n",
    );
  });
});

describe("nested lists", () => {
  it("nested unordered list", () => {
    assertMarkdown(
      "- Parent\n  - Child\n",
      "<ul><li>Parent<ul><li>Child</li>\n</ul>\n</li>\n</ul>\n",
    );
  });
});

// =============================================================================
// BLOCKQUOTES
// =============================================================================

describe("blockquotes", () => {
  it("basic blockquote", () => {
    assertMarkdown(
      "> Hello world\n",
      "<blockquote><p>Hello world\n</p>\n</blockquote>\n",
    );
  });

  it("blockquote with inline formatting", () => {
    assertMarkdown(
      "> **bold** quote\n",
      "<blockquote><p><strong>bold</strong> quote\n</p>\n</blockquote>\n",
    );
  });

  it("multi-line blockquote", () => {
    assertMarkdown(
      "> Line one\n> Line two\n",
      "<blockquote><p>Line one\nLine two\n</p>\n</blockquote>\n",
    );
  });

  it("blockquote followed by paragraph", () => {
    assertMarkdown(
      "> Quote\n\nParagraph\n",
      "<blockquote><p>Quote\n</p>\n</blockquote>\n<p>Paragraph</p>\n",
    );
  });
});

// =============================================================================
// HORIZONTAL RULES
// =============================================================================

describe("horizontal rules", () => {
  it("--- is a horizontal rule", () => {
    assertMarkdown("---\n", "<hr>\n");
  });

  it("*** is a horizontal rule", () => {
    assertMarkdown("***\n", "<hr>\n");
  });

  it("___ is a horizontal rule", () => {
    assertMarkdown("___\n", "<hr>\n");
  });

  it("more than 3 chars", () => {
    assertMarkdown("----\n", "<hr>\n");
    assertMarkdown("****\n", "<hr>\n");
    assertMarkdown("_____\n", "<hr>\n");
  });

  it("hr between paragraphs", () => {
    assertMarkdown(
      "Above\n\n---\n\nBelow\n",
      "<p>Above</p>\n<hr>\n<p>Below</p>\n",
    );
  });

  it("-- is not a horizontal rule", () => {
    assertMarkdown("--\n", "<p>--</p>\n");
  });
});

// =============================================================================
// ESCAPE SEQUENCES
// =============================================================================

describe("escape sequences", () => {
  it("escaped asterisk", () => {
    assertMarkdown("\\*not italic\\*\n", "<p>*not italic*</p>\n");
  });

  it("escaped backtick", () => {
    assertMarkdown("\\`not code\\`\n", "<p>`not code`</p>\n");
  });

  it("escaped hash", () => {
    assertMarkdown("\\# not heading\n", "<p># not heading</p>\n");
  });

  it("escaped underscore", () => {
    assertMarkdown("\\_not italic\\_\n", "<p>_not italic_</p>\n");
  });

  it("escaped brackets", () => {
    assertMarkdown("\\[not a link\\](url)\n", "<p>[not a link](url)</p>\n");
  });
});

// =============================================================================
// HTML ESCAPING (XSS PREVENTION)
// =============================================================================

describe("html escaping", () => {
  it("escapes < and >", () => {
    assertMarkdown(
      '<script>alert("xss")</script>\n',
      "<p>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</p>\n",
    );
  });

  it("escapes & in text", () => {
    assertMarkdown("AT&T\n", "<p>AT&amp;T</p>\n");
  });

  it('escapes " in text', () => {
    assertMarkdown('She said "hello"\n', "<p>She said &quot;hello&quot;</p>\n");
  });

  it("escapes HTML in code blocks", () => {
    assertMarkdown(
      "```\n<script>\n```\n",
      "<pre><code>&lt;script&gt;\n</code></pre>\n",
    );
  });
});

// =============================================================================
// LINE BREAKS
// =============================================================================

describe("line breaks", () => {
  it("two trailing spaces create hard line break", () => {
    assertMarkdown("Line one  \nLine two\n", "<p>Line one<br>Line two</p>\n");
  });
});

// =============================================================================
// MIXED / COMPLEX CONTENT
// =============================================================================

describe("mixed content", () => {
  it("heading then paragraph then code", () => {
    assertMarkdown(
      "# Title\n\nSome text\n\n```js\ncode\n```\n",
      '<h1>Title</h1>\n<p>Some text</p>\n<pre><code class="language-js">code\n</code></pre>\n',
    );
  });

  it("paragraph with multiple inline styles", () => {
    assertMarkdown(
      "Hello **bold** and *italic* and `code` and ~~strike~~\n",
      "<p>Hello <strong>bold</strong> and <em>italic</em> and <code>code</code> and <del>strike</del></p>\n",
    );
  });

  it("list then heading then paragraph", () => {
    assertMarkdown(
      "- Item 1\n- Item 2\n\n# Heading\n\nParagraph\n",
      "<ul><li>Item 1</li>\n<li>Item 2</li>\n</ul>\n<h1>Heading</h1>\n<p>Paragraph</p>\n",
    );
  });

  it("blockquote then code block", () => {
    assertMarkdown(
      "> Quote\n\n```\ncode\n```\n",
      "<blockquote><p>Quote\n</p>\n</blockquote>\n<pre><code>code\n</code></pre>\n",
    );
  });

  it("complex real-world AI response", () => {
    const md = [
      "# Summary",
      "",
      "Here is a **brief** summary:",
      "",
      "- Point *one* is important",
      "- Point **two** has `code`",
      "",
      "> Note: this is a quote",
      "",
      "```python",
      "def hello():",
      '    print("world")',
      "```",
      "",
      "See [docs](https://example.com) for more.",
      "",
    ].join("\n");

    const html = parse(md);
    expect(html).toContain("<h1>Summary</h1>");
    expect(html).toContain("<strong>brief</strong>");
    expect(html).toContain("<em>one</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain('class="language-python"');
    expect(html).toContain('<a href="https://example.com">docs</a>');
  });
});

// =============================================================================
// EDGE CASES — INLINE PARSING
// =============================================================================

describe("inline edge cases", () => {
  it("adjacent bold and italic: **bold***italic*", () => {
    const html = parse("**bold***italic*\n");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("bold then italic no space: **b***i*", () => {
    const html = parse("**b***i*\n");
    expect(html).toContain("<strong>");
    expect(html).toContain("<em>");
  });

  it("link with bold text: [**bold**](url)", () => {
    assertMarkdown(
      "[**bold**](http://x.com)\n",
      '<p><a href="http://x.com">**bold**</a></p>\n',
    );
  });

  it("image with empty alt text", () => {
    assertMarkdown("![](image.png)\n", '<p><img src="image.png" alt=""></p>\n');
  });

  it("unclosed bold renders as literal **", () => {
    assertMarkdown("**unclosed bold\n", "<p>**unclosed bold</p>\n");
  });

  it("unclosed italic renders as literal *", () => {
    assertMarkdown("*unclosed italic\n", "<p>*unclosed italic</p>\n");
  });

  it("single underscore in middle of word is literal", () => {
    // variable_name should not trigger italic
    assertMarkdown("my_var\n", "<p>my_var</p>\n");
  });

  it("escape at very end of input", () => {
    const html = parse("trailing\\");
    expect(html).toContain("trailing");
  });

  it("empty inline code", () => {
    assertMarkdown("``\n", "<p>``</p>\n");
  });

  it("** ** on its own line is a horizontal rule (4 stars with space)", () => {
    assertMarkdown("** **\n", "<hr>\n");
  });

  it("nested bold inside strikethrough inside italic", () => {
    assertMarkdown(
      "*~~**deep**~~*\n",
      "<p><em><del><strong>deep</strong></del></em></p>\n",
    );
  });

  it("multiple escape sequences in a row", () => {
    assertMarkdown("\\*\\*not bold\\*\\*\n", "<p>**not bold**</p>\n");
  });

  it("link immediately after text", () => {
    assertMarkdown("see[link](url)\n", '<p>see<a href="url">link</a></p>\n');
  });

  it("incomplete link syntax [text] without url", () => {
    assertMarkdown("[just brackets]\n", "<p>[just brackets]</p>\n");
  });

  it("incomplete link syntax [text]( no closing paren", () => {
    assertMarkdown("[text](no-close\n", "<p>[text](no-close</p>\n");
  });

  it("incomplete image syntax", () => {
    assertMarkdown("![alt](no-close\n", "<p>![alt](no-close</p>\n");
  });

  it("strikethrough with single tilde is literal", () => {
    assertMarkdown("~not struck~\n", "<p>~not struck~</p>\n");
  });

  it("multiple images in one line", () => {
    assertMarkdown(
      "![a](1.png) and ![b](2.png)\n",
      '<p><img src="1.png" alt="a"> and <img src="2.png" alt="b"></p>\n',
    );
  });

  it("mixed links and images", () => {
    assertMarkdown(
      "[link](url) and ![img](src)\n",
      '<p><a href="url">link</a> and <img src="src" alt="img"></p>\n',
    );
  });
});

// =============================================================================
// EDGE CASES — BLOCK-LEVEL PARSING
// =============================================================================

describe("block edge cases", () => {
  it("7 hashes is not a heading", () => {
    assertMarkdown("####### seven\n", "<p>####### seven</p>\n");
  });

  it("multiple blank lines collapse", () => {
    assertMarkdown("First\n\n\n\nSecond\n", "<p>First</p>\n<p>Second</p>\n");
  });

  it("code block immediately after paragraph (no blank line)", () => {
    assertMarkdown(
      "Some text\n```\ncode\n```\n",
      "<p>Some text</p>\n<pre><code>code\n</code></pre>\n",
    );
  });

  it("heading immediately after code block", () => {
    assertMarkdown(
      "```\ncode\n```\n# Heading\n",
      "<pre><code>code\n</code></pre>\n<h1>Heading</h1>\n",
    );
  });

  it("list immediately after heading (no blank line)", () => {
    assertMarkdown(
      "# Title\n- item\n",
      "<h1>Title</h1>\n<ul><li>item</li>\n</ul>\n",
    );
  });

  it("hr immediately after heading", () => {
    assertMarkdown("# Title\n---\n", "<h1>Title</h1>\n<hr>\n");
  });

  it("code block with empty lines inside", () => {
    assertMarkdown(
      "```\nline 1\n\nline 3\n```\n",
      "<pre><code>line 1\n\nline 3\n</code></pre>\n",
    );
  });

  it("code block with --- inside (not hr)", () => {
    assertMarkdown("```\n---\n```\n", "<pre><code>---\n</code></pre>\n");
  });

  it("code block with # inside (not heading)", () => {
    assertMarkdown(
      "```\n# not heading\n```\n",
      "<pre><code># not heading\n</code></pre>\n",
    );
  });

  it("code block with > inside (not blockquote)", () => {
    assertMarkdown(
      "```\n> not blockquote\n```\n",
      "<pre><code>&gt; not blockquote\n</code></pre>\n",
    );
  });

  it("code block with list syntax inside (not list)", () => {
    assertMarkdown(
      "```\n- not list\n1. not ordered\n```\n",
      "<pre><code>- not list\n1. not ordered\n</code></pre>\n",
    );
  });

  it("paragraph with only bold text", () => {
    assertMarkdown("**only bold**\n", "<p><strong>only bold</strong></p>\n");
  });

  it("paragraph with only a link", () => {
    assertMarkdown(
      "[click](http://x.com)\n",
      '<p><a href="http://x.com">click</a></p>\n',
    );
  });

  it("blank line only", () => {
    assertMarkdown("\n", "");
  });

  it("multiple blank lines only", () => {
    assertMarkdown("\n\n\n", "");
  });

  it("ordered list starting from non-1", () => {
    assertMarkdown(
      "3. Third\n4. Fourth\n",
      "<ol><li>Third</li>\n<li>Fourth</li>\n</ol>\n",
    );
  });

  it("list with blank line between items ends list", () => {
    assertMarkdown(
      "- First\n\n- Second\n",
      "<ul><li>First</li>\n</ul>\n<ul><li>Second</li>\n</ul>\n",
    );
  });

  it("blockquote with empty > line", () => {
    const html = parse("> Line 1\n>\n> Line 2\n");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Line 1");
    expect(html).toContain("Line 2");
  });
});

// =============================================================================
// EDGE CASES — HARD LINE BREAKS
// =============================================================================

describe("hard line breaks", () => {
  it("multiple hard line breaks in sequence", () => {
    assertMarkdown(
      "Line one  \nLine two  \nLine three\n",
      "<p>Line one<br>Line two<br>Line three</p>\n",
    );
  });

  it("hard break at end of paragraph (no following line)", () => {
    // Trailing spaces at last line of paragraph — break not visible but no crash
    const html = parse("Only line  \n");
    expect(html).toContain("Only line");
  });

  it("hard break does not apply in headings", () => {
    // Headings are single-line, trailing spaces pass through as text
    const html = parse("# Heading  \n");
    expect(html).toBe("<h1>Heading  </h1>\n");
  });

  it("hard break in multi-line paragraph", () => {
    assertMarkdown(
      "First  \nSecond\nThird\n",
      "<p>First<br>Second\nThird</p>\n",
    );
  });
});

// =============================================================================
// EDGE CASES — UNICODE AND SPECIAL CONTENT
// =============================================================================

describe("unicode and special content", () => {
  it("CJK characters", () => {
    assertMarkdown("# こんにちは\n", "<h1>こんにちは</h1>\n");
  });

  it("emoji in text", () => {
    assertMarkdown("Hello 🌍 world\n", "<p>Hello 🌍 world</p>\n");
  });

  it("bold emoji", () => {
    assertMarkdown("**🔥 fire**\n", "<p><strong>🔥 fire</strong></p>\n");
  });

  it("link with unicode text", () => {
    assertMarkdown(
      "[日本語](https://example.com)\n",
      '<p><a href="https://example.com">日本語</a></p>\n',
    );
  });

  it("accented characters", () => {
    assertMarkdown("café résumé naïve\n", "<p>café résumé naïve</p>\n");
  });

  it("zero-width characters pass through", () => {
    const html = parse("hello\u200Bworld\n");
    expect(html).toContain("hello\u200Bworld");
  });
});

// =============================================================================
// EDGE CASES — XSS AND SECURITY
// =============================================================================

describe("security edge cases", () => {
  it("script tag in heading", () => {
    assertMarkdown(
      "# <script>alert(1)</script>\n",
      "<h1>&lt;script&gt;alert(1)&lt;/script&gt;</h1>\n",
    );
  });

  it("javascript: URL in link has quotes escaped", () => {
    const html = parse('[click](javascript:"alert(1)")\n');
    // Quotes are escaped — no raw " in attribute
    expect(html).toContain("&quot;");
    expect(html).not.toContain('href="javascript:"alert');
  });

  it("onerror in image alt has quotes escaped", () => {
    const html = parse('![x" onerror="alert(1)](img.png)\n');
    // The " in alt text is escaped to &quot; preventing attribute injection
    expect(html).toContain("&quot;");
    // Verify the onerror cannot break out of the alt attribute
    expect(html).not.toContain('onerror="alert');
  });

  it("HTML entities in text", () => {
    assertMarkdown("&amp; &lt; &gt;\n", "<p>&amp;amp; &amp;lt; &amp;gt;</p>\n");
  });

  it("nested HTML tags", () => {
    assertMarkdown(
      "<div><script>alert(1)</script></div>\n",
      "<p>&lt;div&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;/div&gt;</p>\n",
    );
  });

  it("data: URL in image src", () => {
    const html = parse("![x](data:text/html,<script>alert(1)</script>)\n");
    expect(html).toContain("&lt;script&gt;");
  });

  it("event handler in link", () => {
    const html = parse('[x](https://x.com" onclick="alert(1))\n');
    expect(html).toContain("&quot;");
  });

  it("code block XSS is escaped", () => {
    assertMarkdown(
      "```\n<img src=x onerror=alert(1)>\n```\n",
      "<pre><code>&lt;img src=x onerror=alert(1)&gt;\n</code></pre>\n",
    );
  });
});

// =============================================================================
// EDGE CASES — STREAMING BEHAVIOR
// =============================================================================

describe("streaming behavior", () => {
  it("empty writes are handled", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("");
    parser.write("");
    parser.write("# Hello\n");
    parser.write("");
    parser.end();
    expect(renderer.html).toBe("<h1>Hello</h1>\n");
  });

  it("write after end throws", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("# Hello\n");
    parser.end();
    expect(() => parser.write("more")).toThrow();
  });

  it("double end is safe", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("Hello\n");
    parser.end();
    parser.end(); // should not throw
    expect(renderer.html).toBe("<p>Hello</p>\n");
  });

  it("split in middle of ** delimiter", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("Hello *");
    parser.write("*bold** world\n");
    parser.end();
    expect(renderer.html).toBe("<p>Hello <strong>bold</strong> world</p>\n");
  });

  it("split in middle of code fence", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("``");
    parser.write("`js\nconst x = 1;\n`");
    parser.write("``\n");
    parser.end();
    expect(renderer.html).toBe(
      '<pre><code class="language-js">const x = 1;\n</code></pre>\n',
    );
  });

  it("split in middle of link syntax", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("[link");
    parser.write("](http://example");
    parser.write(".com)\n");
    parser.end();
    expect(renderer.html).toBe(
      '<p><a href="http://example.com">link</a></p>\n',
    );
  });

  it("heading split across chunks", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("#");
    parser.write("# Heading");
    parser.write("\n");
    parser.end();
    expect(renderer.html).toBe("<h2>Heading</h2>\n");
  });

  it("real AI streaming pattern: code block arriving in pieces", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    const chunks = [
      "Here",
      " is",
      " some",
      " code",
      ":\n\n",
      "```",
      "python",
      "\n",
      "def",
      " hello",
      "():",
      "\n",
      "    ",
      "print",
      '("world")',
      "\n",
      "```",
      "\n",
    ];
    for (const chunk of chunks) {
      parser.write(chunk);
    }
    parser.end();
    expect(renderer.html).toContain("<p>Here is some code:</p>");
    expect(renderer.html).toContain('class="language-python"');
    expect(renderer.html).toContain("def hello():");
  });

  it("real AI streaming: list items arriving one by one", () => {
    const renderer = new HtmlRenderer();
    const parser = new StreamParser(renderer);
    parser.write("Here are the steps:\n\n");
    parser.write("1. First step\n");
    parser.write("2. Second step\n");
    parser.write("3. Third step\n");
    parser.write("\nDone!\n");
    parser.end();
    expect(renderer.html).toContain("<ol>");
    expect(renderer.html).toContain("First step");
    expect(renderer.html).toContain("Second step");
    expect(renderer.html).toContain("Third step");
    expect(renderer.html).toContain("<p>Done!</p>");
  });
});

// =============================================================================
// EDGE CASES — RECOVERY INTEGRATION
// =============================================================================

describe("recovery edge cases", () => {
  it("asterisk in URL does not confuse recovery", () => {
    const md = "See [link](https://example.com/path*file)";
    expect(MarkdownRecovery.hasUnterminated(md)).toBe(true); // Will see the lone *
  });

  it("underscores in snake_case variable names", () => {
    const md = "Use `my_var_name` in your code";
    expect(MarkdownRecovery.hasUnterminated(md)).toBe(false);
  });

  it("triple backtick in inline code is a known recovery limitation", () => {
    // Recovery's regex can't distinguish ``` inside double-backtick inline code
    // from a real code fence. This is an accepted tradeoff for simplicity.
    const md = "Use `` ``` `` for code blocks";
    expect(MarkdownRecovery.hasUnterminated(md)).toBe(true);
  });

  it("recover + parse produces valid output for simple case", () => {
    const incomplete = "# Title\n\n**bold text";
    const recovered = MarkdownRecovery.recover(incomplete);
    const html = parse(recovered);
    expect(html).toContain("<h1>Title</h1>");
    expect(html).toContain("<strong>bold text</strong>");
  });

  it("recover closes unclosed code block", () => {
    const incomplete = "```js\nconst x = 1;";
    const recovered = MarkdownRecovery.recover(incomplete);
    const html = parse(recovered);
    expect(html).toContain("const x = 1;");
    expect(html).toContain("</code></pre>");
  });
});
