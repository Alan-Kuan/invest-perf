import { ref } from 'vue';

import { generateId } from '../db';
import { useDatabase } from './useDatabase';

export interface Dividend {
  id: string;
  pay_date: string;
  ticker: string;
  name: string;
  category: 'cash' | 'stock';
  shares: number;
  per_share: number;
  fee: number;
  amount: number;
  created_at?: string;
}

interface DividendFilters {
  ticker?: string;
  category?: string;
  year?: string | null;
  startDate?: string;
  endDate?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface DividendInput {
  payDate: string;
  ticker: string;
  name: string;
  category: 'cash' | 'stock';
  shares: number;
  perShare: number;
  fee?: number;
}

export function useDividends() {
  const { query, execute } = useDatabase();
  const dividends = ref<Dividend[]>([]);
  const currentFilters = ref<DividendFilters>({});

  function loadDividends(filters: DividendFilters = {}): Dividend[] {
    currentFilters.value = filters;
    let sql = 'SELECT * FROM dividends WHERE 1=1';
    const params: string[] = [];

    if (filters.ticker) {
      sql += ' AND (ticker LIKE ? OR name LIKE ?)';
      params.push(`%${filters.ticker}%`, `%${filters.ticker}%`);
    }

    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    if (filters.year) {
      sql += ' AND strftime("%Y", pay_date) = ?';
      params.push(filters.year.toString());
    }

    if (filters.startDate) {
      sql += ' AND pay_date >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND pay_date <= ?';
      params.push(filters.endDate);
    }

    const order = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY pay_date ${order}, created_at ${order}`;

    dividends.value = query(sql, params) as unknown as Dividend[];
    return dividends.value;
  }

  function addDividend(data: DividendInput): string {
    const id = generateId();
    const amount = data.shares * data.perShare - (data.fee || 0);

    execute(
      `INSERT INTO dividends (id, pay_date, ticker, name, category, shares, per_share, fee, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.payDate,
        data.ticker,
        data.name || '',
        data.category,
        data.shares,
        data.perShare,
        data.fee || 0,
        amount,
      ],
    );

    loadDividends(currentFilters.value);
    return id;
  }

  function updateDividend(id: string, data: DividendInput): void {
    const amount = data.shares * data.perShare - (data.fee || 0);

    execute(
      `UPDATE dividends SET pay_date=?, ticker=?, name=?, category=?, shares=?, per_share=?, fee=?, amount=? WHERE id=?`,
      [
        data.payDate,
        data.ticker,
        data.name || '',
        data.category,
        data.shares,
        data.perShare,
        data.fee || 0,
        amount,
        id,
      ],
    );

    loadDividends(currentFilters.value);
  }

  function deleteDividend(id: string): void {
    execute('DELETE FROM dividends WHERE id = ?', [id]);
    loadDividends(currentFilters.value);
  }

  function getAvailableYears(): string[] {
    const sql = `SELECT DISTINCT strftime('%Y', pay_date) as year FROM dividends ORDER BY year DESC`;
    const result = query(sql) as { year: string }[];
    return result.map(r => r.year);
  }

  function getDividendsByTicker(ticker: string, year: number): number {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    const sql = `
      SELECT COALESCE(SUM(CASE WHEN category = 'cash' THEN amount ELSE 0 END), 0) +
             COALESCE(SUM(CASE WHEN category = 'stock' THEN shares * per_share ELSE 0 END), 0) as total
      FROM dividends
      WHERE ticker = ? AND pay_date >= ? AND pay_date <= ?
    `;
    const result = query(sql, [ticker, startDate, endDate]) as { total: number }[];
    return result[0]?.total || 0;
  }

  return {
    dividends,
    loadDividends,
    addDividend,
    updateDividend,
    deleteDividend,
    getAvailableYears,
    getDividendsByTicker,
  };
}
