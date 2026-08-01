import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { customerService } from '../../services/customerService';
import { estimateService } from '../../services/estimateService';
import { productService } from '../../services/productService';
import type { Customer, Estimate, EstimateItem, Product } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { Button } from '../../components/common/Button';

const blankItem = (): EstimateItem => ({ name: '', quantity: 1, rate: 0, discount: 0, total: 0 });

export default function Estimates() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [customerId, setCustomerId] = useState('walk-in');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date(); date.setDate(date.getDate() + 15); return date.toISOString().slice(0, 10);
  });
  const [items, setItems] = useState<EstimateItem[]>([blankItem()]);
  const [notes, setNotes] = useState('');

  const reload = async () => {
    if (!user?.tenantId) return;
    const [rows, parties] = await Promise.all([
      estimateService.list(user.tenantId), customerService.getCustomers(user.tenantId),
    ]);
    setEstimates(rows); setCustomers(parties);
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    void reload();
    return productService.subscribeToProducts(user.tenantId, setProducts);
  }, [user?.tenantId]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(items.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.rate || 0), 0));
    const discount = roundMoney(items.reduce((sum, row) => sum + Number(row.discount || 0), 0));
    return { subtotal, discount, total: roundMoney(subtotal - discount) };
  }, [items]);

  const patchItem = (index: number, values: Partial<EstimateItem>) => setItems(current => current.map((row, i) => {
    if (i !== index) return row;
    const next = { ...row, ...values };
    return { ...next, total: roundMoney(Number(next.quantity || 0) * Number(next.rate || 0) - Number(next.discount || 0)) };
  }));

  const selectProduct = (index: number, productId: string) => {
    const product = products.find(row => row.id === productId);
    if (!product) return;
    patchItem(index, { productId, name: product.name, rate: product.sellingPrice || product.mrp || 0 });
  };

  const save = async () => {
    if (!user?.tenantId || saving) return;
    setSaving(true);
    try {
      const selected = customers.find(row => row.id === customerId);
      const result = await estimateService.save(user.tenantId, {
        requestId: crypto.randomUUID(), customerId, customerName: customerName.trim(),
        customerPhone: selected?.phone || '', customerAddress: selected?.address || '',
        items, validUntil: new Date(`${validUntil}T23:59:59`), notes,
        terms: 'Prices and availability are subject to confirmation. This estimate is not a tax invoice and is not valid for input tax credit.',
      });
      showToast(`${result.estimateNumber} saved without changing stock or GST.`, 'success');
      navigate(`/estimate/${result.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Estimate could not be saved.', 'danger');
    } finally { setSaving(false); }
  };

  if (!creating) return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-black">Estimates</h1><p className="text-sm text-text/55">Non-tax quotations; stock and ledgers remain unchanged.</p></div>
        <Button onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>New Estimate</Button>
      </div>
      <div className="rounded-2xl border border-border bg-white overflow-hidden">
        {estimates.length === 0 ? <p className="p-10 text-center text-text/50">No estimates created yet.</p> : estimates.map(row => (
          <Link key={row.id} to={`/estimate/${row.id}`} className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-0 hover:bg-background/40">
            <div><p className="font-black text-primary">{row.estimateNumber}</p><p className="text-sm text-text/55">{row.customerName} · {row.status.toUpperCase()}</p></div>
            <p className="font-black">{formatCurrency(row.grandTotal)}</p>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div><h1 className="text-2xl font-black">New Estimate</h1><p className="text-sm text-red-700 font-bold">NOT A TAX INVOICE · GST will not be charged · stock/customer balance will not change</p></div>
      <section className="rounded-2xl border border-border bg-white p-4 md:p-6 grid gap-4 md:grid-cols-3">
        <label className="text-sm font-bold">Customer
          <select className="mt-1 w-full rounded-lg border p-3" value={customerId} onChange={event => {
            const id = event.target.value; setCustomerId(id);
            const party = customers.find(row => row.id === id); setCustomerName(party?.name || 'Walk-in Customer');
          }}><option value="walk-in">Walk-in Customer</option>{customers.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select>
        </label>
        <label className="text-sm font-bold">Customer name *<input className="mt-1 w-full rounded-lg border p-3" value={customerName} onChange={e => setCustomerName(e.target.value)} /></label>
        <label className="text-sm font-bold">Valid until *<input type="date" className="mt-1 w-full rounded-lg border p-3" value={validUntil} onChange={e => setValidUntil(e.target.value)} /></label>
      </section>
      <section className="rounded-2xl border border-border bg-white p-4 md:p-6 space-y-4">
        <datalist id="estimate-products">{products.map(row => <option key={row.id} value={row.name} />)}</datalist>
        {items.map((row, index) => (
          <div key={index} className="grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[2fr_90px_130px_130px_120px_40px] items-end">
            <label className="text-xs font-bold">Product / Service *
              <input list="estimate-products" className="mt-1 w-full rounded-lg border p-2.5" value={row.name} onChange={e => {
                const product = products.find(p => p.name.toLowerCase() === e.target.value.toLowerCase());
                if (product) selectProduct(index, product.id); else patchItem(index, { name: e.target.value, productId: undefined });
              }} />
            </label>
            <label className="text-xs font-bold">Qty *<input type="number" min="0.01" step="0.01" className="mt-1 w-full rounded-lg border p-2.5" value={row.quantity} onChange={e => patchItem(index, { quantity: Number(e.target.value) })} /></label>
            <label className="text-xs font-bold">Rate *<input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2.5" value={row.rate} onChange={e => patchItem(index, { rate: Number(e.target.value) })} /></label>
            <label className="text-xs font-bold">Discount<input type="number" min="0" step="0.01" className="mt-1 w-full rounded-lg border p-2.5" value={row.discount} onChange={e => patchItem(index, { discount: Number(e.target.value) })} /></label>
            <div className="pb-2 font-black text-right">{formatCurrency(row.total)}</div>
            <button type="button" aria-label="Remove item" onClick={() => setItems(current => current.length === 1 ? current : current.filter((_, i) => i !== index))} className="p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setItems(current => [...current, blankItem()])}>Add Row</Button>
        <label className="block text-sm font-bold">Notes<textarea className="mt-1 w-full rounded-lg border p-3" value={notes} onChange={e => setNotes(e.target.value)} /></label>
        <div className="ml-auto max-w-sm space-y-1 text-right"><p>Subtotal: {formatCurrency(totals.subtotal)}</p><p>Discount: {formatCurrency(totals.discount)}</p><p className="text-xl font-black">Estimate Total: {formatCurrency(totals.total)}</p><p className="text-xs text-red-700 font-bold">GST: Not charged on this estimate</p></div>
      </section>
      <div className="flex gap-3"><Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button><Button isLoading={saving} onClick={save} leftIcon={<FileText className="h-4 w-4" />}>Save Estimate</Button></div>
    </div>
  );
}
