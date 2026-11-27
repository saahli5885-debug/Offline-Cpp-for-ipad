import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { cpp } from '@codemirror/lang-cpp';
import { tags } from '@lezer/highlight';
import type { CompilerDiagnostic } from '../types/compiler';
import type { AppTheme } from '../themes/themes';

export interface CodeEditorHandle {
  focus: () => void;
  getValue: () => string;
  jumpToLine: (line: number, column?: number | null) => void;
}

interface CodeEditorProps {
  value: string;
  onChange: (next: string) => void;
  theme: AppTheme;
  fontSize: number;
  lineWrapping: boolean;
  syntaxMode?: 'cpp' | 'plain';
  readOnly?: boolean;
  diagnostics: CompilerDiagnostic[];
  onRun: () => void;
  onFormat: () => void;
  onWidthChange?: (width: number) => void;
}

const setDiagnosticsEffect = StateEffect.define<{
  diagnostics: CompilerDiagnostic[];
  mode: 'dark' | 'light';
}>();

const diagnosticLinesField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDiagnosticsEffect)) {
        const { diagnostics, mode } = effect.value;
        const lineSeverity = new Map<number, 'error' | 'warning'>();
        for (const d of diagnostics) {
          if (d.line === null || d.line < 1 || d.line > tr.state.doc.lines) continue;
          if (d.severity === 'error') {
            lineSeverity.set(d.line, 'error');
          } else if (d.severity === 'warning' && !lineSeverity.has(d.line)) {
            lineSeverity.set(d.line, 'warning');
          }
        }

        const builder = new RangeSetBuilder<Decoration>();
        const sortedLines = Array.from(lineSeverity.entries()).sort((a, b) => a[0] - b[0]);
        for (const [lineNum, severity] of sortedLines) {
          const line = tr.state.doc.line(lineNum);
          const className =
            severity === 'error'
              ? mode === 'dark'
                ? 'cm-error-line-dark'
                : 'cm-error-line-light'
              : mode === 'dark'
                ? 'cm-warning-line-dark'
                : 'cm-warning-line-light';
          builder.add(line.from, line.from, Decoration.line({ class: className }));
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function createSyntaxHighlight(theme: AppTheme) {
  const s = theme.syntax;
  return HighlightStyle.define([
    { tag: [tags.keyword, tags.controlKeyword, tags.modifier], color: s.keyword },
    { tag: [tags.typeName, tags.className, tags.namespace], color: s.type },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: s.fn },
    { tag: [tags.string, tags.special(tags.string)], color: s.string },
    { tag: [tags.number, tags.bool, tags.atom], color: s.number },
    { tag: [tags.comment, tags.lineComment, tags.blockComment], color: s.comment, fontStyle: 'italic' },
    { tag: [tags.meta, tags.processingInstruction], color: s.meta },
    { tag: [tags.operator, tags.punctuation], color: s.operator },
    { tag: [tags.variableName, tags.propertyName], color: s.variable },
  ]);
}

function createEditorTheme(theme: AppTheme, fontSize: number) {
  const isDark = theme.mode === 'dark';
  const { ui, syntax } = theme;
  return EditorView.theme(
    {
      '&': {
        backgroundColor: ui.bgApp,
        color: ui.textPrimary,
        fontSize: `${fontSize}px`,
        lineHeight: '1.6',
      },
      '.cm-gutters': {
        backgroundColor: syntax.gutterBg,
        color: syntax.gutterText,
        borderRight: `1px solid ${syntax.gutterBorder}`,
        minWidth: '38px',
      },
      '.cm-lineNumbers .cm-gutterElement': {
        padding: '0 8px 0 6px',
        minWidth: '30px',
      },
      '.cm-activeLine': {
        backgroundColor: syntax.activeLine,
      },
      '.cm-activeLineGutter': {
        backgroundColor: syntax.activeGutter,
        color: syntax.activeGutterText,
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: syntax.cursor,
        borderLeftWidth: '2px',
      },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: syntax.selection,
      },
      '.cm-matchingBracket': {
        backgroundColor: syntax.bracketBg,
        outline: `1px solid ${syntax.bracketOutline}`,
      },
      '.cm-panels': {
        backgroundColor: ui.bgSurface,
        color: ui.textPrimary,
        borderBottom: `1px solid ${ui.border}`,
      },
      '.cm-searchMatch': {
        backgroundColor: syntax.searchMatch,
      },
    },
    { dark: isDark }
  );
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  {
    value,
    onChange,
    theme,
    fontSize,
    lineWrapping,
    syntaxMode = 'cpp',
    readOnly = false,
    diagnostics,
    onRun,
    onFormat,
    onWidthChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartmentRef = useRef(new Compartment());
  const wrapCompartmentRef = useRef(new Compartment());
  const langCompartmentRef = useRef(new Compartment());
  const readOnlyCompartmentRef = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onFormatRef = useRef(onFormat);
  const onWidthChangeRef = useRef(onWidthChange);
  const isExternalSyncRef = useRef(false);

  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onFormatRef.current = onFormat;
  onWidthChangeRef.current = onWidthChange;

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    getValue() {
      return viewRef.current?.state.doc.toString() ?? '';
    },
    jumpToLine(lineNumber: number, column?: number | null) {
      const view = viewRef.current;
      if (!view) return;
      const clampedLine = Math.max(1, Math.min(lineNumber, view.state.doc.lines));
      const line = view.state.doc.line(clampedLine);
      const colOffset = column && column > 0 ? Math.min(column - 1, line.length) : 0;
      const pos = line.from + colOffset;
      view.dispatch({
        selection: { anchor: pos },
        scrollIntoView: true,
      });
      view.focus();
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const themeCompartment = themeCompartmentRef.current;
    const wrapCompartment = wrapCompartmentRef.current;
    const langCompartment = langCompartmentRef.current;
    const readOnlyCompartment = readOnlyCompartmentRef.current;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        drawSelection(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        bracketMatching(),
        highlightSelectionMatches(),
        langCompartment.of(
          syntaxMode === 'cpp' ? [cpp(), indentOnInput(), closeBrackets()] : []
        ),
        readOnlyCompartment.of(
          readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
        ),
        diagnosticLinesField,
        EditorView.contentAttributes.of({
          'aria-label': 'Редактор кода C++ и C',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
          autocomplete: 'off',
          'data-gramm': 'false',
          translate: 'no',
        }),
        themeCompartment.of([
          createEditorTheme(theme, fontSize),
          syntaxHighlighting(createSyntaxHighlight(theme)),
        ]),
        wrapCompartment.of(lineWrapping ? EditorView.lineWrapping : []),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              onRunRef.current();
              return true;
            },
          },
          {
            key: 'Mod-Shift-f',
            preventDefault: true,
            run: () => {
              onFormatRef.current();
              return true;
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalSyncRef.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: container,
    });
    viewRef.current = view;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) {
        onWidthChangeRef.current?.(Math.round(width));
      }
      view.requestMeasure();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      view.destroy();
      viewRef.current = null;
    };
    // Mount CodeMirror once; external value/theme/wrap/diagnostics sync via effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external document changes (template switch, format, language switch, file import)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      isExternalSyncRef.current = true;
      try {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
      } finally {
        isExternalSyncRef.current = false;
      }
    }
  }, [value]);

  // Sync theme & font size dynamically without remounting editor state/history
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartmentRef.current.reconfigure([
        createEditorTheme(theme, fontSize),
        syntaxHighlighting(createSyntaxHighlight(theme)),
      ]),
    });
    view.requestMeasure();
  }, [theme, fontSize]);

  // Sync word wrap dynamically without losing cursor position or undo stack
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: wrapCompartmentRef.current.reconfigure(
        lineWrapping ? EditorView.lineWrapping : []
      ),
    });
    view.requestMeasure();
  }, [lineWrapping]);

  // Sync language syntax mode (C/C++/headers vs plain text/data files)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: langCompartmentRef.current.reconfigure(
        syntaxMode === 'cpp' ? [cpp(), indentOnInput(), closeBrackets()] : []
      ),
    });
    view.requestMeasure();
  }, [syntaxMode]);

  // Sync read-only state (e.g. hex preview for binary files)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartmentRef.current.reconfigure(
        readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
      ),
    });
    view.requestMeasure();
  }, [readOnly]);

  // Sync error/warning line highlights
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setDiagnosticsEffect.of({ diagnostics, mode: theme.mode }),
    });
  }, [diagnostics, theme.mode]);

  return (
    <div
      ref={containerRef}
      data-testid="code-editor"
      data-wrap={lineWrapping ? 'on' : 'off'}
      data-syntax={syntaxMode}
      data-readonly={readOnly ? 'true' : 'false'}
      className="h-full w-full min-w-0 max-w-full box-border overflow-hidden bg-[var(--app-bg)]"
    />
  );
});
