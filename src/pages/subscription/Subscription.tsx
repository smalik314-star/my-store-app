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
  Users as UsersIcon,
  Mail,
  Share2,
  Gift,
  AlertCircle,
  Sparkles,
  Clock
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { tenantService } from '../../services/tenantService';
import { Tenant, SubscriptionPlan } from '../../types';
import { useToast } from '../../context/ToastContext';

// Updated plans pricing
const plans = [
  {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceAnnually: 0,
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
    priceMonthly: 199,
    priceAnnually: 1990,
    description: 'Grow your business with advanced tools',
    features: [
      'Up to 1000 invoices/mo',
      'Up to 5000 products',
      'AI Inventory Insights',
      'Up to 5 users',
      'Priority email support'
    ],
    limits: { invoices: 1000, products: 5000, users: 5 },
    recommended: true,
    hasTrial: true
  },
  {
    id: 'business',
    name: 'Business',
    priceMonthly: 399,
    priceAnnually: 3990,
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
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'annually'>('monthly');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);

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

  const handleStartProTrial = async () => {
    if (!user?.tenantId) return;
    setUpgradingPlan('pro');
    try {
      await tenantService.startProTrial(user.tenantId);
      const updatedTenant = await tenantService.getTenant(user.tenantId);
      setTenant(updatedTenant);
      showToast("Your 30-Day Free Trial of PharmaFlow Pro has started!", "success");
    } catch (error) {
      showToast("Failed to start trial. Please try again.", "danger");
    } finally {
      setUpgradingPlan(null);
    }
  };

  const handleSendInvite = async () => {
    if (!user?.tenantId || !tenant) return;
    const trimmedEmail = inviteEmail.trim().toLowerCase();
    if (!trimmedEmail) {
      showToast("Please enter an email address.", "warning");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showToast("Please enter a valid email address.", "warning");
      return;
    }

    const currentInvites = tenant.invites || [];
    if (currentInvites.includes(trimmedEmail)) {
      showToast("This email has already been invited!", "warning");
      return;
    }

    setInviting(true);
    try {
      const updatedInvites = [...currentInvites, trimmedEmail];
      const willBeExtended = updatedInvites.length >= 5;
      
      let newTrialEndsAt = tenant.trialEndsAt;
      if (willBeExtended && !tenant.isTrialExtended) {
        const currentEnds = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : new Date();
        currentEnds.setDate(currentEnds.getDate() + 30);
        newTrialEndsAt = currentEnds.toISOString();
      }

      await tenantService.updateInvites(
        user.tenantId, 
        updatedInvites, 
        willBeExtended || (tenant.isTrialExtended || false),
        newTrialEndsAt
      );

      const updatedTenant = await tenantService.getTenant(user.tenantId);
      setTenant(updatedTenant);
      setInviteEmail('');
      
      if (willBeExtended && !tenant.isTrialExtended) {
        showToast("🎉 Success! You've invited 5 people and unlocked your Pro trial extension!", "success");
      } else {
        showToast(`Invite sent to ${trimmedEmail} successfully!`, "success");
      }
    } catch (error) {
      showToast("Failed to send invite. Please try again.", "danger");
    } finally {
      setInviting(false);
    }
  };

  const handleWhatsAppInvite = async () => {
    if (!user?.tenantId || !tenant) return;
    
    const currentInvites = tenant.invites || [];
    const placeholderEmail = `whatsapp_invite_${Math.random().toString(36).substr(2, 5)}@pharmaflow.app`;
    
    const updatedInvites = [...currentInvites, placeholderEmail];
    const willBeExtended = updatedInvites.length >= 5;
    
    let newTrialEndsAt = tenant.trialEndsAt;
    if (willBeExtended && !tenant.isTrialExtended) {
      const currentEnds = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : new Date();
      currentEnds.setDate(currentEnds.getDate() + 30);
      newTrialEndsAt = currentEnds.toISOString();
    }

    try {
      await tenantService.updateInvites(
        user.tenantId,
        updatedInvites,
        willBeExtended || (tenant.isTrialExtended || false),
        newTrialEndsAt
      );
      
      const updatedTenant = await tenantService.getTenant(user.tenantId);
      setTenant(updatedTenant);

      const inviteMessage = `Hey! I'm using PharmaFlow to manage my pharmacy billing and inventory. It is incredibly easy to use. Check it out and sign up here: https://pharmaflow.app/invite?ref=${user.tenantId}`;
      const encodedMessage = encodeURIComponent(inviteMessage);
      const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMessage}`;
      
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      
      if (willBeExtended && !tenant.isTrialExtended) {
        showToast("🎉 Success! Shared via WhatsApp and unlocked your Pro trial extension!", "success");
      } else {
        showToast("WhatsApp invite link generated and referral progress updated!", "success");
      }
    } catch (error) {
      showToast("Failed to register WhatsApp share. Please try again.", "danger");
    }
  };

  const getTrialDetails = () => {
    if (!tenant || tenant.plan !== 'pro' || !tenant.trialStartedAt || !tenant.trialEndsAt) {
      return null;
    }
    const trialEnds = new Date(tenant.trialEndsAt);
    const now = new Date();
    const diffTime = trialEnds.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isTrialExpired = diffDays <= 0;
    const invites = tenant.invites || [];
    const inviteCount = Math.min(invites.length, 5);
    const isTrialExtended = tenant.isTrialExtended || invites.length >= 5;

    return {
      diffDays: Math.max(diffDays, 0),
      isTrialExpired,
      invites,
      inviteCount,
      isTrialExtended
    };
  };

  const trialInfo = getTrialDetails();

  if (loading) return <div className="h-96 flex items-center justify-center">Loading plan details...</div>;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-black text-text tracking-tighter mb-4">Subscription & Billing</h1>
        <p className="text-text/60 font-medium">Manage your plan, limits, and unlock premium features</p>
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

      {/* Refer & Extend Section (Active for users on Pro plan) */}
      {tenant && tenant.plan === 'pro' && trialInfo && (
        <Card className="p-8 border-2 border-primary/20 bg-primary/5 rounded-[40px] mb-12 overflow-hidden relative">
          <div className="absolute -right-12 -bottom-12 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -left-12 -top-12 w-64 h-64 rounded-full bg-secondary/10 blur-3xl" />

          <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-8">
            <div className="flex-1 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="bg-primary/20 text-primary text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5">
                  <Gift className="h-3.5 w-3.5" /> Referral Program
                </span>
                {trialInfo.isTrialExtended ? (
                  <span className="bg-success/20 text-success text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="h-3.5 w-3.5" /> Extension Unlocked
                  </span>
                ) : trialInfo.isTrialExpired ? (
                  <span className="bg-danger/20 text-danger text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                    <AlertCircle className="h-3.5 w-3.5" /> Trial Expired
                  </span>
                ) : (
                  <span className="bg-secondary/20 text-secondary text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {trialInfo.diffDays} Days Remaining
                  </span>
                )}
              </div>

              <div>
                <h3 className="text-2xl font-black text-text tracking-tighter">Refer & Extend Trial</h3>
                <p className="text-sm text-text/70 mt-1 max-w-2xl font-medium">
                  Enjoying PharmaFlow Pro? Invite 5 friends to the platform. Once completed, your free trial will automatically extend for an additional 30 days!
                </p>
              </div>

              {/* Progress visualizer */}
              <div className="space-y-2 max-w-md">
                <div className="flex items-center justify-between text-xs font-bold text-text/60">
                  <span>Invite Progress</span>
                  <span className="font-black text-primary">{trialInfo.inviteCount} of 5 invited</span>
                </div>
                <div className="h-4 bg-text/5 rounded-full p-1 overflow-hidden flex items-center gap-1 border border-text/10">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(trialInfo.inviteCount / 5) * 100}%` }}
                    className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <div className="flex justify-between items-center gap-1 pt-1">
                  {[1, 2, 3, 4, 5].map((step) => {
                    const active = trialInfo.inviteCount >= step;
                    return (
                      <div 
                        key={step} 
                        className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-black transition-all ${
                          active 
                            ? 'bg-success text-white scale-110 shadow-md' 
                            : 'bg-text/5 text-text/40 border border-text/10'
                        }`}
                      >
                        {active ? '✓' : step}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="w-full md:w-80 space-y-4">
              {trialInfo.isTrialExtended ? (
                <div className="bg-success/10 border border-success/20 p-6 rounded-2xl text-center space-y-3">
                  <div className="h-12 w-12 bg-success/20 rounded-full flex items-center justify-center mx-auto text-success">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black text-text tracking-tight">30-Day Extension Unlocked!</h4>
                    <p className="text-xs text-text/60 font-medium mt-1">Thank you for sharing PharmaFlow. Your trial has been successfully extended.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="Enter friend's email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      disabled={inviting}
                      className="flex-1 px-4 py-3 bg-white border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary placeholder-text/30"
                    />
                    <Button 
                      onClick={handleSendInvite}
                      isLoading={inviting}
                      disabled={inviting}
                      className="px-4 py-3 rounded-xl flex items-center justify-center shrink-0"
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  </div>
                  <button
                    onClick={handleWhatsAppInvite}
                    className="w-full py-3 px-4 bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#25D366]/10"
                  >
                    <Share2 className="h-4 w-4" /> Share via WhatsApp
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Billing toggle */}
      <div className="flex flex-col items-center justify-center mb-12 space-y-2">
        <div className="relative flex p-1.5 bg-text/5 border border-text/5 rounded-2xl w-fit">
          <button
            onClick={() => setBillingPeriod('monthly')}
            className={`relative px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              billingPeriod === 'monthly' ? 'text-primary font-black animate-none' : 'text-text/50 hover:text-text'
            }`}
          >
            {billingPeriod === 'monthly' && (
              <motion.div
                layoutId="billing-period-bg"
                className="absolute inset-0 bg-white shadow-md rounded-xl border border-text/5"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative z-10">Monthly</span>
          </button>
          <button
            onClick={() => setBillingPeriod('annually')}
            className={`relative px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
              billingPeriod === 'annually' ? 'text-primary font-black animate-none' : 'text-text/50 hover:text-text'
            }`}
          >
            {billingPeriod === 'annually' && (
              <motion.div
                layoutId="billing-period-bg"
                className="absolute inset-0 bg-white shadow-md rounded-xl border border-text/5"
                transition={{ type: "spring", stiffness: 350, damping: 30 }}
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              Annually
              <span className="bg-success/15 text-success text-[9px] px-2 py-0.5 rounded-full font-black">
                2 Mos Free
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => {
          const isCurrent = tenant?.plan === plan.id;
          const price = billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceAnnually;
          const billingLabel = billingPeriod === 'monthly' ? '/month' : '/year';
          
          return (
            <Card 
              key={plan.id}
              className={`p-8 border-2 transition-all flex flex-col h-full relative ${
                plan.recommended 
                  ? 'border-primary ring-4 ring-primary/5 shadow-2xl md:scale-105 z-10' 
                  : 'border-border hover:border-text/15 shadow-sm'
              } ${isCurrent ? 'border-success ring-4 ring-success/5' : ''}`}
            >
              {plan.recommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                  Most Popular
                </div>
              )}

              {isCurrent && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-success text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                  Current Plan
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-2xl font-black text-text tracking-tighter mb-2">{plan.name}</h3>
                <p className="text-sm text-text/60 font-medium h-10">{plan.description}</p>
                <div className="mt-6 flex flex-col gap-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-black text-text tracking-tighter">₹{price.toLocaleString()}</span>
                    <span className="text-text/40 font-bold">{billingLabel}</span>
                  </div>
                  
                  {billingPeriod === 'annually' && price > 0 && (
                    <span className="text-[10px] text-success font-black uppercase tracking-wider">
                      Save ₹{(plan.priceMonthly * 2).toLocaleString()} / year (2 months free)
                    </span>
                  )}
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

              {isCurrent ? (
                <Button
                  variant="outline"
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest"
                  disabled={true}
                >
                  Current Plan
                </Button>
              ) : plan.hasTrial ? (
                <Button
                  variant={plan.recommended ? 'primary' : 'secondary'}
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest bg-gradient-to-r from-primary to-primary/90 hover:from-primary/95 hover:to-primary"
                  onClick={handleStartProTrial}
                  isLoading={upgradingPlan === plan.id}
                >
                  Start 30-Day Free Trial
                </Button>
              ) : (
                <Button
                  variant={plan.recommended ? 'primary' : 'secondary'}
                  className="w-full h-14 rounded-2xl font-black uppercase tracking-widest"
                  onClick={() => handleUpgrade(plan.id as SubscriptionPlan)}
                  isLoading={upgradingPlan === plan.id}
                >
                  {plan.priceMonthly === 0 ? 'Downgrade' : 'Upgrade Now'}
                </Button>
              )}
            </Card>
          );
        })}
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
