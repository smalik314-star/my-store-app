import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  limit, 
  Timestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { Product, Invoice } from '../types';

export interface ProductIntelligence {
  productId: string;
  dailySalesAvg: number;
  expectedDepletionDate: Date | null;
  recommendedRestockDate: Date | null;
  status: 'Healthy' | 'Watch' | 'Critical';
  movement: 'Fast Moving' | 'Normal' | 'Slow Moving' | 'Dead Stock';
  healthScore: number;
  reorderRequired: boolean;
  suggestedQuantity: number;
}

export const inventoryIntelligenceService = {
  async analyzeProducts(products: Product[], tenantId?: string): Promise<Record<string, ProductIntelligence>> {
    if (!tenantId) return {};

    // Fetch invoices from last 60 days to analyze movement
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    const q = query(
      collection(db, 'invoices'),
      where('tenantId', '==', tenantId),
      where('createdAt', '>=', Timestamp.fromDate(sixtyDaysAgo))
    );

    const snapshot = await getDocs(q);
    const invoices = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));

    const analysis: Record<string, ProductIntelligence> = {};

    products.forEach(product => {
      const productInvoices = invoices.filter(inv => 
        inv.items.some(item => item.productId === product.id)
      );

      // 1. Calculate Daily Sales Avg
      let totalSold = 0;
      productInvoices.forEach(inv => {
        const item = inv.items.find(i => i.productId === product.id);
        if (item) totalSold += item.quantity;
      });
      const dailySalesAvg = totalSold / 60;

      // 2. Expected Depletion
      let expectedDepletionDate: Date | null = null;
      if (dailySalesAvg > 0) {
        const daysLeft = product.stockQuantity / dailySalesAvg;
        expectedDepletionDate = new Date();
        expectedDepletionDate.setDate(expectedDepletionDate.getDate() + daysLeft);
      }

      // 3. Movement Classification
      let movement: ProductIntelligence['movement'] = 'Normal';
      if (totalSold === 0) {
        movement = 'Dead Stock';
      } else if (totalSold < 5) {
        movement = 'Slow Moving';
      } else if (totalSold > 50) {
        movement = 'Fast Moving';
      }

      // 4. Reorder Logic
      const reorderRequired = product.stockQuantity <= product.minimumStock;
      const suggestedQuantity = reorderRequired ? product.minimumStock * 2 : 0;

      // 5. Health Score (0-100)
      let healthScore = 100;
      if (product.stockQuantity === 0) healthScore = 0;
      else if (product.stockQuantity <= product.minimumStock) healthScore = 30;
      else if (movement === 'Dead Stock') healthScore = 50;

      // Expiry risk deduction
      const expiryDate = product.expiryDate?.toDate ? product.expiryDate.toDate() : new Date(product.expiryDate);
      const daysToExpiry = (expiryDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24);
      if (daysToExpiry < 30) healthScore = Math.min(healthScore, 20);
      else if (daysToExpiry < 90) healthScore = Math.min(healthScore, 60);

      // 6. Status
      let status: ProductIntelligence['status'] = 'Healthy';
      if (healthScore < 40) status = 'Critical';
      else if (healthScore < 70) status = 'Watch';

      analysis[product.id] = {
        productId: product.id,
        dailySalesAvg,
        expectedDepletionDate,
        recommendedRestockDate: expectedDepletionDate ? new Date(expectedDepletionDate.getTime() - (7 * 24 * 60 * 60 * 1000)) : null, // 1 week before
        status,
        movement,
        healthScore,
        reorderRequired,
        suggestedQuantity
      };
    });

    return analysis;
  }
};
