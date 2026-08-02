import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus, Search, Trash2, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { customerService } from '../../services/customerService';
import { estimateService } from '../../services/estimateService';
import { productService } from '../../services/productService';
import type { Customer, Estimate, EstimateItem, Product } from '../../types';
import { formatCurrency, roundMoney } from '../../utils/currency';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { cn } from '../../utils/cn';

const blankItem = (): EstimateItem => ({
  name: '',
  quantity: 1,
  rate: 0,
  discount: 0,
  total: 0,
});

export default function Estimates() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [estimatesCursor, setEstimatesCursor] = useState<any>(null);
  const [hasMoreEstimates, setHasMoreEstimates] = useState(false);
  const [loadingEstimates, setLoadingEstimates] = useState(true);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerId, setCustomerId] = useState('walk-in');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [customerMatches, setCustomerMatches] = useState<Customer[]>([]);

  const [validUntil, setValidUntil] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() + 15);
    return date.toISOString().slice(0, 10);
  });
  const [items, setItems] = useState<EstimateItem[]>([blankItem()]);
  const [notes, setNotes] = useState('');
  const [focusedRowIndex, setFocusedRowIndex] = useState<number | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const [productSuggestions, setProductSuggestions] = useState<Record<number, Product[]>>({});

  const reload = async (reset: boolean = true) => {
    if (!user?.tenantId) return;
    setLoadingEstimates(true);
    try {
      const result = await estimateService.listPage(
        user.tenantId,
        20,
        reset ? undefined : estimatesCursor
      );
      setEstimates(current => (reset ? result.estimates : [...current, ...result.estimates]));
      setEstimatesCursor(result.lastDoc);
      setHasMoreEstimates(result.hasMore);
    } finally {
      setLoadingEstimates(false);
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    void reload(true);
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId || !creating) return;
    const term = customerSearch.trim();
    if (term.length < 2) {
      setCustomerMatches([]);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void customerService.searchCustomers(user.tenantId!, term, 6)
        .then(rows => {
          if (!active) return;
          setCustomerMatches(rows);
        })
        .catch(error => {
          console.error('Estimate customer search failed:', error);
          if (active) setCustomerMatches([]);
        });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [creating, customerSearch, user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId || focusedRowIndex === null) return;
    const row = items[focusedRowIndex];
    const term = row?.name?.trim() || '';
    if (term.length < 2 || row?.productId) {
      setProductSuggestions(current => current[focusedRowIndex]
        ? { ...current, [focusedRowIndex]: [] }
        : current);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void productService.searchProducts(user.tenantId!, term, { pageSize: 8 })
        .then(result => {
          if (!active) return;
          setProductSuggestions(current => ({ ...current, [focusedRowIndex]: result.products }));
          setActiveSuggestionIndex(result.products.length > 0 ? 0 : -1);
        })
        .catch(error => {
          console.error('Estimate product search failed:', error);
          if (active) {
            setProductSuggestions(current => ({ ...current, [focusedRowIndex]: [] }));
            setActiveSuggestionIndex(-1);
          }
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [creating, focusedRowIndex, items, user?.tenantId]);

  const totals = useMemo(() => {
    const subtotal = roundMoney(items.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.rate || 0), 0));
    const discount = roundMoney(items.reduce((sum, row) => sum + Number(row.discount || 0), 0));
    return { subtotal, discount, total: roundMoney(subtotal - discount) };
  }, [items]);

  const patchItem = (index: number, values: Partial<EstimateItem>) => {
    setItems(current => current.map((row, i) => {
      if (i !== index) return row;
      const next = { ...row, ...values };
      if (values.name !== undefined && values.name !== row.name) {
        next.productId = undefined;
      }
      return {
        ...next,
        total: roundMoney(Number(next.quantity || 0) * Number(next.rate || 0) - Number(next.discount || 0)),
      };
    }));
  };

  const selectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerId(customer.id);
    setCustomerName(customer.name);
    setCustomerSearch(customer.name);
    setShowCustomerResults(false);
  };

  const resetCustomerToWalkIn = () => {
    setSelectedCustomer(null);
    setCustomerId('walk-in');
    setCustomerName('Walk-in Customer');
    setCustomerSearch('');
    setShowCustomerResults(false);
    setCustomerMatches([]);
  };

  const selectProduct = (index: number, product: Product) => {
    patchItem(index, {
      productId: product.id,
      name: product.name,
      rate: Number(product.sellingPrice || product.mrp || 0),
    });
    setFocusedRowIndex(null);
    setActiveSuggestionIndex(-1);
    setProductSuggestions(current => ({ ...current, [index]: [] }));
  };

  const save = async () => {
    if (!user?.tenantId || saving) return;
    setSaving(true);
    try {
      const result = await estimateService.save(user.tenantId, {
        requestId: crypto.randomUUID(),
        customerId,
        customerName: customerName.trim(),
        customerPhone: selectedCustomer?.phone || '',
        customerAddress: selectedCustomer?.address || '',
        items,
        validUntil: new Date(`${validUntil}T23:59:59`),
        notes,
        terms: 'Prices and availability are subject to confirmation. This estimate is not a tax invoice and is not valid for input tax credit.',
      });
      showToast(`${result.estimateNumber} saved without changing stock or GST.`, 'success');
      navigate(`/estimate/${result.id}`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Estimate could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (!creating) {
    return (
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black">Estimates</h1>
            <p className="text-sm text-text/55">Non-tax quotations; stock and ledgers remain unchanged.</p>
          </div>
          <Button onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New Estimate
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-white overflow-hidden">
          {loadingEstimates ? (
            <p className="p-10 text-center text-text/50">Loading estimates...</p>
          ) : estimates.length === 0 ? (
            <p className="p-10 text-center text-text/50">No estimates created yet.</p>
          ) : (
            <>
              {estimates.map(row => (
                <Link
                  key={row.id}
                  to={`/estimate/${row.id}`}
                  className="flex items-center justify-between gap-4 border-b border-border p-4 last:border-0 hover:bg-background/40"
                >
                  <div>
                    <p className="font-black text-primary">{row.estimateNumber}</p>
                    <p className="text-sm text-text/55">{row.customerName} | {row.status.toUpperCase()}</p>
                  </div>
                  <p className="font-black">{formatCurrency(row.grandTotal)}</p>
                </Link>
              ))}
              {hasMoreEstimates && (
                <div className="p-4 text-center">
                  <Button variant="outline" onClick={() => void reload(false)} disabled={loadingEstimates}>
                    Load more estimates
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black">New Estimate</h1>
        <p className="text-sm font-bold text-red-700">
          NOT A TAX INVOICE | GST will not be charged | stock and customer balance will not change
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-white p-4 md:p-6 grid gap-4 md:grid-cols-3">
        <div className="relative md:col-span-1">
          <label className="text-sm font-bold">Customer Search</label>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text/35" />
            <input
              className="w-full rounded-lg border p-3 pl-10"
              value={customerSearch}
              onChange={event => {
                setCustomerSearch(event.target.value);
                setShowCustomerResults(true);
                if (!event.target.value.trim()) {
                  resetCustomerToWalkIn();
                }
              }}
              onFocus={() => setShowCustomerResults(true)}
              placeholder="Search customer by name or phone"
            />
          </div>
          {showCustomerResults && customerSearch.trim().length >= 2 && (
            <Card className="absolute inset-x-0 top-full z-10 mt-2 max-h-64 overflow-y-auto p-2">
              {customerMatches.length === 0 ? (
                <p className="p-3 text-sm text-text/45">No matching customer found.</p>
              ) : (
                customerMatches.map(customer => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="w-full rounded-xl px-3 py-2 text-left hover:bg-background/50"
                  >
                    <p className="text-sm font-black text-text">{customer.name}</p>
                    <p className="text-xs text-text/45">{customer.phone || 'No phone'}</p>
                  </button>
                ))
              )}
            </Card>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={resetCustomerToWalkIn}
              className={cn(
                'rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                customerId === 'walk-in'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text/60 hover:border-primary/30 hover:text-primary'
              )}
            >
              Walk-in Customer
            </button>
            {selectedCustomer && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                <User className="h-3.5 w-3.5" />
                {selectedCustomer.name}
              </span>
            )}
          </div>
        </div>

        <label className="text-sm font-bold">
          Customer name *
          <input
            className="mt-1 w-full rounded-lg border p-3"
            value={customerName}
            onChange={event => setCustomerName(event.target.value)}
          />
        </label>

        <label className="text-sm font-bold">
          Valid until *
          <input
            type="date"
            className="mt-1 w-full rounded-lg border p-3"
            value={validUntil}
            onChange={event => setValidUntil(event.target.value)}
          />
        </label>
      </section>

      <section className="rounded-2xl border border-border bg-white p-4 md:p-6 space-y-4">
        {items.map((row, index) => (
          <div key={index} className="relative grid gap-3 rounded-xl border border-border p-3 md:grid-cols-[2fr_90px_130px_130px_120px_40px] items-end">
            <label className="text-xs font-bold">
              Product / Service *
              <input
                className="mt-1 w-full rounded-lg border p-2.5"
                value={row.name}
                onChange={event => {
                  patchItem(index, { name: event.target.value });
                  setFocusedRowIndex(index);
                }}
                onFocus={() => setFocusedRowIndex(index)}
                onKeyDown={event => {
                  const suggestions = productSuggestions[index] || [];
                  if (event.key === 'ArrowDown' && suggestions.length > 0) {
                    event.preventDefault();
                    setActiveSuggestionIndex(current => (current + 1) % suggestions.length);
                  } else if (event.key === 'ArrowUp' && suggestions.length > 0) {
                    event.preventDefault();
                    setActiveSuggestionIndex(current => (current <= 0 ? suggestions.length - 1 : current - 1));
                  } else if ((event.key === 'Enter' || event.key === 'Tab') && suggestions.length > 0 && focusedRowIndex === index) {
                    const selected = suggestions[activeSuggestionIndex >= 0 ? activeSuggestionIndex : 0];
                    if (!selected) return;
                    event.preventDefault();
                    selectProduct(index, selected);
                  } else if (event.key === 'Escape') {
                    setFocusedRowIndex(null);
                    setActiveSuggestionIndex(-1);
                  }
                }}
                placeholder="Search stocked medicines or enter a custom service"
              />
            </label>

            {focusedRowIndex === index && row.name.trim().length >= 2 && (productSuggestions[index] || []).length > 0 && (
              <Card className="absolute left-3 right-3 top-[calc(100%-0.25rem)] z-10 max-h-60 overflow-y-auto p-2">
                {(productSuggestions[index] || []).map((product, suggestionIndex) => (
                  <button
                    key={product.id}
                    type="button"
                    onMouseEnter={() => setActiveSuggestionIndex(suggestionIndex)}
                    onClick={() => selectProduct(index, product)}
                    className={cn(
                      'w-full rounded-xl px-3 py-2 text-left hover:bg-background/50',
                      activeSuggestionIndex === suggestionIndex && 'bg-primary/10'
                    )}
                  >
                    <p className="text-sm font-black text-text">{product.name}</p>
                    <p className="text-xs text-text/45">
                      {product.brand || 'No brand'} | {formatCurrency(product.sellingPrice || product.mrp || 0)}
                    </p>
                  </button>
                ))}
              </Card>
            )}

            <label className="text-xs font-bold">
              Qty *
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="mt-1 w-full rounded-lg border p-2.5"
                value={row.quantity}
                onChange={event => patchItem(index, { quantity: Number(event.target.value) })}
              />
            </label>

            <label className="text-xs font-bold">
              Rate *
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded-lg border p-2.5"
                value={row.rate}
                onChange={event => patchItem(index, { rate: Number(event.target.value) })}
              />
            </label>

            <label className="text-xs font-bold">
              Discount
              <input
                type="number"
                min="0"
                step="0.01"
                className="mt-1 w-full rounded-lg border p-2.5"
                value={row.discount}
                onChange={event => patchItem(index, { discount: Number(event.target.value) })}
              />
            </label>

            <div className="pb-2 text-right font-black">{formatCurrency(row.total)}</div>

            <button
              type="button"
              aria-label="Remove item"
              onClick={() => setItems(current => (current.length === 1 ? current : current.filter((_, i) => i !== index)))}
              className="p-2 text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}

        <Button variant="outline" onClick={() => setItems(current => [...current, blankItem()])}>
          Add Row
        </Button>

        <label className="block text-sm font-bold">
          Notes
          <textarea
            className="mt-1 w-full rounded-lg border p-3"
            value={notes}
            onChange={event => setNotes(event.target.value)}
          />
        </label>

        <div className="ml-auto max-w-sm space-y-1 text-right">
          <p>Subtotal: {formatCurrency(totals.subtotal)}</p>
          <p>Discount: {formatCurrency(totals.discount)}</p>
          <p className="text-xl font-black">Estimate Total: {formatCurrency(totals.total)}</p>
          <p className="text-xs font-bold text-red-700">GST: Not charged on this estimate</p>
        </div>
      </section>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setCreating(false)}>
          Cancel
        </Button>
        <Button isLoading={saving} onClick={save} leftIcon={<FileText className="h-4 w-4" />}>
          Save Estimate
        </Button>
      </div>
    </div>
  );
}
