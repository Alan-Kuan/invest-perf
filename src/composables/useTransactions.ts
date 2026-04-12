import { ref } from 'vue';

import { generateId } from '../db';
import { useDatabase } from './useDatabase';

export interface Transaction {
  id: string;
  date: string;
  ticker: string;
  name: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  total: number;
  fee: number;
  tax: number;
  net_amount: number;
  created_at?: string;
}

export interface TransactionInput {
  date: string;
  ticker: string;
  name: string;
  type: 'buy' | 'sell';
  shares: number;
  price: number;
  fee?: number;
  tax?: number;
}

export interface TransactionFilters {
  ticker?: string;
  type?: string;
  start_date?: string;
  end_date?: string;
  sort_order?: 'ASC' | 'DESC';
}

export function useTransactions() {
  const { query, execute } = useDatabase();
  const transactions = ref<Transaction[]>([]);
  const current_filters = ref<TransactionFilters>({});

  const loadTransactions = (filters: TransactionFilters = {}): Transaction[] => {
    current_filters.value = filters;
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params: string[] = [];

    if (filters.ticker) {
      sql += ' AND (ticker LIKE ? OR name LIKE ?)';
      params.push(`%${filters.ticker}%`, `%${filters.ticker}%`);
    }

    if (filters.type) {
      sql += ' AND type = ?';
      params.push(filters.type);
    }

    if (filters.start_date) {
      sql += ' AND date >= ?';
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      sql += ' AND date <= ?';
      params.push(filters.end_date);
    }

    const order = filters.sort_order === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY date ${order}, created_at ${order}`;

    transactions.value = query(sql, params) as unknown as Transaction[];
    return transactions.value;
  };

  const addTransaction = (data: TransactionInput): string => {
    const id = generateId();
    const total = data.shares * data.price;
    const fee = data.fee || 0;
    const tax = data.tax || 0;

    let net_amount: number;
    if (data.type === 'buy') {
      net_amount = total + fee;
    } else {
      net_amount = total - fee - tax;
    }

    execute(
      `INSERT INTO transactions (id, date, ticker, name, type, shares, price, total, fee, tax, net_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.date,
        data.ticker,
        data.name || '',
        data.type,
        data.shares,
        data.price,
        total,
        fee,
        tax,
        net_amount,
      ],
    );

    loadTransactions(current_filters.value);
    return id;
  };

  const updateTransaction = (id: string, data: TransactionInput): void => {
    const total = data.shares * data.price;
    const fee = data.fee || 0;
    const tax = data.tax || 0;

    let net_amount: number;
    if (data.type === 'buy') {
      net_amount = total + fee;
    } else {
      net_amount = total - fee - tax;
    }

    execute(
      `UPDATE transactions SET date=?, ticker=?, name=?, type=?, shares=?, price=?, total=?, fee=?, tax=?, net_amount=? WHERE id=?`,
      [
        data.date,
        data.ticker,
        data.name || '',
        data.type,
        data.shares,
        data.price,
        total,
        fee,
        tax,
        net_amount,
        id,
      ],
    );

    loadTransactions(current_filters.value);
  };

  const deleteTransaction = (id: string): void => {
    execute('DELETE FROM transactions WHERE id = ?', [id]);
    loadTransactions(current_filters.value);
  };

  return {
    transactions,
    loadTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
