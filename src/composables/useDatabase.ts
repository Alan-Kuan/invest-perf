import type { SqlValue } from 'sql.js/dist/sql-wasm.js';
import { ref } from 'vue';

import {
  initDatabase,
  getDatabase,
  saveDatabase,
  clearDatabase,
  exportDatabase,
  importDatabase,
} from '../db';

interface QueryResult {
  [key: string]: SqlValue;
}

const is_ready = ref(false);

export function useDatabase() {
  async function init(): Promise<void> {
    if (is_ready.value) return;

    try {
      await initDatabase();
      is_ready.value = true;
    } catch (e) {
      console.error('Database init error:', e);
    }
  }

  function query(sql: string, params: SqlValue[] = []): QueryResult[] {
    const db = getDatabase();
    if (!db) return [];

    try {
      const stmt = db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }

      const results: QueryResult[] = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject() as QueryResult);
      }
      stmt.free();

      return results;
    } catch (e) {
      console.error('Query error:', e);
      return [];
    }
  }

  async function execute(sql: string, params: SqlValue[] = []): Promise<void> {
    const db = getDatabase();
    if (!db) return;

    try {
      db.run(sql, params);
      await saveDatabase();
    } catch (e) {
      console.error('Execute error:', e);
    }
  }

  async function exportData(): Promise<void> {
    const data = await exportDatabase();
    if (!data) return;

    const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
    const date = new Date().toISOString().split('T')[0];
    const filename = `invest-perf-${date}.db`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(file: File): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = async e => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          await importDatabase(data);
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  async function clear(): Promise<void> {
    await clearDatabase();
    is_ready.value = false;
  }

  return {
    is_ready,
    init,
    query,
    execute,
    exportData,
    importData,
    clear,
  };
}
