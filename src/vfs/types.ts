export interface VirtualFile {
  name: string;
  content: string;
  bytes: Uint8Array;
  updatedAt: number;
  size: number;
  isBinary?: boolean;
}

export interface VirtualFolder {
  path: string;
  updatedAt: number;
}

export interface HexDumpRow {
  offset: number;
  offsetHex: string;
  leftBytes: Array<number | null>;
  rightBytes: Array<number | null>;
  ascii: string;
}

export interface HexDumpPayload {
  path: string;
  totalBytes: number;
  bytes: Uint8Array;
}

export interface WorkspaceTreeFolderNode {
  kind: 'folder';
  path: string;
  name: string;
  depth: number;
  children: WorkspaceTreeNode[];
  fileCount: number;
}

export interface WorkspaceTreeFileNode {
  kind: 'file';
  path: string;
  name: string;
  depth: number;
  file: VirtualFile;
}

export type WorkspaceTreeNode = WorkspaceTreeFolderNode | WorkspaceTreeFileNode;

export type VfsChangeKind = 'created' | 'modified';

export interface VfsSyncDelta {
  created: string[];
  modified: string[];
  deleted: string[];
}

export interface VfsRuntimeChangeEvent {
  path: string;
  action: 'create' | 'modify' | 'delete';
  bytes?: Uint8Array;
  content?: string;
  snapshot: Record<string, Uint8Array>;
}
