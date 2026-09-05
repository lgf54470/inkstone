import { type ParsedTable } from '../../../lib/markdown/table-editor';

export type ContextType =
  | 'selection'
  | 'table'
  | 'image'
  | 'math'
  | 'codeblock'
  | 'mermaid'
  | 'chart'
  | 'wikilink'
  | 'link'
  | 'frontmatter'
  | 'task'
  | 'empty';

export interface EditorContextData {
  type: ContextType;
  pos: number;
  lineNumber: number;
  selectedText?: string;
  table?: ParsedTable;
  image?: { alt: string; url: string; raw: string; from: number; to: number };
  math?: { formula: string; isBlock: boolean; from: number; to: number };
  codeBlock?: { language: string; code: string; from: number; to: number };
  mermaid?: { code: string; from: number; to: number };
  chart?: { code: string; from: number; to: number };
  wikiLink?: { target: string; alias?: string; from: number; to: number };
  link?: { text: string; url: string; from: number; to: number };
  task?: { checked: boolean; text: string; from: number; to: number };
}

export interface PreviewContextData {
  type: ContextType;
  target: HTMLElement;
  selectedText?: string;
  sourceLine?: number;
  table?: {
    rowIndex: number;
    colIndex: number;
    sourceLine?: number;
  };
  image?: {
    src: string;
    alt: string;
    sourceLine?: number;
  };
  math?: {
    formula: string;
    isBlock: boolean;
    sourceLine?: number;
  };
  codeBlock?: {
    language: string;
    code: string;
    sourceLine?: number;
  };
  mermaid?: {
    code: string;
    sourceLine?: number;
  };
  chart?: {
    code: string;
    sourceLine?: number;
  };
  wikiLink?: {
    noteTitle: string;
    sourceLine?: number;
  };
  link?: {
    text: string;
    url: string;
    sourceLine?: number;
  };
  task?: {
    checked: boolean;
    taskLine?: number;
  };
}
