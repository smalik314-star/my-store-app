import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import MainLayout from '../layouts/MainLayout';
import { useAuth } from '../context/AuthContext';
import { SkeletonPage } from '../components/common/Skeleton';

// Lazy load pages
const Dashboard = lazy(() => import('../pages/dashboard/Dashboard'));
const Inventory = lazy(() => import('../pages/inventory/Inventory'));
const ExpiryAlerts = lazy(() => import('../pages/inventory/ExpiryAlerts'));
const LowStock = lazy(() => import('../pages/inventory/LowStock'));
const Customers = lazy(() => import('../pages/customers/Customers'));
const CustomerProfile = lazy(() => import('../pages/customers/CustomerProfile'));
const Billing = lazy(() => import('../pages/billing/Billing'));
const InvoiceList = lazy(() => import('../pages/billing/InvoiceList'));
const InvoiceDetail = lazy(() => import('../pages/billing/InvoiceDetail'));
const PrintInvoice = lazy(() => import('../pages/billing/PrintInvoice'));
const Reports = lazy(() => import('../pages/reports/Reports'));
const Settings = lazy(() => import('../pages/settings/Settings'));
const Subscription = lazy(() => import('../pages/subscription/Subscription'));
const UserManagement = lazy(() => import('../pages/users/UserManagement'));
const Login = lazy(() => import('../pages/auth/Login'));
const Privacy = lazy(() => import('../pages/legal/Privacy'));
const NotFound = lazy(() => import('../pages/NotFound'));

// Purchases pages
const Purchases = lazy(() => import('../pages/purchases/Purchases'));
const PurchaseEntry = lazy(() => import('../pages/purchases/PurchaseEntry'));
const PurchaseDetail = lazy(() => import('../pages/purchases/PurchaseDetail'));

export function AppRouter() {
  const { user } = useAuth();

  return (
    <BrowserRouter>
      <Suspense fallback={<SkeletonPage />}>
        <Routes>
          {/* Public Routes */}
          <Route 
            path="/login" 
            element={user ? <Navigate to="/dashboard" replace /> : <Login />} 
          />
          <Route path="/privacy" element={<Privacy />} />

          {/* Dedicated Print Route (No Layout) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/invoice/:id/print" element={<PrintInvoice />} />
          </Route>

          {/* Protected Routes with Main Layout */}
          <Route element={<ProtectedRoute />}>
            <Route element={<MainLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/expiry-alerts" element={<ExpiryAlerts />} />
              <Route path="/low-stock" element={<LowStock />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/customers/:id" element={<CustomerProfile />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/invoices" element={<InvoiceList />} />
              <Route path="/invoice/:id" element={<InvoiceDetail />} />
              <Route path="/purchases" element={<Purchases />} />
              <Route path="/purchases/new" element={<PurchaseEntry />} />
              <Route path="/purchases/:id" element={<PurchaseDetail />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/subscription" element={<Subscription />} />
              <Route path="/users" element={<UserManagement />} />
            </Route>
          </Route>

          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
