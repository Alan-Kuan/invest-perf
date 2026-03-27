import { ref } from 'vue';
import { getDatabase } from '../db';

const isReady = ref(false);

export function useBackup() {
  const exportDatabase = (): void => {
    const db = getDatabase();
    if (!db) {
      alert('資料庫尚未初始化');
      return;
    }

    const data = db.export();
    const blob = new Blob([data as unknown as BlobPart], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const filename = `invest-perf-${date}.db`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  };

  const exportAsSQL = (): void => {
    const db = getDatabase();
    if (!db) {
      alert('資料庫尚未初始化');
      return;
    }

    const result = db.exec("SELECT * FROM sqlite_master WHERE type='table'");
    let sql = '-- Database Export\n-- Date: ' + new Date().toISOString() + '\n\n';

    const tables = result[0]?.values?.map((row: unknown[]) => row[1]) as string[] || [];

    for (const table of tables) {
      const createResult = db.exec(`SELECT sql FROM sqlite_master WHERE name='${table}'`);
      if (createResult[0]) {
        sql += (createResult[0].values[0][0] as string) + ';\n\n';
      }
    }

    for (const table of tables) {
      const selectResult = db.exec(`SELECT * FROM ${table}`);
      if (selectResult[0] && selectResult[0].values.length > 0) {
        const columns = selectResult[0].columns.join(', ');
        for (const row of selectResult[0].values) {
          const values = row.map((v: unknown) => {
            if (v === null) return 'NULL';
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
            return v;
          }).join(', ');
          sql += `INSERT INTO ${table} (${columns}) VALUES (${values});\n`;
        }
        sql += '\n';
      }
    }

    const blob = new Blob([sql], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const date = new Date().toISOString().split('T')[0];
    const filename = `invest-perf-${date}.sql`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
  };

  const importDatabase = (file: File): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);

          localStorage.setItem('invest_perf_import', JSON.stringify(Array.from(data)));

          const db = getDatabase();
          if (db) {
            db.close();
          }

          window.location.reload();
          resolve(true);
        } catch (err) {
          reject(err);
        }
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  };

  return {
    exportDatabase,
    exportAsSQL,
    importDatabase,
    isReady
  };
}
