import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, RefreshCw, ShoppingBasket, Truck } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { Logo } from '../../components/common/Logo';
import { useBusinessMode } from '../../context/BusinessModeContext';
import { useToast } from '../../context/ToastContext';
import type { BusinessMode } from '../../types';
import { cn } from '../../utils/cn';

const options: Array<{
  id: BusinessMode;
  title: string;
  description: string;
  features: string[];
  icon: typeof ShoppingBasket;
}> = [
  {
    id: 'retail',
    title: 'Retail Medical Store',
    description: 'Fast counter billing and walk-in customer workflows.',
    features: ['Quick Bill and POS', 'Customer dues', 'Barcode and unit sales'],
    icon: ShoppingBasket,
  },
  {
    id: 'wholesale',
    title: 'Wholesale Distributor',
    description: 'B2B party, bulk sales and credit-focused workflows.',
    features: ['Business parties', 'Bulk invoices', 'Schemes and credit terms'],
    icon: Truck,
  },
  {
    id: 'hybrid',
    title: 'Retail + Wholesale',
    description: 'Run both workflows with one shared batch-stock source.',
    features: ['Separate workspaces', 'Shared inventory', 'Mode-wise reporting'],
    icon: RefreshCw,
  },
];

export default function BusinessModeSetup() {
  const { mode, updateMode } = useBusinessMode();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<BusinessMode>(mode);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateMode(selected);
      showToast('Business workspace configured successfully.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      showToast(error?.message || 'Unable to configure the workspace.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo className="h-16 w-16" variant="color" />
          <h1 className="mt-4 text-3xl font-black text-text">Choose Your Pharmacy Workspace</h1>
          <p className="mt-2 max-w-2xl text-sm font-medium text-text/60">
            PharmaFlow will adapt navigation and workflows to your business. Your inventory remains in one secure workspace.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {options.map(option => {
            const Icon = option.icon;
            const active = selected === option.id;
            return (
              <button key={option.id} type="button" onClick={() => setSelected(option.id)} className="text-left">
                <Card className={cn(
                  'h-full p-6 transition-all',
                  active ? 'border-2 border-primary bg-primary/5 shadow-lg' : 'border border-border hover:border-primary/40'
                )}>
                  <div className="flex items-start justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-6 w-6" />
                    </span>
                    {active && <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white"><Check className="h-4 w-4" /></span>}
                  </div>
                  <h2 className="mt-5 text-lg font-black text-text">{option.title}</h2>
                  <p className="mt-2 min-h-10 text-xs font-medium leading-relaxed text-text/50">{option.description}</p>
                  <ul className="mt-5 space-y-2">
                    {option.features.map(feature => (
                      <li key={feature} className="flex items-center gap-2 text-xs font-bold text-text/70">
                        <Check className="h-3.5 w-3.5 text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </Card>
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex justify-center">
          <Button onClick={() => void save()} isLoading={saving} leftIcon={<Building2 className="h-4 w-4" />} className="min-h-12 px-8">
            Continue to PharmaFlow
          </Button>
        </div>
      </div>
    </main>
  );
}
