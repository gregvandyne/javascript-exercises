<script lang="ts">
  // A math input: renders a Mf doc and edits it through a Mf Editor.
  //
  // Typing goes through a transparent <textarea> laid over the math, so phones,
  // tablets and on-screen keyboards work like they do in any text field, and IME
  // composition is handled by the browser. The textarea only ever holds one
  // invisible character; each input event is read off it and replayed on the
  // Editor, then the textarea is reset. (An empty textarea gives mobile keyboards
  // nothing to delete, so Backspace would never arrive.)
  //
  // `value` is the doc as text, via `toText` and `fromText`, so the field can be
  // bound to a string that lives in a URL. Setting `value` from outside reloads it.
  import {
    createMfVDOMComponent,
    Editor,
    h,
    renderDoc,
    t,
    type Components,
    type Doc,
    type DocCursor,
    type EditorCommand,
    type Schema,
    type TypingRule,
  } from "@oomba-mathfield/core";
  import {
    FractionTokenComponent,
    MatrixTokenComponent,
    ParenthesesTokenComponent,
    RadicalTokenComponent,
    SubSupTokenComponent,
  } from "@oomba-mathfield/math";
  import MfVNode from "./MfVNode.svelte";
  import type { SvelteForeign } from "./types";

  type Props = {
    schema: Schema;
    value?: string;
    toText: (doc: Doc<any>) => string;
    fromText: (text: string) => Doc<any>;
    typingRules?: TypingRule<any>[];
    commands?: Record<string, EditorCommand<any>>;
    /** Extra components, by token type. The math ones are built in. */
    components?: Partial<Components<any, SvelteForeign>>;
    /** Classes for particular tokens, by token id, e.g. to space out keywords. */
    classify?: (doc: Doc<any>) => Map<string, string>;
    placeholder?: string;
    id?: string;
    class?: string;
    "aria-label"?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  };

  let {
    schema,
    value = $bindable(""),
    toText,
    fromText,
    typingRules = [],
    commands = {},
    components = {},
    classify,
    placeholder = "",
    id,
    class: className = "",
    "aria-label": ariaLabel,
    "aria-describedby": describedBy,
    "aria-invalid": invalid = false,
  }: Props = $props();

  const SENTINEL = "​";

  const editor = new Editor<any>(schema, {
    // Fixed, so the server and the browser render the same token ids.
    clientId: "field",
    typingRules,
    commands,
  });
  editor.load(fromText(value));
  let written = value; // the text this field last wrote to or loaded from `value`
  let version = $state(0);
  let focused = $state(false);
  let textarea: HTMLTextAreaElement;
  let root: HTMLElement;
  let pointerFocus = false;

  // Reload when `value` changes from outside (undo, a preset, a link).
  $effect.pre(() => {
    if (value !== written) {
      editor.load(fromText(value));
      written = value;
      version++;
    }
  });

  function changed() {
    version++;
    const text = toText(editor.doc);
    if (text !== value) {
      written = text;
      value = text;
    }
  }

  const doc = $derived.by(() => {
    version;
    return editor.doc;
  });
  const empty = $derived(doc.root.tokens.length === 0);
  const vnode = $derived.by(() => {
    const classes = classify?.(doc) ?? new Map<string, string>();
    const char = createMfVDOMComponent<any>(({ token }) =>
      h(
        "span",
        { class: classes.get(token.id) ?? charClass(token.props.char) },
        t(token.props.char === "-" ? "−" : token.props.char),
      ),
    );
    return renderDoc<any, SvelteForeign>({
      doc,
      isFocused: focused,
      components: {
        "core/char": char,
        "math/fraction": FractionTokenComponent,
        "math/matrix": MatrixTokenComponent,
        "math/parentheses": ParenthesesTokenComponent,
        "math/radical": RadicalTokenComponent,
        "math/subsup": SubSupTokenComponent,
        ...components,
      } as Components<any, SvelteForeign>,
    });
  });

  function charClass(char: string) {
    if (/^[<>≤≥≠=]$/.test(char)) return "mf-rel";
    if (/^[+\-×·÷±]$/.test(char)) return "mf-bin";
    if (char !== "π" && /^\p{L}$/u.test(char)) return "mf-var";
    return "";
  }

  function resetTextarea() {
    textarea.value = SENTINEL;
    textarea.setSelectionRange(SENTINEL.length, SENTINEL.length);
  }

  // Whatever the browser put in the textarea since the last reset.
  function readTextarea(inputType?: string) {
    const v = textarea.value;
    if (v === SENTINEL) return;
    if (v === "") {
      editor.delete(inputType === "deleteContentForward" ? "right" : "left");
    } else {
      editor.type(v.split(SENTINEL).join(""));
    }
    resetTextarea();
    changed();
  }

  function oninput(e: Event) {
    if ((e as InputEvent).isComposing) return;
    readTextarea((e as InputEvent).inputType);
  }

  function onkeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;
    const act = (fn: () => void) => {
      e.preventDefault();
      fn();
      changed();
    };
    switch (e.key) {
      case "ArrowLeft":
      case "ArrowRight": {
        const dir = e.key === "ArrowLeft" ? "left" : "right";
        return act(() => (e.metaKey ? editor.moveToEdge(dir, e.shiftKey) : editor.move(dir, e.shiftKey)));
      }
      case "Home":
        return act(() => editor.moveToEdge("left", e.shiftKey));
      case "End":
        return act(() => editor.moveToEdge("right", e.shiftKey));
      case "Backspace":
        return act(() => editor.delete("left"));
      case "Delete":
        return act(() => editor.delete("right"));
      case "ArrowUp":
      case "ArrowDown":
      case "Enter":
        return e.preventDefault();
    }
    if (mod && e.key.toLowerCase() === "a") return act(() => editor.selectAll());
    // The textarea's own undo would edit its hidden text; let the page's undo have it.
    if (mod && ["z", "y"].includes(e.key.toLowerCase())) e.preventDefault();
  }

  function selectedText() {
    return toText({ root: { id: "[ROOT]", tokens: editor.selectedTokens }, selection: null });
  }
  function oncopy(e: ClipboardEvent) {
    if (!editor.hasRange) return;
    e.preventDefault();
    e.clipboardData?.setData("text/plain", selectedText());
  }
  function oncut(e: ClipboardEvent) {
    if (!editor.hasRange) return;
    oncopy(e);
    editor.deleteRange();
    changed();
  }
  function onpaste(e: ClipboardEvent) {
    e.preventDefault();
    editor.type(e.clipboardData?.getData("text/plain") ?? "");
    changed();
  }

  function onfocus() {
    focused = true;
    resetTextarea();
    // Tabbing in selects everything, like a text input; a click places the cursor.
    if (!pointerFocus) {
      editor.selectAll();
      version++;
    }
  }

  // Put the cursor at whichever cursor slot is closest to the pointer.
  function onpointerdown(e: PointerEvent) {
    if (e.button !== 0) return;
    let best: DocCursor | null = null;
    let bestScore = Infinity;
    for (const el of root.querySelectorAll<HTMLElement>("[data-mf-cursor]")) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const score = dx * dx + dy * dy * 4;
      if (score < bestScore) {
        bestScore = score;
        best = JSON.parse(el.dataset.mfCursor!);
      }
    }
    e.preventDefault();
    if (best) editor.select(best);
    else editor.moveToEdge("right");
    pointerFocus = true;
    textarea.focus(); // fires focus synchronously when it wasn't focused
    pointerFocus = false;
    version++;
  }
</script>

<div
  class="mf-field {className}"
  class:focused
  class:invalid
  bind:this={root}
  {onpointerdown}
  onclick={() => document.activeElement !== textarea && textarea.focus()}
>
  <span class="mf-math" aria-hidden="true">
    <MfVNode {vnode} />{#if empty && !focused && placeholder}<span class="mf-placeholder">{placeholder}</span>{/if}
  </span>
  <textarea
    bind:this={textarea}
    {id}
    rows="1"
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    enterkeyhint="done"
    aria-label={ariaLabel}
    aria-describedby={describedBy}
    aria-invalid={invalid}
    aria-roledescription="math input"
    value={SENTINEL}
    {oninput}
    oncompositionend={() => readTextarea()}
    {onkeydown}
    {oncopy}
    {oncut}
    {onpaste}
    {onfocus}
    onblur={() => (focused = false)}
  ></textarea>
</div>

<style>
  .mf-field {
    position: relative;
    display: block;
    min-height: 2.6em;
    padding: 0.35em 0.7em;
    border: 1.5px solid var(--mf-border, #d4d6dd);
    border-radius: var(--mf-radius, 10px);
    background: var(--mf-background, #fff);
    color: var(--mf-cursor, inherit);
    font-family: var(--mf-font, "Times New Roman", Times, serif);
    font-size: var(--mf-font-size, 1.15rem);
    font-weight: var(--mf-font-weight, 400);
    line-height: 1.6;
    cursor: text;
    user-select: none;
    -webkit-user-select: none;
    white-space: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: thin;
  }
  .mf-field.focused { border-color: var(--mf-focus, #2563eb); }
  .mf-field.invalid { border-color: var(--mf-invalid, #dc2626); }

  /* The typing surface: over the math, invisible, and 16px so iOS doesn't zoom in. */
  textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    resize: none;
    overflow: hidden;
    font-size: 16px;
    color: transparent;
    background: transparent;
    caret-color: transparent;
    cursor: text;
    pointer-events: none;
  }

  .mf-placeholder { color: var(--mf-placeholder, #9aa0aa); font-family: var(--mf-placeholder-font, inherit); }

  .mf-math :global(.mf-var) { font-style: italic; }
  .mf-math :global(.mf-rel) { margin: 0 0.28em; }
  .mf-math :global(.mf-bin) { margin: 0 0.18em; }
  .mf-math :global(.mf-word) { font-family: var(--mf-word-font, system-ui, sans-serif); font-size: 0.85em; }
  .mf-math :global(.mf-word-start) { margin-left: 0.4em; }
  .mf-math :global(.mf-word-end) { margin-right: 0.4em; }

  .mf-math :global(.cursor) {
    display: inline-block;
    border-left: 1.5px solid transparent;
    margin-right: -1.5px;
    vertical-align: baseline;
    animation: mf-blink 1s steps(1) infinite;
    user-select: none;
  }
  .mf-math :global(.cursor.head), .mf-math :global(.cursor.anchor) { border-color: currentColor; }
  .mf-math :global(.cursor.placeholder) { visibility: hidden; animation: none; }
  .mf-math :global(.selected) { display: inline-block; background: var(--mf-selection, #b3d7fe); }
  @keyframes mf-blink { 0%, 50% { opacity: 1; } 50.01%, 100% { opacity: 0; } }

  .mf-math :global(.fraction) { display: inline-block; text-align: center; font-size: 0.85em; vertical-align: 0.33em; margin: 0 0.08em; }
  .mf-math :global(.fraction .fraction .fraction) { font-size: 1em; }
  .mf-math :global(.numerator) { display: block; overflow: hidden; padding: 0 0.15em; margin: 0 -1px; line-height: 1.25; }
  .mf-math :global(.denominator) { display: block; float: left; width: 100%; line-height: 1.25; }
  .mf-math :global(.denominator::before) {
    content: ""; display: block; height: 0.07em; background: currentColor; width: 100%; border-radius: 0.03em; user-select: none;
  }
  .mf-math :global(.numerator:not(:has(:not(.cursor.placeholder)))::after),
  .mf-math :global(.denominator:not(:has(:not(.cursor.placeholder)))::after),
  .mf-math :global(.superscript:not(:has(:not(.cursor.placeholder)))::after),
  .mf-math :global(.radicand:not(:has(:not(.cursor.placeholder)))::after) {
    display: inline-block; content: ""; width: 0.6em; height: 0.7em; background: var(--mf-slot, #e5e7eb); vertical-align: -0.1em;
  }
  .mf-math :global(.parentheses) { display: inline-block; }
  .mf-math :global(.subsup) { display: inline-block; font-size: 0.6em; vertical-align: 0.33em; }
  .mf-math :global(.subscript) { display: block; float: left; width: 100%; }
  .mf-math :global(.superscript) { display: block; overflow: hidden; padding: 0 1px; margin: 0 -1px; }
  .mf-math :global(.radical) { display: inline-flex; align-items: stretch; position: relative; margin: 0 0.05em; }
  .mf-math :global(.radical)::before { content: "√"; line-height: 1.15; margin-right: -0.02em; }
  .mf-math :global(.radicand) { position: relative; display: inline-block; border-top: 0.07em solid currentColor; padding: 0 0.08em; line-height: 1.15; margin-top: 0.08em; }
</style>
