import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { Download, Mail, MessageCircle, RefreshCw, Save } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { productService } from '../../services/productService';
import { purchaseService } from '../../services/purchaseService';
import { reorderService, suggestedReorderQuantity } from '../../services/reorderService';
import type { Product, ReorderLine, ReorderOrder, Supplier } from '../../types';
import { Button } from '../../components/common/Button';
import { formatCurrency } from '../../utils/currency';

function buildPdf(order: ReorderOrder, storeName: string) {
  const pdf = new jsPDF();
  pdf.setFontSize(18);
  pdf.text('REORDER / PURCHASE REQUIREMENT', 14, 18);
  pdf.setFontSize(11);
  pdf.text(storeName, 14, 27);
  pdf.text(order.reorderNumber, 145, 27);
  pdf.text(`Supplier: ${order.supplierName}`, 14, 36);
  pdf.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 145, 36);
  pdf.line(14, 42, 196, 42);
  let y = 50;
  pdf.setFontSize(9);
  pdf.text('Product', 14, y);
  pdf.text('Current', 105, y);
  pdf.text('Min', 130, y);
  pdf.text('Order Qty', 155, y);
  pdf.text('Unit', 184, y);
  y += 6;
  order.lines.forEach((line, index) => {
    if (y > 275) {
      pdf.addPage();
      y = 20;
    }
    pdf.text(`${index + 1}. ${line.productName}`.slice(0, 48), 14, y);
    pdf.text(String(line.currentStock), 108, y);
    pdf.text(String(line.minimumStock), 132, y);
    pdf.text(String(line.orderQuantity), 160, y);
    pdf.text(line.unit || 'Unit', 184, y);
    y += 7;
  });
  pdf.line(14, y, 196, y);
  y += 8;
  pdf.text(`Total order quantity: ${order.totalItems}`, 14, y);
  pdf.text(`Estimated value: ${formatCurrency(order.estimatedAmount)}`, 120, y);
  y += 10;
  pdf.setFontSize(8);
  pdf.text(
    'Stock changes only after an actual purchase is posted. Quantity/rate subject to supplier confirmation.',
    14,
    y
  );
  return pdf;
}

export default function ReorderManagement() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<ReorderOrder[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [supplierId, setSupplierId] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [debouncedSupplierSearch, setDebouncedSupplierSearch] = useState('');
  const [supplierCursor, setSupplierCursor] = useState<any>(null);
  const [hasMoreSuppliers, setHasMoreSuppliers] = useState(false);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [notes, setNotes] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<ReorderOrder | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderCursor, setOrderCursor] = useState<any>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSupplierSearch(supplierSearch), 250);
    return () => window.clearTimeout(timer);
  }, [supplierSearch]);

  const reloadOrders = async (reset: boolean = true) => {
    if (!user?.tenantId) return;
    setOrdersLoading(true);
    try {
      const result = await reorderService.listPage(
        user.tenantId,
        20,
        reset ? undefined : orderCursor
      );
      setOrders(current => (reset ? result.orders : [...current, ...result.orders]));
      setOrderCursor(result.lastDoc);
      setHasMoreOrders(result.hasMore);
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadProducts = async (reset = false) => {
    if (!user?.tenantId) return;
    setLoadingProducts(true);
    try {
      const trimmedSearch = debouncedSearch.trim();
      const result = trimmedSearch.length >= 2
        ? await productService.searchProducts(user.tenantId, trimmedSearch, { pageSize: 50 })
        : await productService.getLowStockProductsPage(user.tenantId, 40, reset ? null : cursorId);
      const rows = (result?.products || []).filter(
        product =>
          Number(product.minimumStock) > 0
          && Number(product.stockQuantity) <= Number(product.minimumStock)
      );
      setProducts(current =>
        reset || trimmedSearch.length >= 2
          ? rows
          : Array.from(new Map([...current, ...rows].map(product => [product.id, product])).values())
      );
      setCursorId(result?.nextCursor || null);
      setHasMore(trimmedSearch.length < 2 && Boolean(result?.hasMore));
      setQuantities(current => {
        const next = { ...current };
        rows.forEach(product => {
          if (next[product.id] === undefined) {
            next[product.id] = suggestedReorderQuantity(
              product.stockQuantity,
              product.minimumStock,
              product.reorderTarget
            );
          }
        });
        return next;
      });
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadSuppliers = async (reset: boolean = true) => {
    if (!user?.tenantId) return;
    setLoadingSuppliers(true);
    try {
      const trimmedSearch = debouncedSupplierSearch.trim();
      if (trimmedSearch.length >= 2) {
        const rows = await purchaseService.searchSuppliers(user.tenantId, trimmedSearch, 20);
        setSuppliers(current => {
          const selectedSupplier = current.find(supplier => supplier.id === supplierId);
          if (selectedSupplier && !rows.some(supplier => supplier.id === selectedSupplier.id)) {
            return [selectedSupplier, ...rows];
          }
          return rows;
        });
        setSupplierCursor(null);
        setHasMoreSuppliers(false);
      } else {
        const result = await purchaseService.listSuppliersPage(
          user.tenantId,
          50,
          reset ? undefined : supplierCursor
        );
        setSuppliers(current => {
          const merged = reset
            ? result.suppliers
            : Array.from(new Map([...current, ...result.suppliers].map(supplier => [supplier.id, supplier])).values());
          const selectedSupplier = current.find(supplier => supplier.id === supplierId);
          if (selectedSupplier && !merged.some(supplier => supplier.id === selectedSupplier.id)) {
            return [selectedSupplier, ...merged];
          }
          return merged;
        });
        setSupplierCursor(result.lastDoc);
        setHasMoreSuppliers(result.hasMore);
      }
    } finally {
      setLoadingSuppliers(false);
    }
  };

  useEffect(() => {
    if (!user?.tenantId) return;
    void loadSuppliers(true);
    void reloadOrders(true);
    setCursorId(null);
    void loadProducts(true);
  }, [debouncedSearch, debouncedSupplierSearch, user?.tenantId]);

  const lowProducts = useMemo(() => products, [products]);
  const draftLines: ReorderLine[] = lowProducts
    .filter(product => selected[product.id])
    .map(product => ({
      productId: product.id,
      productName: product.name,
      brand: product.brand,
      manufacturer: product.manufacturer,
      unit: product.unit,
      currentStock: product.stockQuantity,
      minimumStock: product.minimumStock,
      targetStock: Math.max(product.minimumStock, product.reorderTarget || product.minimumStock * 2),
      orderQuantity: quantities[product.id] || 0,
      lastPurchasePrice: product.purchasePrice,
    }));
  const selectedSupplier = suppliers.find(row => row.id === supplierId);

  const saveOrder = async () => {
    if (!user?.tenantId || !selectedSupplier) {
      showToast('Select a supplier first.', 'danger');
      return;
    }
    setSaving(true);
    try {
      const result = await reorderService.save(user.tenantId, {
        requestId: crypto.randomUUID(),
        supplier: selectedSupplier,
        lines: draftLines,
        notes,
      });
      const order: ReorderOrder = {
        id: result.id,
        tenantId: user.tenantId,
        requestId: '',
        reorderNumber: result.reorderNumber,
        supplierId,
        supplierName: selectedSupplier.name,
        supplierPhone: selectedSupplier.phone,
        supplierEmail: selectedSupplier.email,
        lines: draftLines,
        totalItems: draftLines.reduce((sum, line) => sum + line.orderQuantity, 0),
        estimatedAmount: draftLines.reduce(
          (sum, line) => sum + line.orderQuantity * Number(line.lastPurchasePrice || 0),
          0
        ),
        status: 'draft',
        notes,
        createdBy: user.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setCurrentOrder(order);
      await reloadOrders(true);
      showToast(`${result.reorderNumber} saved. Stock is unchanged.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Reorder could not be saved.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  const downloadPdf = (order: ReorderOrder) =>
    buildPdf(order, settings?.storeName || 'PharmaFlow').save(`${order.reorderNumber}.pdf`);
  const message = (order: ReorderOrder) =>
    `Reorder ${order.reorderNumber}\nSupplier: ${order.supplierName}\n${order.lines
      .map(line => `${line.productName}: ${line.orderQuantity} ${line.unit}`)
      .join('\n')}\nPlease confirm availability and rates.`;
  const shareWhatsApp = (order: ReorderOrder) => {
    downloadPdf(order);
    window.open(
      `https://wa.me/${(order.supplierPhone || '').replace(/\D/g, '')}?text=${encodeURIComponent(
        `${message(order)}\nPDF has been downloaded; please attach it to this chat.`
      )}`,
      '_blank',
      'noopener,noreferrer'
    );
  };
  const shareEmail = (order: ReorderOrder) => {
    downloadPdf(order);
    window.location.href = `mailto:${order.supplierEmail || ''}?subject=${encodeURIComponent(
      `Reorder ${order.reorderNumber}`
    )}&body=${encodeURIComponent(
      `${message(order)}\n\nPDF has been downloaded; please attach it before sending.`
    )}`;
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-black">Reorder Management</h1>
        <p className="text-sm text-text/55">
          Minimum-stock based purchase requirements. Reorders do not change inventory.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-text/50">Configured low items</p>
          <p className="text-2xl font-black text-red-600">{lowProducts.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-text/50">Selected products</p>
          <p className="text-2xl font-black">{draftLines.length}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-text/50">Suggested order units</p>
          <p className="text-2xl font-black">
            {draftLines.reduce((sum, line) => sum + line.orderQuantity, 0)}
          </p>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search low-stock product"
            className="rounded-lg border p-3"
          />
          <div className="space-y-2">
            <input
              value={supplierSearch}
              onChange={event => setSupplierSearch(event.target.value)}
              placeholder="Search supplier by name"
              className="w-full rounded-lg border p-3"
            />
            <select
              value={supplierId}
              onChange={event => setSupplierId(event.target.value)}
              className="w-full rounded-lg border p-3"
            >
              <option value="">Select supplier *</option>
              {suppliers.map(row => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[11px] font-semibold text-text/45">
              <span>
                {loadingSuppliers
                  ? 'Loading suppliers...'
                  : debouncedSupplierSearch.trim().length >= 2
                    ? `${Math.max(0, suppliers.length - (supplierId ? 1 : 0))} matches loaded`
                    : `${suppliers.length} suppliers loaded`}
              </span>
              {hasMoreSuppliers && debouncedSupplierSearch.trim().length < 2 && (
                <button
                  type="button"
                  onClick={() => void loadSuppliers(false)}
                  className="text-primary hover:underline"
                >
                  Load more
                </button>
              )}
            </div>
          </div>
          <input
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder="Order notes (optional)"
            className="rounded-lg border p-3"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-y bg-background text-left text-xs">
                <th className="p-3">Select</th>
                <th>Product</th>
                <th>Company</th>
                <th>Current</th>
                <th>Low at</th>
                <th>Target</th>
                <th>Order Qty</th>
              </tr>
            </thead>
            <tbody>
              {lowProducts.map(product => (
                <tr key={product.id} className="border-b">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[product.id])}
                      onChange={event =>
                        setSelected(current => ({ ...current, [product.id]: event.target.checked }))
                      }
                    />
                  </td>
                  <td className="font-bold">
                    {product.name}
                    <span className="block text-xs text-text/45">{product.unit}</span>
                  </td>
                  <td>{product.manufacturer || product.brand || '-'}</td>
                  <td>{product.stockQuantity}</td>
                  <td>{product.minimumStock}</td>
                  <td>{Math.max(product.minimumStock, product.reorderTarget || product.minimumStock * 2)}</td>
                  <td>
                    <input
                      type="number"
                      min="1"
                      value={quantities[product.id] || ''}
                      onChange={event =>
                        setQuantities(current => ({
                          ...current,
                          [product.id]: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-24 rounded-lg border p-2 font-bold"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lowProducts.length === 0 && (
            <p className="p-8 text-center text-text/50">
              No products are currently below their configured low-stock level.
            </p>
          )}
        </div>

        {hasMore && debouncedSearch.trim().length < 2 && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => void loadProducts(false)} disabled={loadingProducts}>
              {loadingProducts ? 'Loading...' : 'Load more low-stock products'}
            </Button>
          </div>
        )}

        <Button onClick={saveOrder} isLoading={saving} leftIcon={<Save className="h-4 w-4" />}>
          Save Reorder
        </Button>
      </section>

      {currentOrder && (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="font-black">{currentOrder.reorderNumber} ready to share</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadPdf(currentOrder)} leftIcon={<Download className="h-4 w-4" />}>
              PDF
            </Button>
            <Button variant="outline" onClick={() => shareWhatsApp(currentOrder)} leftIcon={<MessageCircle className="h-4 w-4" />}>
              WhatsApp
            </Button>
            <Button variant="outline" onClick={() => shareEmail(currentOrder)} leftIcon={<Mail className="h-4 w-4" />}>
              Email
            </Button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-black">Saved Reorders</h2>
          <button onClick={() => void reloadOrders(true)} aria-label="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {orders.map(order => (
          <div
            key={order.id}
            className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3"
          >
            <div>
              <p className="font-black text-primary">{order.reorderNumber}</p>
              <p className="text-xs text-text/50">
                {order.supplierName} | {order.totalItems} units | {order.status}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadPdf(order)} className="rounded-lg border p-2" aria-label="Download PDF">
                <Download className="h-4 w-4" />
              </button>
              <button onClick={() => shareWhatsApp(order)} className="rounded-lg border p-2" aria-label="Share WhatsApp">
                <MessageCircle className="h-4 w-4" />
              </button>
              <button onClick={() => shareEmail(order)} className="rounded-lg border p-2" aria-label="Share email">
                <Mail className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
        {orders.length === 0 && !ordersLoading && (
          <p className="p-8 text-center text-text/50">No reorder drafts saved yet.</p>
        )}
        {hasMoreOrders && (
          <div className="mt-4 flex justify-center border-t pt-4">
            <Button variant="outline" onClick={() => void reloadOrders(false)} disabled={ordersLoading}>
              {ordersLoading ? 'Loading...' : 'Load more reorders'}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
