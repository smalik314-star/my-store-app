import type { LedgerEntry } from '../types';
import { addMoney, subtractMoney } from './currency';
import { toJsDate } from './date';

export interface RunningLedgerEntry extends LedgerEntry {
  runningBalance: number;
}

export const buildRunningLedger = (
  entries: LedgerEntry[],
  openingBalance = 0
): RunningLedgerEntry[] => {
  let balance = openingBalance;
  return [...entries]
    .sort((a, b) => toJsDate(a.createdAt).getTime() - toJsDate(b.createdAt).getTime())
    .map(entry => {
      balance = subtractMoney(addMoney(balance, Number(entry.debit) || 0), Number(entry.credit) || 0);
      return { ...entry, runningBalance: balance };
    });
};
