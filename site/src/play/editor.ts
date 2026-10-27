// The spec editor: a plain textarea with a line-number gutter, YAML-friendly keys (Tab indents
// two spaces, Shift+Tab outdents, Enter keeps the indent) and marks on lines with problems.
// A textarea keeps the page light and works with every phone keyboard; CodeMirror would add
// several hundred KB for highlighting the spec does not need.

export interface Editor {
  get value(): string;
  set value(text: string);
  onChange(fn: (text: string) => void): void;
  /** Marks these 1-based lines in the gutter (errors and warnings). */
  mark(lines: Map<number, "error" | "warning">): void;
  /** Selects a line and scrolls it into view. */
  reveal(line: number): void;
  focus(): void;
}

/**
 * Inserts text at the selection through the browser's editing command, the one way to keep the
 * textarea's own undo stack; setRangeText is the fallback where the command is missing.
 */
function insert(area: HTMLTextAreaElement, text: string) {
  area.focus();
  const done = text
    ? document.execCommand("insertText", false, text)
    : document.execCommand("delete");
  if (!done) {
    area.setRangeText(text, area.selectionStart, area.selectionEnd, "end");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

export function createEditor(area: HTMLTextAreaElement, gutter: HTMLElement): Editor {
  let lines = 0;
  let marks = new Map<number, "error" | "warning">();
  const listeners: ((text: string) => void)[] = [];

  function paintGutter() {
    const count = area.value.split("\n").length;
    lines = count;
    const out: string[] = [];
    for (let i = 1; i <= count; i++) {
      const mark = marks.get(i);
      out.push(mark ? `<span class="ln ln-${mark}">${i}</span>` : `<span class="ln">${i}</span>`);
    }
    gutter.innerHTML = out.join("");
    gutter.scrollTop = area.scrollTop;
  }

  area.addEventListener("input", () => {
    if (area.value.split("\n").length !== lines) paintGutter();
    for (const fn of listeners) fn(area.value);
  });
  area.addEventListener("scroll", () => {
    gutter.scrollTop = area.scrollTop;
  });

  area.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Esc then Tab leaves the editor, as in most code editors.
      area.dataset.escaped = "1";
      return;
    }
    if (e.key === "Tab" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (area.dataset.escaped) {
        delete area.dataset.escaped;
        return;
      }
      e.preventDefault();
      const { value, selectionStart: start, selectionEnd: end } = area;
      const lineStart = value.lastIndexOf("\n", start - 1) + 1;
      if (value.slice(start, end).includes("\n")) {
        // A selection over several lines indents or outdents each of them and stays selected; a
        // line the selection only reaches the start of is left alone.
        const last = value[end - 1] === "\n" ? end - 1 : end;
        const stop = value.indexOf("\n", last);
        const block = value.slice(lineStart, stop < 0 ? value.length : stop);
        const next = block
          .split("\n")
          .map((line) => (e.shiftKey ? line.replace(/^ {1,2}/, "") : line && `  ${line}`))
          .join("\n");
        if (next === block) return;
        area.setSelectionRange(lineStart, lineStart + block.length);
        insert(area, next);
        area.setSelectionRange(lineStart, lineStart + next.length);
        return;
      }
      if (e.shiftKey) {
        const lead = value.slice(lineStart).match(/^ {1,2}/)?.[0].length ?? 0;
        if (!lead) return;
        area.setSelectionRange(lineStart, lineStart + lead);
        insert(area, "");
        area.setSelectionRange(Math.max(lineStart, start - lead), Math.max(lineStart, end - lead));
      } else insert(area, "  ");
      return;
    }
    delete area.dataset.escaped;
    if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.isComposing) {
      const { value, selectionStart: start } = area;
      const line = value.slice(value.lastIndexOf("\n", start - 1) + 1, start);
      let indent = line.match(/^\s*/)?.[0] ?? "";
      // A key that opens a block ("nodes:") indents the next line.
      if (/:\s*$/.test(line)) indent += "  ";
      if (!indent) return;
      e.preventDefault();
      insert(area, `\n${indent}`);
    }
  });

  return {
    get value() {
      return area.value;
    },
    set value(text: string) {
      area.value = text;
      area.scrollTop = 0;
      paintGutter();
    },
    onChange(fn) {
      listeners.push(fn);
    },
    mark(next) {
      marks = next;
      paintGutter();
    },
    reveal(line) {
      const all = area.value.split("\n");
      const index = Math.max(0, Math.min(all.length, line) - 1);
      const start = all.slice(0, index).reduce((n, l) => n + l.length + 1, 0);
      area.focus({ preventScroll: true });
      area.setSelectionRange(start, start + (all[index]?.length ?? 0));
      const lineHeight = Number.parseFloat(getComputedStyle(area).lineHeight) || 20;
      area.scrollTo({ top: Math.max(0, (index - 3) * lineHeight), behavior: "smooth" });
    },
    focus() {
      area.focus();
    },
  };
}
