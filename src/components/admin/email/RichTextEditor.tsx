"use client";

/**
 * Dual-mode HTML editor for the broadcast composer.
 *
 *   - **Visual mode** (TipTap WYSIWYG): toolbar applies real formatting,
 *     non-technical operators see bold/italic/headings rendered as they type.
 *   - **Code mode** (textarea): full HTML source, toolbar inserts tags at the
 *     cursor, paste-rich-html button preserves inline styles verbatim.
 *
 * The toggle is **non-destructive** by contract:
 *
 *   - Switching `code → visual` loads the source into TipTap silently
 *     (`emitUpdate: false`). The parent's `value` is NOT touched, so just
 *     looking at the visual rendering and going back doesn't drop styles.
 *   - Switching `visual → code` adopts TipTap's HTML ONLY if the operator
 *     actually edited in visual mode (tracked by `visualEdited`). Just
 *     looking → original source preserved verbatim.
 *
 * Editing in visual mode IS lossy (TipTap is a semantic editor — it can't
 * round-trip <table>, <style>, custom classes, etc.). That's an explicit
 * choice: the operator who clicks "Visual" and types is asking for the
 * simplification, the operator who pastes a template and reads it back
 * from code mode never sees TipTap touch it.
 *
 * Default mode is computed from `hasComplexHtml(value)` on initial mount so
 * a refresh of a styled template lands directly in code mode (preserving
 * the layout) rather than briefly flashing the stripped visual rendering.
 */
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Bold, Italic, UnderlineIcon, Strikethrough, Code, List, ListOrdered, Link2,
  Heading1, Heading2, Heading3, Quote, Minus,
  ClipboardPaste, Code2, Pencil, Undo, Redo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  value:    string;
  onChange: (html: string) => void;
  disabled?: boolean;
}

/** Does the HTML have content TipTap's StarterKit can't faithfully render? */
function hasComplexHtml(html: string): boolean {
  if (!html) return false;
  if (/<style/i.test(html))                                 return true;
  if (/<table/i.test(html))                                 return true;
  if (/<(?:div|span)[^>]+class=/i.test(html))               return true;
  const inlineStyleCount = (html.match(/style=["'][^"']*["']/g) ?? []).length;
  if (inlineStyleCount > 3)                                 return true;
  return false;
}

export function RichTextEditor({ value, onChange, disabled = false }: Props) {
  const t = useTranslations().admin.email.editor;
  const [mode, setMode] = useState<"visual" | "code">(() =>
    hasComplexHtml(value) ? "code" : "visual",
  );
  // Did the operator type something in visual mode since the last toggle?
  // The toggle-back logic uses this to decide whether to promote TipTap's
  // (lossy) HTML to the canonical value or to leave the source untouched.
  const visualEdited = useRef(false);
  // Tracks the last HTML emitted by THIS component to the parent. Stops
  // the value-prop reconciliation effect from looping when the parent
  // echoes our own onChange.
  const lastPushed = useRef(value);
  const codeRef = useRef<HTMLTextAreaElement | null>(null);

  // ─── Link insertion dialog ──────────────────────────────────────────────
  // Replaces the native `prompt()` (ugly browser-styled, no second field,
  // poor focus management) with a proper Radix Dialog. The dialog asks for
  // the URL plus an optional visible label; if the operator had a selection
  // in the editor when they clicked the Link button, we pre-fill the label
  // with that selection so the round-trip "select word → click Link → fill
  // URL → confirm" feels natural.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  // Pending paste payload — when the operator's editor already has content,
  // we stash the clipboard payload here and ask via a ConfirmDialog before
  // writing. Null means "no paste pending".
  const [pendingPaste, setPendingPaste] = useState<{ payload: string; kind: "html" | "text" } | null>(null);
  // Snapshot of the selection at the moment the dialog opened — needed
  // because the textarea loses focus when the dialog grabs it, so we can't
  // read selectionStart/End on submit.
  const codeSelection = useRef<{ start: number; end: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Allow H1 in addition to H2/H3 — H1 is common in email titles.
        heading: { levels: [1, 2, 3] },
      }),
      // Underline isn't in StarterKit (semantic ambiguity with <em>), but
      // operators expect it from word-processor habits, so we add it.
      Underline,
      Link.configure({
        protocols: ["http", "https", "mailto", "tel"],
        autolink: true,
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      // Visual-mode typing → propagate to parent. The flag is the key
      // signal the toggle-back logic uses to decide whether to keep the
      // original source or adopt TipTap's HTML.
      const html = editor.getHTML();
      lastPushed.current = html;
      visualEdited.current = true;
      onChange(html);
    },
  });

  // Reconcile from props.value when the parent legitimately changes it
  // (initial load, page navigation, revert). Ignored when the new value is
  // an echo of our own onChange — comparison against lastPushed.
  useEffect(() => {
    if (!editor) return;
    if (value === lastPushed.current) return;
    editor.commands.setContent(value, { emitUpdate: false });
    lastPushed.current = value;
  }, [value, editor]);

  // ─── Mode toggle ─────────────────────────────────────────────────────────
  function toggleMode() {
    if (mode === "code") {
      // CODE → VISUAL:
      // Load source into TipTap silently. Anything TipTap can't represent
      // is dropped from the visual view, but the parent's `value` stays
      // exactly as it was. If the operator only looks and toggles back,
      // the code mode shows the original verbatim.
      if (!editor) return;
      editor.commands.setContent(value, { emitUpdate: false });
      lastPushed.current = value;
      visualEdited.current = false;
      setMode("visual");
    } else {
      // VISUAL → CODE:
      // If the operator edited in visual mode, `value` has already been
      // updated through the onUpdate handler. Nothing more to do.
      // If they didn't edit, `value` is still the original source.
      visualEdited.current = false;
      setMode("code");
    }
  }

  // ─── Code-mode helpers: insert tags at cursor / wrap selection ───────────
  function wrapCode(before: string, after: string) {
    const ta = codeRef.current;
    if (!ta || disabled) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + before.length;
      ta.setSelectionRange(caret, caret + selected.length);
    });
  }
  function insertCode(snippet: string) {
    const ta = codeRef.current;
    if (!ta || disabled) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const next = value.slice(0, start) + snippet + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + snippet.length;
      ta.setSelectionRange(caret, caret);
    });
  }

  // ─── Paste rich HTML from clipboard ───────────────────────────────────────
  // Drops into code mode regardless of current mode — the operator pasted
  // a template, they need to see the source. Visual mode would silently
  // strip it.
  /**
   * Write a clipboard payload into the editor — switches to code mode so the
   * operator can inspect the raw HTML (visual mode would silently strip
   * styles). Used both for direct paste (no existing content) and after the
   * operator confirms overwriting existing content via ConfirmDialog.
   */
  function applyPaste(payload: string, kind: "html" | "text") {
    lastPushed.current = payload;
    visualEdited.current = false;
    setMode("code");
    onChange(payload);
    toast.success(kind === "html" ? t.clipboardHtmlPasted : t.clipboardTextPasted);
  }

  async function pasteRichHtml() {
    try {
      if (!navigator.clipboard?.read) {
        toast.error(t.clipboardNotSupported);
        return;
      }
      const items = await navigator.clipboard.read();
      let payload: string | null = null;
      let kind: "html" | "text" = "html";
      for (const item of items) {
        if (item.types.includes("text/html")) {
          payload = await (await item.getType("text/html")).text();
          break;
        }
      }
      if (!payload) {
        for (const item of items) {
          if (item.types.includes("text/plain")) {
            const txt = await (await item.getType("text/plain")).text();
            payload = `<p>${txt
              .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
              .replace(/\n\n+/g, "</p><p>")
              .replace(/\n/g, "<br>")
            }</p>`;
            kind = "text";
            break;
          }
        }
      }
      if (!payload) {
        toast.error(t.clipboardEmpty);
        return;
      }
      if (value.trim().length > 0) {
        // Defer to the ConfirmDialog instead of a native confirm() — applyPaste
        // runs on the dialog's `onConfirm` once the operator has agreed.
        setPendingPaste({ payload, kind });
        return;
      }
      applyPaste(payload, kind);
    } catch (e) {
      toast.error(
        e instanceof Error && /denied|permission/i.test(e.message)
          ? t.clipboardPermissionDenied
          : t.clipboardError,
      );
    }
  }

  const BULLET_LIST  = "\n<ul>\n  <li></li>\n</ul>\n";
  const ORDERED_LIST = "\n<ol>\n  <li></li>\n</ol>\n";
  const QUOTE_BLOCK  = "\n<blockquote>\n  \n</blockquote>\n";

  if (!editor) return null;

  return (
    <div className="border border-input rounded-md focus-within:ring-[3px] focus-within:ring-ring/50">
      {/* Toolbar — the buttons depend on the current mode, plus a shared */}
      {/* paste button and mode toggle at the right edge. */}
      {!disabled && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-muted/30">
          {mode === "visual" ? (
            <>
              {/* Inline formatting */}
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()}
                         active={editor.isActive("bold")} title={t.boldTooltip}>
                <Bold className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()}
                         active={editor.isActive("italic")} title={t.italicTooltip}>
                <Italic className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()}
                         active={editor.isActive("underline")} title={t.underlineTooltip}>
                <UnderlineIcon className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()}
                         active={editor.isActive("strike")} title={t.strikeTooltip}>
                <Strikethrough className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleCode().run()}
                         active={editor.isActive("code")} title={t.codeTooltip}>
                <Code className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              {/* Headings */}
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                         active={editor.isActive("heading", { level: 1 })} title={t.h1Tooltip}>
                <Heading1 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                         active={editor.isActive("heading", { level: 2 })} title={t.h2Tooltip}>
                <Heading2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                         active={editor.isActive("heading", { level: 3 })} title={t.h3Tooltip}>
                <Heading3 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              {/* Block-level */}
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()}
                         active={editor.isActive("bulletList")} title={t.bulletListTooltip}>
                <List className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()}
                         active={editor.isActive("orderedList")} title={t.orderedListTooltip}>
                <ListOrdered className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()}
                         active={editor.isActive("blockquote")} title={t.quoteTooltip}>
                <Quote className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()}
                         title={t.hrTooltip}>
                <Minus className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              {/* Link + history */}
              <ToolbarBtn onClick={() => {
                // Pre-fill the label with the current selection so the dialog
                // shows what TipTap is about to wrap. Existing link → pre-fill
                // both fields (the operator is probably editing it).
                const { from, to } = editor.state.selection;
                const selectedText = editor.state.doc.textBetween(from, to, " ");
                const existingLink = editor.getAttributes("link")?.href as string | undefined;
                setLinkLabel(selectedText);
                setLinkUrl(existingLink ?? "");
                codeSelection.current = null;       // mark "visual mode invocation"
                setLinkDialogOpen(true);
              }} active={editor.isActive("link")} title={t.linkTooltip}>
                <Link2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title={t.undoTooltip}>
                <Undo className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title={t.redoTooltip}>
                <Redo className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </>
          ) : (
            <>
              {/* Code mode mirrors the visual toolbar — same tools, but every */}
              {/* button inserts a raw HTML tag at the caret instead of */}
              {/* triggering a TipTap command. */}
              <ToolbarBtn onClick={() => wrapCode("<strong>", "</strong>")} title={t.boldTooltip}>
                <Bold className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<em>", "</em>")} title={t.italicTooltip}>
                <Italic className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<u>", "</u>")} title={t.underlineTooltip}>
                <UnderlineIcon className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<s>", "</s>")} title={t.strikeTooltip}>
                <Strikethrough className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<code>", "</code>")} title={t.codeTooltip}>
                <Code className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              <ToolbarBtn onClick={() => wrapCode("<h1>", "</h1>")} title={t.h1Tooltip}>
                <Heading1 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<h2>", "</h2>")} title={t.h2Tooltip}>
                <Heading2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => wrapCode("<h3>", "</h3>")} title={t.h3Tooltip}>
                <Heading3 className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              <ToolbarBtn onClick={() => insertCode(BULLET_LIST)} title={t.bulletListTooltip}>
                <List className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => insertCode(ORDERED_LIST)} title={t.orderedListTooltip}>
                <ListOrdered className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => insertCode(QUOTE_BLOCK)} title={t.quoteTooltip}>
                <Quote className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <ToolbarBtn onClick={() => insertCode("\n<hr>\n")} title={t.hrTooltip}>
                <Minus className="w-3.5 h-3.5" />
              </ToolbarBtn>
              <Separator />
              <ToolbarBtn onClick={() => {
                // Snapshot the selection — the textarea loses focus when the
                // dialog opens, so we can't read selection from it later.
                const ta = codeRef.current;
                if (!ta) return;
                const start = ta.selectionStart;
                const end   = ta.selectionEnd;
                codeSelection.current = { start, end };
                setLinkLabel(value.slice(start, end));
                setLinkUrl("");
                setLinkDialogOpen(true);
              }} title={t.linkTooltip}>
                <Link2 className="w-3.5 h-3.5" />
              </ToolbarBtn>
            </>
          )}
          <div className="flex-1" />
          <ToolbarBtn onClick={pasteRichHtml} title={t.pasteHtmlTooltip}>
            <ClipboardPaste className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={toggleMode}
                     active={mode === "code"}
                     title={mode === "visual" ? t.switchToCodeTooltip : t.switchToVisualTooltip}>
            {mode === "visual" ? <Code2 className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          </ToolbarBtn>
        </div>
      )}

      {/* Editor surfaces — only one is visible at a time. Both stay mounted */}
      {/* so toggling between them is instant and TipTap keeps its internal */}
      {/* state (selection, undo history) across visits. */}
      {mode === "visual" ? (
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none px-3 py-2 min-h-[320px] focus:outline-none [&_*]:focus:outline-none bg-white text-gray-900 dark:bg-white dark:text-gray-900 prose-headings:text-gray-900 prose-strong:text-gray-900 prose-a:text-blue-700"
        />
      ) : (
        <textarea
          ref={codeRef}
          value={value}
          onChange={e => {
            lastPushed.current = e.target.value;
            onChange(e.target.value);
          }}
          disabled={disabled}
          spellCheck={false}
          className="w-full font-mono text-xs px-3 py-2 min-h-[320px] focus:outline-none resize-y bg-white text-gray-900 dark:bg-white dark:text-gray-900"
          placeholder={t.placeholder}
        />
      )}

      {/* Paste-replace confirmation — replaces the native confirm() that fired */}
      {/* when the operator pasted onto a non-empty editor. */}
      <ConfirmDialog
        open={pendingPaste !== null}
        title={t.clipboardReplaceTitle}
        description={t.clipboardReplaceConfirm}
        confirmLabel={t.clipboardReplaceConfirmBtn}
        cancelLabel={t.linkDialogCancel}
        destructive
        onOpenChange={(open) => { if (!open) setPendingPaste(null); }}
        onConfirm={() => {
          if (pendingPaste) applyPaste(pendingPaste.payload, pendingPaste.kind);
          setPendingPaste(null);
        }}
      />

      {/* Link insertion dialog — replaces the native prompt() */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.linkDialogTitle}</DialogTitle>
            <DialogDescription>{t.linkDialogDescription}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={e => {
              e.preventDefault();
              const url = linkUrl.trim();
              if (!url) return;
              // Reject javascript:/data: at submit time — the server-side
              // sanitizer would strip them anyway, but failing here gives a
              // clearer signal to the operator.
              if (/^\s*(javascript|data|vbscript):/i.test(url)) {
                toast.error(t.linkInvalidProtocol);
                return;
              }
              const label = linkLabel.trim() || url;
              if (codeSelection.current === null) {
                // Visual mode — drive TipTap's link mark.
                editor!.chain().focus()
                  .extendMarkRange("link")
                  .insertContent({
                    type: "text",
                    text: label,
                    marks: [{ type: "link", attrs: { href: url } }],
                  })
                  .run();
              } else {
                // Code mode — splice <a href="…">label</a> at the snapshotted
                // selection range.
                const { start, end } = codeSelection.current;
                const next = value.slice(0, start) + `<a href="${url}">${label}</a>` + value.slice(end);
                onChange(next);
                requestAnimationFrame(() => {
                  const ta = codeRef.current;
                  if (!ta) return;
                  ta.focus();
                  const caret = start + `<a href="${url}">${label}</a>`.length;
                  ta.setSelectionRange(caret, caret);
                });
              }
              setLinkDialogOpen(false);
            }}
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">{t.linkLabelField}</label>
              <Input
                value={linkLabel}
                onChange={e => setLinkLabel(e.target.value)}
                placeholder={t.linkLabelPlaceholder}
                autoFocus={!linkLabel}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">{t.linkUrlField}</label>
              <Input
                type="url"
                value={linkUrl}
                onChange={e => setLinkUrl(e.target.value)}
                placeholder="https://exemple.org"
                autoFocus={!!linkLabel}
                required
              />
              <p className="text-[10px] text-muted-foreground">{t.linkProtocolsHint}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setLinkDialogOpen(false)}>
                {t.linkDialogCancel}
              </Button>
              <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                {t.linkDialogConfirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolbarBtn({ onClick, active, title, children }: {
  onClick: () => void; active?: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <Button type="button" size="icon" variant="ghost"
            onClick={onClick} title={title}
            className={`h-7 w-7 ${active ? "bg-accent text-accent-foreground" : ""}`}>
      {children}
    </Button>
  );
}

function Separator() { return <div className="w-px h-4 bg-border mx-0.5" />; }
