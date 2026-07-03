import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  Check, 
  Zap, 
  ShieldCheck, 
  CreditCard, 
  ArrowRight,
  TrendingUp,
  Package,
  FileText,
  Users as UsersIcon
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { tenantService } from '../../services/tenantService';
import { Tenant, SubscriptionPlan } from '../../types';
import { useToast } from '../../context/ToastContext';

const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    description: 'Perfect for small pharmacies starting out',
    features: [
      'Up to 50 invoices/mo',
      'Up to 100 products',
      'Basic reports',
      'Single user access',
      'Community support'
    ],
    limits: { invoices: 50, products: 100, users: 1 }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 999,
    description: 'Grow your business with advanced tools',
    features: [
      'Up to 1000 invoices/mo',
      'Up to 5000 products',
      'AI Inventory Insights',
      'Up to 5 users',
      'Priority email support'
    ],
    limits: { invoices: 1000, products: 5000, users: 5 },
    recommended: true
  },
  {
    id: 'business',
    name: 'Business',
    price: 2499,
    description: 'Full ERP power for large operations',
    features: [
      'Unlimited invoices*',
      'Up to 50000 products',
      'Multi-store management',
      'Up to 20 users',
      '24/7 dedicated support'
    ],
    limits: { invoices: 10000, products: 50000, users: 20 }
  }
];

export default function Subscription() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgradingPlan, setUpgradingPlan] = useState<string | null>(null);

  useEffect(() => {
    if (user?.tenantId) {
      tenantService.getTenant(user.tenantId).then(data => {
        setTenant(data);
        setLoading(false);
      });
    }
  }, [user?.tenantId]);

  const handleUpgrade = async (planId: SubscriptionPlan) => {
    if (!user?.tenantId) return;
    
    setUpgradingPlan(planId);
    try {
      // In a real app, you'd trigger Razorpay here
      // For now, we simulate the success
      await new Promise(resolve => setTimeout(resolve, 1500));
      await tenantService.upgradePlan(user.tenantId, planId);
      
      const updatedTenant = await tenantService.getTenant(user.tenantId);
      setTenant(updatedTenant);
      showToast(`Successfully upgraded to ${planId.toUpperCase()} plan!`, 'success');
    } catch (error) {
      showToast('Upgrade failed. Please try again.', 'danger');
    } finally {
      setUpgradingPlan(null);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center">Loading plan details...</div>;

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-text tracking-tighter mb-4">Subscription & Billing</h1>
        <p className="text-text/60 font-medium">Manage your plan and usage limits</p>
      </div>

      {/* Current Usage Stats */}
      {tenant && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <UsageCard 
            label="Monthly Invoices" 
            current={tenant.usage.invoicesCount} 
            limit={tenant.limits.maxInvoices} 
            icon={FileText}
            color="primary"
          />
          <UsageCard 
            label="Total Products" 
            current={tenant.usage.productsCount} 
            limit={tenant.limits.maxProducts} 
            icon={Package}
            color="success"
          />
          <UsageCard 
            label="Team Users" 
            current={tenant.usage.usersCount} 
            limit={tenant.limits.maxUsers} 
            icon={UsersIcon}
            color="info"
          />
        </div>
      )}

      {/* Pricing Plans */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <Card 
            key={plan.id}
            className={`p-8 border-2 transition-all flex flex-col h-full ${
              plan.recommended ? 'border-primary ring-4 ring-primary/5 shadow-2xl scale-105' : 'border-border hover:border-text/10'
            } ${tenant?.plan === plan.id ? 'border-success ring-4 ring-success/5' : ''}`}
          >
            {plan.recommended && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                Most Popular
              </div>
            )}

            {tenant?.plan === plan.id && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-success text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                Current Plan
              </div>
            )}

            <div className="mb-8">
              <h3 className="text-2xl font-black text-text tracking-tighter mb-2">{plan.name}</h3>
              <p className="text-sm text-text/60 font-medium h-10">{plan.description}</p>
              <div className="mt-6 flex items-baseline gap-1">
                <span className="text-4xl font-black text-text tracking-tighter">₹{plan.price}</span>
                <span className="text-text/40 font-bold">/month</span>
              </div>
            </div>

            <div className="space-y-4 mb-10 flex-1">
              {plan.features.map((feature, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-success" />
                  </div>
                  <span className="text-sm font-bold text-text/70">{feature}</span>
                </div>
              ))}
            </div>

            <Button
              variant={plan.id === tenant?.plan ? 'outline' : plan.recommended ? 'primary' : 'secondary'}
              className="w-full h-14 rounded-2xl font-black uppercase tracking-widest"
              onClick={() => handleUpgrade(plan.id as SubscriptionPlan)}
              isLoading={upgradingPlan === plan.id}
              disabled={plan.id === tenant?.plan}
            >
              {plan.id === tenant?.plan ? 'Current Plan' : plan.price === 0 ? 'Downgrade' : 'Upgrade Now'}
            </Button>
          </Card>
        ))}
      </div>

      <div className="mt-16 bg-surface border border-border p-8 rounded-[40px] flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center gap-6">
          <div className="h-16 w-16 rounded-[24px] bg-accent/10 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-accent" />
          </div>
          <div>
            <h4 className="text-xl font-black text-text tracking-tighter">Secure Payments via Razorpay</h4>
            <p className="text-sm text-text/60 font-medium">Cancel or switch plans anytime. No hidden charges.</p>
          </div>
        </div>
        <div className="flex gap-4">
          <div className="h-12 w-20 bg-white border border-border rounded-xl flex items-center justify-center">
            <CreditCard className="h-6 w-6 text-text/20" />
          </div>
          <div className="h-12 w-20 bg-white border border-border rounded-xl flex items-center justify-center font-bold text-text/40 italic">
            UPI
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageCard({ label, current, limit, icon: Icon, color }: any) {
  const percentage = Math.min((current / limit) * 100, 100);
  
  return (
    <Card className="p-6 border-border group">
      <div className="flex items-center justify-between mb-6">
        <div className={`p-3 rounded-2xl bg-${color}/10`}>
          <Icon className={`h-6 w-6 text-${color}`} />
        </div>
        <div className="text-right">
          <span className="text-[10px] font-black text-text/20 uppercase tracking-widest">{label}</span>
          <div className="flex items-baseline justify-end gap-1">
            <span className="text-2xl font-black text-text tracking-tighter">{current}</span>
            <span className="text-sm text-text/20 font-bold">/ {limit}</span>
          </div>
        </div>
      </div>
      
      <div className="h-2 w-full bg-text/5 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          className={`h-full bg-${color} rounded-full`}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      {percentage >= 90 && (
        <p className="text-[10px] font-black text-danger uppercase tracking-widest mt-2 flex items-center gap-1">
          <Zap className="h-3 w-3 fill-current" /> Near Limit!
        </p>
      )}
    </Card>
  );
}
