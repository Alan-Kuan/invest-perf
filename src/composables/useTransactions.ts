import { ref, computed } from 'vue';

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
  startDate?: string;
  endDate?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export function useTransactions() {
  const { query, execute } = useDatabase();
  const transactions = ref<Transaction[]>([]);
  const currentFilters = ref<TransactionFilters>({});

  function loadTransactions(filters: TransactionFilters = {}): Transaction[] {
    currentFilters.value = filters;
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

    if (filters.startDate) {
      sql += ' AND date >= ?';
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      sql += ' AND date <= ?';
      params.push(filters.endDate);
    }

    const order = filters.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY date ${order}, created_at ${order}`;

    transactions.value = query(sql, params) as unknown as Transaction[];
    return transactions.value;
  }

  function addTransaction(data: TransactionInput): string {
    const id = generateId();
    const total = data.shares * data.price;
    const fee = data.fee || 0;
    const tax = data.tax || 0;

    let netAmount: number;
    if (data.type === 'buy') {
      netAmount = total + fee;
    } else {
      netAmount = total - fee - tax;
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
        netAmount,
      ],
    );

    loadTransactions(currentFilters.value);
    return id;
  }

  function updateTransaction(id: string, data: TransactionInput): void {
    const total = data.shares * data.price;
    const fee = data.fee || 0;
    const tax = data.tax || 0;

    let netAmount: number;
    if (data.type === 'buy') {
      netAmount = total + fee;
    } else {
      netAmount = total - fee - tax;
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
        netAmount,
        id,
      ],
    );

    loadTransactions(currentFilters.value);
  }

  function deleteTransaction(id: string): void {
    execute('DELETE FROM transactions WHERE id = ?', [id]);
    loadTransactions(currentFilters.value);
  }

  const getStats = computed(() => {
    const stats = {
      totalBuy: 0,
      totalSell: 0,
      buyCount: 0,
      sellCount: 0,
    };

    transactions.value.forEach(t => {
      if (t.type === 'buy') {
        stats.totalBuy += t.net_amount;
        stats.buyCount++;
      } else {
        stats.totalSell += t.net_amount;
        stats.sellCount++;
      }
    });

    return stats;
  });

  return {
    transactions,
    loadTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getStats,
  };
}
