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
  start_date?: string;
  end_date?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface DividendInput {
  pay_date: string;
  ticker: string;
  name: string;
  category: 'cash' | 'stock';
  shares: number;
  per_share: number;
  fee?: number;
}

export function useDividends() {
  const { query, execute } = useDatabase();
  const dividends = ref<Dividend[]>([]);
  const current_filters = ref<DividendFilters>({});

  const loadDividends = (filters: DividendFilters = {}): Dividend[] => {
    current_filters.value = filters;
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

    if (filters.start_date) {
      sql += ' AND pay_date >= ?';
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      sql += ' AND pay_date <= ?';
      params.push(filters.end_date);
    }

    const order = filters.sort_order === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY pay_date ${order}, created_at ${order}`;

    dividends.value = query(sql, params) as unknown as Dividend[];
    return dividends.value;
  };

  const addDividend = (data: DividendInput): string => {
    const id = generateId();
    const amount = data.shares * data.per_share - (data.fee || 0);

    execute(
      `INSERT INTO dividends (id, pay_date, ticker, name, category, shares, per_share, fee, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.pay_date,
        data.ticker,
        data.name || '',
        data.category,
        data.shares,
        data.per_share,
        data.fee || 0,
        amount,
      ],
    );

    loadDividends(current_filters.value);
    return id;
  };

  const updateDividend = (id: string, data: DividendInput): void => {
    const amount = data.shares * data.per_share - (data.fee || 0);

    execute(
      `UPDATE dividends SET pay_date=?, ticker=?, name=?, category=?, shares=?, per_share=?, fee=?, amount=? WHERE id=?`,
      [
        data.pay_date,
        data.ticker,
        data.name || '',
        data.category,
        data.shares,
        data.per_share,
        data.fee || 0,
        amount,
        id,
      ],
    );

    loadDividends(current_filters.value);
  };

  const deleteDividend = (id: string): void => {
    execute('DELETE FROM dividends WHERE id = ?', [id]);
    loadDividends(current_filters.value);
  };

  const getAvailableYears = (): string[] => {
    const sql = `SELECT DISTINCT strftime('%Y', pay_date) as year FROM dividends ORDER BY year DESC`;
    const result = query(sql) as { year: string }[];
    return result.map(r => r.year);
  };

  const getDividendsByTicker = (ticker: string, year: number): number => {
    const start_date = `${year}-01-01`;
    const end_date = `${year}-12-31`;
    const sql = `
      SELECT COALESCE(SUM(CASE WHEN category = 'cash' THEN amount ELSE 0 END), 0) +
             COALESCE(SUM(CASE WHEN category = 'stock' THEN shares * per_share ELSE 0 END), 0) as total
      FROM dividends
      WHERE ticker = ? AND pay_date >= ? AND pay_date <= ?
    `;
    const result = query(sql, [ticker, start_date, end_date]) as { total: number }[];
    return result[0]?.total || 0;
  };

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
