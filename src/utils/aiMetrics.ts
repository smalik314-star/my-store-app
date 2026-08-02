export interface ProfitLineItem {
  price?: number;
  purchaseCost?: number;
  quantity?: number;
}

export interface ProfitInvoiceLike {
  items?: ProfitLineItem[];
}

export const sumInvoiceProfit = (invoices: ProfitInvoiceLike[]): number =>
  invoices.reduce((invoiceTotal, invoice) => (
    invoiceTotal + (invoice.items || []).reduce((lineTotal, item) => {
      const quantity = Number(item.quantity) || 0;
      const salePrice = Number(item.price) || 0;
      const purchaseCost = Number(item.purchaseCost) || 0;
      return lineTotal + ((salePrice - purchaseCost) * quantity);
    }, 0)
  ), 0);
