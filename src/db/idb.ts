import {
  IDB_NAME,
  IDB_VERSION,
  STORE_NAME,
  HISTORICAL_PRICES_STORE,
  CURR_PRICES_STORE,
  ANNUAL_PERF_STORE,
  STOCK_LIST_STORE,
} from './constants';

let idb_instance: IDBDatabase | null = null;

export function openIndexedDB(): Promise<IDBDatabase> {
  if (idb_instance) return Promise.resolve(idb_instance);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      idb_instance = request.result;
      resolve(request.result);
    };

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const idb = (event.target as IDBOpenDBRequest).result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) {
        idb.createObjectStore(STORE_NAME);
      }
      if (!idb.objectStoreNames.contains(HISTORICAL_PRICES_STORE)) {
        idb.createObjectStore(HISTORICAL_PRICES_STORE);
      }
      if (!idb.objectStoreNames.contains(CURR_PRICES_STORE)) {
        idb.createObjectStore(CURR_PRICES_STORE);
      }
      if (!idb.objectStoreNames.contains(ANNUAL_PERF_STORE)) {
        idb.createObjectStore(ANNUAL_PERF_STORE);
      }
      if (!idb.objectStoreNames.contains(STOCK_LIST_STORE)) {
        idb.createObjectStore(STOCK_LIST_STORE);
      }
    };
  });
}

export async function getStoreItem(store_name: string, key: string): Promise<any> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store_name, 'readonly');
    const store = tx.objectStore(store_name);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function setStoreItem(store_name: string, key: string, value: any): Promise<void> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store_name, 'readwrite');
    const store = tx.objectStore(store_name);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(store_name: string): Promise<void> {
  const idb = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(store_name, 'readwrite');
    const store = tx.objectStore(store_name);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
