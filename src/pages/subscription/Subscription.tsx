import { useEffect, useMemo, useState } from 'react';
import { Check, Clock, FileText, Package, ShieldCheck, Users } from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  type BillingPeriod,
  getEffectiveLimits,
  getEffectivePlan,
  isTrialActive,
  SUBSCRIPTION_PLANS,
} from '../../config/subscription';
import { tenantService } from '../../services/tenantService';
import type { SubscriptionPlan, SubscriptionRequest, Tenant } from '../../types';
import { toJsDate } from '../../utils/date';

export default function Subscription() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [requests, setRequests] = useState<SubscriptionRequest[]>([]);
  const [monthlyInvoiceUsage, setMonthlyInvoiceUsage] = useState(0);
  const [teamUserCount, setTeamUserCount] = useState(1);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('monthly');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadSubscription = async () => {
    if (!user?.tenantId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [tenantData, invoiceUsage, requestData, teamUsers] = await Promise.all([
        tenantService.getTenant(user.tenantId),
        tenantService.getMonthlyInvoiceUsage(user.tenantId),
        tenantService.getSubscriptionRequests(user.tenantId),
        tenantService.getTenantUsers(user.tenantId),
      ]);
      if (!tenantData) throw new Error('Store subscription profile was not found.');
      setTenant(tenantData);
      setMonthlyInvoiceUsage(invoiceUsage);
      setRequests(requestData);
      setTeamUserCount(Math.max(1, teamUsers.length));
    } catch (error: any) {
      setLoadError(error?.message || 'Unable to load subscription details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSubscription();
  }, [user?.tenantId]);

  const effectivePlan = tenant ? getEffectivePlan(tenant) : 'free';
  const limits = tenant ? getEffectiveLimits(tenant) : SUBSCRIPTION_PLANS.free.limits;
  const pendingRequest = useMemo(
    () => requests.find(request => request.status === 'pending'),
    [requests]
  );

  const trialDaysRemaining = tenant?.trialEndsAt && isTrialActive(tenant)
    ? Math.max(1, Math.ceil(
      (toJsDate(tenant.trialEndsAt).getTime() - Date.now()) / 86_400_000
    ))
    : 0;

  const handleStartTrial = async () => {
    if (!user?.tenantId || user.role !== 'owner') return;
    setBusyAction('trial');
    try {
      await tenantService.startProTrial(user.tenantId);
      await loadSubscription();
      showToast('30-day Pro trial started successfully.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Unable to start the trial.', 'danger');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePlanRequest = async (plan: Exclude<SubscriptionPlan, 'free'>) => {
    if (!user?.tenantId || user.role !== 'owner') return;
    if (pendingRequest) {
      showToast('A plan-change request is already pending.', 'warning');
      return;
    }
    setBusyAction(plan);
    try {
      await tenantService.requestPlanUpgrade(user.tenantId, plan, billingPeriod);
      await loadSubscription();
      showToast('Upgrade request submitted. Your plan will change only after payment verification.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Unable to submit the upgrade request.', 'danger');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDowngrade = async () => {
    if (!user?.tenantId || user.role !== 'owner') return;
    if (!window.confirm('Switch to Free plan limits now? Existing data will remain safe.')) return;
    setBusyAction('free');
    try {
      await tenantService.switchToFreePlan(user.tenantId);
      await loadSubscription();
      showToast('Workspace switched to the Free plan. Existing data was preserved.', 'success');
    } catch (error: any) {
      showToast(error?.message || 'Unable to change the plan.', 'danger');
    } finally {
      setBusyAction(null);
    }
  };

  if (user?.role !== 'owner') {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="p-8 text-center">
          <ShieldCheck className="h-10 w-10 text-primary mx-auto mb-3" />
          <h1 className="text-xl font-black text-text">Owner access required</h1>
          <p className="mt-2 text-sm text-text/60">
            Subscription and billing settings can only be managed by the workspace owner.
          </p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return <div className="h-96 flex items-center justify-center text-sm font-bold text-text/50">Loading subscription…</div>;
  }

  if (loadError || !tenant) {
    return (
      <div className="max-w-xl mx-auto p-6">
        <Card className="p-8 text-center">
          <p className="text-danger font-bold">{loadError || 'Subscription profile unavailable.'}</p>
          <Button className="mt-5" onClick={() => void loadSubscription()}>Retry</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 space-y-10">
      <div>
        <h1 className="text-3xl md:text-4xl font-black text-text tracking-tight">Plan & Subscription</h1>
        <p className="mt-2 text-text/60 font-medium">
          Current effective plan: <span className="font-black text-primary">{SUBSCRIPTION_PLANS[effectivePlan].name}</span>
        </p>
        {tenant.subscriptionStatus === 'trialing' && trialDaysRemaining > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-bold text-primary">
            <Clock className="h-4 w-4" /> Pro trial · {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining
          </div>
        )}
        {tenant.subscriptionStatus === 'trialing' && trialDaysRemaining === 0 && (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-bold text-warning">
            Pro trial has expired. Free-plan limits now apply automatically; your existing data remains safe.
          </div>
        )}
        {pendingRequest && (
          <div className="mt-4 rounded-xl border border-info/30 bg-info/10 px-4 py-3 text-sm font-bold text-info">
            {SUBSCRIPTION_PLANS[pendingRequest.requestedPlan].name} {pendingRequest.billingPeriod} upgrade request is pending verification.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <UsageCard label="Monthly invoices" current={monthlyInvoiceUsage} limit={limits.maxInvoices} icon={FileText} />
        <UsageCard label="Products" current={tenant.usage?.productsCount || 0} limit={limits.maxProducts} icon={Package} />
        <UsageCard label="Team users" current={teamUserCount} limit={limits.maxUsers} icon={Users} />
      </div>

      <div className="flex justify-center">
        <div className="flex rounded-2xl border border-border bg-background p-1">
          {(['monthly', 'annually'] as const).map(period => (
            <button
              key={period}
              type="button"
              onClick={() => setBillingPeriod(period)}
              className={`rounded-xl px-5 py-2.5 text-xs font-black uppercase ${
                billingPeriod === period ? 'bg-primary text-white' : 'text-text/50'
              }`}
            >
              {period === 'monthly' ? 'Monthly' : 'Annual · 2 months free'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {Object.values(SUBSCRIPTION_PLANS).map(plan => {
          const displayedPrice = billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceAnnually;
          const isEffective = effectivePlan === plan.id;
          const canStartTrial = plan.id === 'pro'
            && tenant.plan === 'free'
            && !tenant.trialStartedAt;
          return (
            <Card
              key={plan.id}
              className={`p-7 flex flex-col border-2 ${plan.recommended ? 'border-primary' : 'border-border'} ${
                isEffective ? 'ring-4 ring-success/10 border-success' : ''
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black text-text">{plan.name}</h2>
                  {isEffective && <span className="text-[10px] font-black text-success uppercase">Current</span>}
                </div>
                <p className="mt-2 min-h-10 text-sm text-text/60">{plan.description}</p>
                <p className="mt-5 text-3xl font-black text-text">
                  ₹{displayedPrice.toLocaleString('en-IN')}
                  <span className="text-xs text-text/40">/{billingPeriod === 'monthly' ? 'month' : 'year'}</span>
                </p>
              </div>
              <div className="my-7 flex-1 space-y-3">
                {plan.features.map(feature => (
                  <div key={feature} className="flex gap-2 text-sm font-bold text-text/70">
                    <Check className="h-4 w-4 mt-0.5 shrink-0 text-success" /> {feature}
                  </div>
                ))}
              </div>

              {isEffective ? (
                plan.id !== 'free' ? (
                  <Button variant="outline" onClick={handleDowngrade} isLoading={busyAction === 'free'}>
                    Switch to Free
                  </Button>
                ) : (
                  <Button variant="outline" disabled>Current Plan</Button>
                )
              ) : canStartTrial ? (
                <div className="space-y-2">
                  <Button onClick={handleStartTrial} isLoading={busyAction === 'trial'}>Start 30-Day Trial</Button>
                  <Button
                    variant="outline"
                    onClick={() => void handlePlanRequest('pro')}
                    disabled={Boolean(pendingRequest)}
                  >
                    Request Paid Pro
                  </Button>
                </div>
              ) : plan.id === 'free' ? (
                <Button variant="outline" onClick={handleDowngrade} isLoading={busyAction === 'free'}>
                  Switch to Free
                </Button>
              ) : (
                <Button
                  onClick={() => void handlePlanRequest(plan.id as Exclude<SubscriptionPlan, 'free'>)}
                  isLoading={busyAction === plan.id}
                  disabled={Boolean(pendingRequest)}
                >
                  {pendingRequest ? 'Request Pending' : `Request ${plan.name}`}
                </Button>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-6 flex gap-4 border-border">
        <ShieldCheck className="h-7 w-7 text-primary shrink-0" />
        <div>
          <h3 className="font-black text-text">Secure plan activation</h3>
          <p className="mt-1 text-sm text-text/60">
            Paid plans are activated only after verified payment. PharmaFlow never marks an unpaid client-side request as successful.
          </p>
        </div>
      </Card>
    </div>
  );
}

function UsageCard({
  label,
  current,
  limit,
  icon: Icon,
}: {
  label: string;
  current: number;
  limit: number;
  icon: typeof FileText;
}) {
  const safeLimit = Math.max(1, limit);
  const percentage = Math.min(100, Math.max(0, (current / safeLimit) * 100));
  return (
    <Card className="p-5 border-border">
      <div className="flex items-center justify-between">
        <Icon className="h-6 w-6 text-primary" />
        <span className="text-lg font-black text-text">{current.toLocaleString('en-IN')} / {limit.toLocaleString('en-IN')}</span>
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-wider text-text/50">{label}</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-text/5">
        <div className="h-full rounded-full bg-primary" style={{ width: `${percentage}%` }} />
      </div>
    </Card>
  );
}
