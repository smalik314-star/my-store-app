import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | number, formatStr: string = 'PP') {
  const { format } = require('date-fns');
  return format(date, formatStr);
}
