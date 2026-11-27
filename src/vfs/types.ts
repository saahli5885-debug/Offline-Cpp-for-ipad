export interface VirtualFile {
  name: string;
  content: string;
  bytes: Uint8Array;
  updatedAt: number;
  size: number;
  isBinary?: boolean;
}

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
