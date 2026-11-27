import type { VirtualFile } from './types';
import { cloneBytes, createVirtualFile, normalizeVirtualPath } from './vfsHelpers';

const DB_NAME = 'offline-cpp-studio-vfs';
const DB_VERSION = 1;
const STORE_NAME = 'files';

interface StoredVirtualFileRecord {
  name: string;
  bytes: Uint8Array;
  content: string;
  updatedAt: number;
  size: number;
  isBinary?: boolean;
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
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'name' });
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
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      const rawList = Array.isArray(req.result) ? req.result : [];
      const sanitized: VirtualFile[] = [];
      for (const item of rawList) {
        if (!item || typeof item.name !== 'string') continue;
        const normalized = normalizeVirtualPath(item.name);
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

export async function putFileToIdb(file: VirtualFile): Promise<void> {
  const db = await openVfsDb();
  const record = toIdbRecord(file);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
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
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
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

export async function deleteFileFromIdb(name: string): Promise<void> {
  const normalized = normalizeVirtualPath(name);
  const db = await openVfsDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
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
  deletes: string[]
): Promise<void> {
  if (upserts.length === 0 && deletes.length === 0) return;
  const db = await openVfsDb();
  const records = upserts.map(toIdbRecord);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const record of records) {
      store.put(record);
    }
    for (const name of deletes) {
      const normalized = normalizeVirtualPath(name);
      if (normalized) store.delete(normalized);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Ошибка синхронизации виртуальных файлов с IndexedDB.'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('Синхронизация виртуальных файлов с IndexedDB прервана.'));
  });
}

export async function renameFileInIdb(oldName: string, nextFile: VirtualFile): Promise<void> {
  const normalizedOld = normalizeVirtualPath(oldName);
  const db = await openVfsDb();
  const record = toIdbRecord(nextFile);
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    if (normalizedOld && normalizedOld !== nextFile.name) {
      store.delete(normalizedOld);
    }
    store.put(record);

    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(
        tx.error ??
          new Error(`Не удалось переименовать файл «${normalizedOld}» в «${nextFile.name}».`)
      );
    tx.onabort = () =>
      reject(tx.error ?? new Error(`Переименование файла «${normalizedOld}» прервано.`));
  });
}
