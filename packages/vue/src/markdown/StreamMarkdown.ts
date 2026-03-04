import { defineComponent, computed, h } from "vue";
import { StreamParser, HtmlRenderer, MarkdownRecovery } from "@aibind/markdown";

export const StreamMarkdown: ReturnType<typeof defineComponent> =
  defineComponent({
    name: "StreamMarkdown",
    props: {
      /** The markdown text to render. Can grow over time during streaming. */
      text: { type: String, required: true },
      /** Whether the text is still streaming. Enables recovery for unterminated syntax. */
      streaming: { type: Boolean, default: false },
    },
    setup(props) {
      const renderer = new HtmlRenderer();

      const html = computed(() => {
        const input = props.streaming
          ? MarkdownRecovery.recover(props.text)
          : props.text;
        renderer.reset();
        const parser = new StreamParser(renderer);
        parser.write(input);
        parser.end();
        return renderer.html;
      });

      return () =>
        h("div", {
          class: ["stream-markdown", { streaming: props.streaming }],
          innerHTML: html.value,
        });
    },
  });
