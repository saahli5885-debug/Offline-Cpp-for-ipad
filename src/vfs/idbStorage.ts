import type { VirtualFile, VirtualFolder } from './types';
import {
  cloneBytes,
  createVirtualFile,
  createVirtualFolder,
  normalizePath,
} from './vfsHelpers';

const DB_NAME = 'offline-cpp-studio-vfs';
const DB_VERSION = 2;
const FILES_STORE = 'files';
const FOLDERS_STORE = 'folders';

interface StoredVirtualFileRecord {
  name: string;
  bytes: Uint8Array;
  content: string;
  updatedAt: number;
  size: number;
  isBinary?: boolean;
}

interface StoredVirtualFolderRecord {
  path: string;
  updatedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openVfsDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB недоступна в этом браузере.'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      // Preserve existing v1 'files' store untouched so flat files migrate with zero data loss
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: 'name' });
      }
      // v2: explicit persistent folder entries (including empty folders)
      if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        db.createObjectStore(FOLDERS_STORE, { keyPath: 'path' });
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };

    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error('Не удалось открыть IndexedDB для виртуальных файлов.'));
    };

    req.onblocked = () => {
      dbPromise = null;
      reject(new Error('Хранилище IndexedDB заблокировано другой вкладкой.'));
    };
  });

  return dbPromise;
}

function toIdbRecord(file: VirtualFile): StoredVirtualFileRecord {
  const bytes = cloneBytes(file.bytes);
  return {
    name: file.name,
    bytes,
    content: file.isBinary ? '' : file.content,
    updatedAt: file.updatedAt,
    size: bytes.byteLength,
    isBinary: Boolean(file.isBinary),
  };
}

function toIdbFolderRecord(folder: VirtualFolder): StoredVirtualFolderRecord {
  return {
    path: normalizePath(folder.path),
    updatedAt: folder.updatedAt,
  };
}

function extractStoredBytes(rawBytes: unknown): Uint8Array | null {
  if (rawBytes instanceof Uint8Array) {
    return cloneBytes(rawBytes);
  }
  if (rawBytes instanceof ArrayBuffer) {
    return new Uint8Array(rawBytes.slice(0));
  }
  if (ArrayBuffer.isView(rawBytes)) {
    return cloneBytes(new Uint8Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength));
  }
  return null;
}

export async function loadAllFilesFromIdb(): Promise<VirtualFile[]> {
  const db = await openVfsDb();
  return new Promise<VirtualFile[]>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readonly');
    const store = tx.objectStore(FILES_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const rawList = Array.isArray(req.result) ? req.result : [];
      const sanitized: VirtualFile[] = [];
      for (const item of rawList) {
        if (!item || typeof item.name !== 'string') continue;
        const normalized = normalizePath(item.name);
        if (!normalized) continue;
        const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
        const storedBytes = extractStoredBytes(item.bytes);
        if (storedBytes) {
          sanitized.push(createVirtualFile(normalized, storedBytes, updatedAt));
        } else if (typeof item.content === 'string') {
          sanitized.push(createVirtualFile(normalized, item.content, updatedAt));
        }
      }
      resolve(sanitized);
    };

    req.onerror = () => {
      reject(req.error ?? new Error('Ошибка чтения файлов из IndexedDB.'));
    };
  });
}

export async function loadAllFoldersFromIdb(): Promise<VirtualFolder[]> {
  const db = await openVfsDb();
  if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
    return [];
  }
  return new Promise<VirtualFolder[]>((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readonly');
    const store = tx.objectStore(FOLDERS_STORE);
    const req = store.getAll();

    req.onsuccess = () => {
      const rawList = Array.isArray(req.result) ? req.result : [];
      const sanitized: VirtualFolder[] = [];
      for (const item of rawList) {
        if (!item || typeof item.path !== 'string') continue;
        const normalized = normalizePath(item.path);
        if (!normalized) continue;
        const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : Date.now();
        sanitized.push(createVirtualFolder(normalized, updatedAt));
      }
      resolve(sanitized);
    };

    req.onerror = () => {
      reject(req.error ?? new Error('Ошибка чтения папок из IndexedDB.'));
    };
  });
}

export async function putFileToIdb(file: VirtualFile): Promise<void> {
  const db = await openVfsDb();
  const record = toIdbRecord(file);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    const store = tx.objectStore(FILES_STORE);
    store.put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error(`Не удалось сохранить файл «${file.name}» в IndexedDB.`));
    tx.onabort = () =>
      reject(tx.error ?? new Error(`Сохранение файла «${file.name}» прервано.`));
  });
}

export async function putFilesBatchToIdb(files: VirtualFile[]): Promise<void> {
  if (files.length === 0) return;
  const db = await openVfsDb();
  const records = files.map(toIdbRecord);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    const store = tx.objectStore(FILES_STORE);
    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Не удалось сохранить пакет файлов в IndexedDB.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Пакетное сохранение файлов в IndexedDB прервано.'));
  });
}

export async function putFoldersBatchToIdb(folders: VirtualFolder[]): Promise<void> {
  if (folders.length === 0) return;
  const db = await openVfsDb();
  const records = folders.map(toIdbFolderRecord).filter((r) => r.path.length > 0);
  if (records.length === 0) return;
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDERS_STORE, 'readwrite');
    const store = tx.objectStore(FOLDERS_STORE);
    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Не удалось сохранить папки в IndexedDB.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Сохранение папок в IndexedDB прервано.'));
  });
}

export async function deleteFileFromIdb(name: string): Promise<void> {
  const normalized = normalizePath(name);
  const db = await openVfsDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FILES_STORE, 'readwrite');
    const store = tx.objectStore(FILES_STORE);
    store.delete(normalized);

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error(`Не удалось удалить файл «${normalized}» из IndexedDB.`));
    tx.onabort = () =>
      reject(tx.error ?? new Error(`Удаление файла «${normalized}» прервано.`));
  });
}

export async function applyVfsDeltaToIdb(
  upserts: VirtualFile[],
  deletes: string[],
  folderUpserts: VirtualFolder[] = []
): Promise<void> {
  return applyWorkspaceMutationToIdb(upserts, deletes, folderUpserts, []);
}

/**
 * Atomically updates files and folders across both IndexedDB stores in a single transaction.
 */
export async function applyWorkspaceMutationToIdb(
  fileUpserts: VirtualFile[],
  fileDeletes: string[],
  folderUpserts: VirtualFolder[],
  folderDeletes: string[]
): Promise<void> {
  if (
    fileUpserts.length === 0 &&
    fileDeletes.length === 0 &&
    folderUpserts.length === 0 &&
    folderDeletes.length === 0
  ) {
    return;
  }

  const db = await openVfsDb();
  const fileRecords = fileUpserts.map(toIdbRecord);
  const folderRecords = folderUpserts.map(toIdbFolderRecord).filter((r) => r.path.length > 0);
  const stores: string[] = [FILES_STORE];
  if (db.objectStoreNames.contains(FOLDERS_STORE)) {
    stores.push(FOLDERS_STORE);
  }

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    const filesStore = tx.objectStore(FILES_STORE);
    for (const record of fileRecords) {
      filesStore.put(record);
    }
    for (const name of fileDeletes) {
      const normalized = normalizePath(name);
      if (normalized) filesStore.delete(normalized);
    }

    if (stores.includes(FOLDERS_STORE)) {
      const foldersStore = tx.objectStore(FOLDERS_STORE);
      for (const record of folderRecords) {
        foldersStore.put(record);
      }
      for (const folderPath of folderDeletes) {
        const normalized = normalizePath(folderPath);
        if (normalized) foldersStore.delete(normalized);
      }
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Ошибка синхронизации рабочей области с IndexedDB.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Синхронизация рабочей области с IndexedDB прервана.'));
  });
}

export async function renameFileInIdb(
  oldName: string,
  nextFile: VirtualFile,
  folderUpserts: VirtualFolder[] = []
): Promise<void> {
  const normalizedOld = normalizePath(oldName);
  const fileDeletes = normalizedOld && normalizedOld !== nextFile.name ? [normalizedOld] : [];
  return applyWorkspaceMutationToIdb([nextFile], fileDeletes, folderUpserts, []);
}
