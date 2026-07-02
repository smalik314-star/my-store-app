import { ReactNode } from 'react';

export type AIIntent = 
  | 'REVENUE_TODAY'
  | 'REVENUE_MONTHLY'
  | 'SALES_TOTAL'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK'
  | 'EXPIRY_ITEMS'
  | 'TOP_CUSTOMERS'
  | 'PENDING_DUES'
  | 'NEW_CUSTOMERS'
  | 'TOTAL_PROFIT'
  | 'PROFIT_7DAYS'
  | 'HIGH_MARGIN_PRODUCTS'
  | 'UNKNOWN';

export interface AIResponse {
  id: string;
  query: string;
  answer: string;
  intent: AIIntent;
  data?: any;
  type: 'text' | 'number' | 'list' | 'chart';
  actions?: AIAction[];
  timestamp: Date;
}

export interface AIAction {
  label: string;
  path: string;
  icon?: string;
}

export interface AIState {
  history: AIResponse[];
  isOpen: boolean;
  isLoading: boolean;
  lastContext: {
    lastQuery?: string;
    lastModule?: string;
  };
}
