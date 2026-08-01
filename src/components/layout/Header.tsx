import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Bell, 
  Menu, 
  Search, 
  User, 
  X, 
  AlertTriangle, 
  Package, 
  ReceiptText, 
  Users, 
  Check, 
  Volume2, 
  VolumeX, 
  ShieldAlert,
  Settings,
  LogOut,
  Zap
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { collection, query, where, onSnapshot, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { toJsDate } from '../../utils/date';
import { Product, Invoice, Customer } from '../../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../utils/cn';
import { Logo } from '../common/Logo';
import { useBusinessMode } from '../../context/BusinessModeContext';
import { supportsRetail } from '../../utils/businessMode';
import { formatCurrency } from '../../utils/currency';

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

interface SearchProductResult {
  id: string;
  name: string;
  sku: string;
  barcode: string;
  brand?: string;
  category: string;
  stockQuantity: number;
  minimumStock: number;
}

interface SearchInvoiceResult {
  id: string;
  invoiceNumber: string;
  customerName: string;
  paymentStatus: string;
  grandTotal: number;
}

interface SearchCustomerResult {
  id: string;
  name: string;
  phone: string;
  email?: string;
  totalPurchases: number;
}

interface GlobalSearchResults {
  products: SearchProductResult[];
  invoices: SearchInvoiceResult[];
  customers: SearchCustomerResult[];
}

interface NotificationItem {
  id: string;
  productId: string;
  type: 'out_of_stock' | 'critical_stock' | 'low_stock' | 'expired' | 'expiring_very_soon' | 'expiring_soon';
  severity: 'critical' | 'warning';
  title: string;
  message: string;
  item: Product;
}

const EMPTY_SEARCH_RESULTS: GlobalSearchResults = {
  products: [],
  invoices: [],
  customers: [],
};

export function Header({ onMenuClick, pageTitle }: HeaderProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { mode } = useBusinessMode();

  // Search states
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResults>(EMPTY_SEARCH_RESULTS);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchCacheRef = useRef<Map<string, GlobalSearchResults>>(new Map());

  // User Profile Dropdown states
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Notifications states
  const [notifOpen, setNotifOpen] = useState(false);
  const [stockAlertProducts, setStockAlertProducts] = useState<Product[]>([]);
  const [expiryAlertProducts, setExpiryAlertProducts] = useState<Product[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    const saved = localStorage.getItem('pharma_notif_sound');
    return saved !== 'false'; // default true
  });
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(() => {
    const saved = localStorage.getItem('pharma_notif_email');
    return saved === 'true'; // default false
  });
  const [unreadCount, setUnreadCount] = useState(0);

  const notifRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef<number | null>(null);
  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  const getPageTitle = () => {
    if (pageTitle) return pageTitle;
    
    const pathname = location.pathname;
    if (pathname.startsWith('/invoice/')) {
      if (pathname.endsWith('/print')) {
        return 'Print Invoice';
      }
      return 'Invoice Detail';
    }
    if (pathname.startsWith('/customers/')) {
      return 'Customer Profile';
    }
    if (pathname.startsWith('/purchases/')) {
      if (pathname.endsWith('/new')) {
        return 'New Purchase Entry';
      }
      return 'Purchase Detail';
    }
    
    const path = pathname.split('/').pop() || 'Dashboard';
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  // Keyboard shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) return;
    setSearchQuery('');
    setSearchError('');
    setLoadingSearch(false);
    setSearchResults(EMPTY_SEARCH_RESULTS);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  // Bounded tenant search via authenticated backend endpoint.
  useEffect(() => {
    if (!searchOpen || !user?.tenantId) return;

    const trimmedQuery = searchQuery.trim();
    if (trimmedQuery.length < 2) {
      setSearchError('');
      setLoadingSearch(false);
      setSearchResults(EMPTY_SEARCH_RESULTS);
      return;
    }

    const cacheKey = `${user.tenantId}:${trimmedQuery.toLowerCase()}`;
    const cached = searchCacheRef.current.get(cacheKey);
    if (cached) {
      setSearchError('');
      setLoadingSearch(false);
      setSearchResults(cached);
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setLoadingSearch(true);
        setSearchError('');

        try {
          const idToken = await auth.currentUser?.getIdToken();
          if (!idToken) {
            throw new Error('Please sign in again to use global search.');
          }

          const response = await fetch(
            `${apiBaseUrl}/api/global-search?q=${encodeURIComponent(trimmedQuery) || ''}`.replace('//api', '/api'),
            {
              headers: {
                Authorization: `Bearer ${idToken}`,
              },
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || 'Global search could not be completed.');
          }

          const nextResults: GlobalSearchResults = {
            products: result.products || [],
            invoices: result.invoices || [],
            customers: result.customers || [],
          };

          if (!active) return;
          searchCacheRef.current.set(cacheKey, nextResults);
          setSearchResults(nextResults);
        } catch (error: any) {
          if (!active) return;
          console.error('Error loading global search resources:', error);
          setSearchResults(EMPTY_SEARCH_RESULTS);
          setSearchError(error?.message || 'Global search is unavailable right now.');
        } finally {
          if (active) {
            setLoadingSearch(false);
          }
        }
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [apiBaseUrl, searchOpen, searchQuery, user?.tenantId]);

  // Limited live alert sources so the header never subscribes to the full catalog.
  useEffect(() => {
    if (!user?.tenantId) {
      setStockAlertProducts([]);
      setExpiryAlertProducts([]);
      return;
    }

    const expiryCutoff = new Date();
    expiryCutoff.setDate(expiryCutoff.getDate() + 60);

    const stockQuery = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId),
      orderBy('stockQuantity', 'asc'),
      limit(100)
    );

    const expiryQuery = query(
      collection(db, 'products'),
      where('tenantId', '==', user.tenantId),
      where('expiryDate', '<=', expiryCutoff),
      orderBy('expiryDate', 'asc'),
      limit(100)
    );

    const unsubscribeStock = onSnapshot(stockQuery, snapshot => {
      setStockAlertProducts(
        snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product => product.recordStatus !== 'inactive')
      );
    });

    const unsubscribeExpiry = onSnapshot(expiryQuery, snapshot => {
      setExpiryAlertProducts(
        snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as Product))
          .filter(product => product.recordStatus !== 'inactive')
      );
    });

    return () => {
      unsubscribeStock();
      unsubscribeExpiry();
    };
  }, [user?.tenantId]);

  const notifications = useMemo<NotificationItem[]>(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nextNotifications: NotificationItem[] = [];

    stockAlertProducts.forEach(product => {
      if (product.stockQuantity === 0) {
        nextNotifications.push({
          id: `stock-out-${product.id}`,
          productId: product.id,
          type: 'out_of_stock',
          severity: 'critical',
          title: 'Out of Stock',
          message: `${product.name} is completely out of stock.`,
          item: product,
        });
      } else if (product.stockQuantity <= 2) {
        nextNotifications.push({
          id: `stock-critical-${product.id}`,
          productId: product.id,
          type: 'critical_stock',
          severity: 'critical',
          title: 'Critical Stock Level',
          message: `${product.name} has only ${product.stockQuantity} ${product.unit} left.`,
          item: product,
        });
      } else if (product.stockQuantity <= product.minimumStock) {
        nextNotifications.push({
          id: `stock-low-${product.id}`,
          productId: product.id,
          type: 'low_stock',
          severity: 'warning',
          title: 'Low Stock Alert',
          message: `${product.name} is below minimum level (${product.stockQuantity} left).`,
          item: product,
        });
      }
    });

    expiryAlertProducts.forEach(product => {
      const expiryDate = toJsDate(product.expiryDate);
      expiryDate.setHours(0, 0, 0, 0);
      const diffTime = expiryDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (daysLeft < 0) {
        nextNotifications.push({
          id: `expiry-expired-${product.id}`,
          productId: product.id,
          type: 'expired',
          severity: 'critical',
          title: 'Product Expired',
          message: `${product.name} expired ${Math.abs(daysLeft)} days ago.`,
          item: product,
        });
      } else if (daysLeft <= 30) {
        nextNotifications.push({
          id: `expiry-vclose-${product.id}`,
          productId: product.id,
          type: 'expiring_very_soon',
          severity: 'critical',
          title: 'Expiring Very Soon',
          message: `${product.name} is expiring in ${daysLeft} days.`,
          item: product,
        });
      } else if (daysLeft <= 60) {
        nextNotifications.push({
          id: `expiry-soon-${product.id}`,
          productId: product.id,
          type: 'expiring_soon',
          severity: 'warning',
          title: 'Expiring Soon',
          message: `${product.name} is expiring in ${daysLeft} days.`,
          item: product,
        });
      }
    });

    return nextNotifications
      .sort((left, right) => {
        if (left.severity === right.severity) return left.title.localeCompare(right.title);
        return left.severity === 'critical' ? -1 : 1;
      })
      .slice(0, 100);
  }, [expiryAlertProducts, stockAlertProducts]);

  useEffect(() => {
    const readNotifs = JSON.parse(localStorage.getItem('pharma_read_notifications') || '[]') as string[];
    setUnreadCount(notifications.filter(notification => !readNotifs.includes(notification.id)).length);
  }, [notifications]);

  // Audio synthesizer beep for real alerts
  const playNotificationSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1); // A5

      gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.25);
    } catch (e) {
      console.error('Synthesizer Web Audio failed:', e);
    }
  };

  // Trigger synthesizer beep when notifications count increases
  useEffect(() => {
    if (prevCountRef.current !== null && notifications.length > prevCountRef.current) {
      playNotificationSound();
    }
    prevCountRef.current = notifications.length;
  }, [notifications.length]);

  // Click outside to close notifications and profile dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllAsRead = () => {
    const ids = notifications.map(n => n.id);
    localStorage.setItem('pharma_read_notifications', JSON.stringify(ids));
    setUnreadCount(0);
  };

  const handleNotificationClick = (notif: NotificationItem) => {
    // Mark specifically as read
    const readNotifs = JSON.parse(localStorage.getItem('pharma_read_notifications') || '[]');
    if (!readNotifs.includes(notif.id)) {
      readNotifs.push(notif.id);
      localStorage.setItem('pharma_read_notifications', JSON.stringify(readNotifs));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }

    if (notif.type.includes('stock')) {
      navigate('/low-stock');
    } else if (notif.type === 'expired' || notif.type.includes('expiring')) {
      navigate('/expiry-alerts');
    }
    setNotifOpen(false);
  };

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    localStorage.setItem('pharma_notif_sound', String(nextVal));
  };

  const toggleEmailAlerts = () => {
    const nextVal = !emailAlertsEnabled;
    setEmailAlertsEnabled(nextVal);
    localStorage.setItem('pharma_notif_email', String(nextVal));
  };

  const filteredProducts = searchResults.products;
  const filteredInvoices = searchResults.invoices;
  const filteredCustomers = searchResults.customers;
  const hasSearchResults = filteredProducts.length > 0 || filteredInvoices.length > 0 || filteredCustomers.length > 0;

  return (
    <>
      <header className="sticky top-0 z-30 h-16 lg:h-[72px] w-full border-b border-border bg-surface/95 backdrop-blur-md px-2 min-[360px]:px-3 md:px-6 no-print">
        <div className="flex h-full items-center justify-between gap-1.5 sm:gap-3">
          <div className="flex items-center gap-1 min-[360px]:gap-2 md:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onMenuClick}
              className="lg:hidden p-2 h-11 w-11 flex shrink-0"
              aria-label="Open navigation menu"
              id="menu-toggle-btn"
            >
              <Menu className="h-6 w-6" />
            </Button>
            <Logo className="hidden min-[360px]:block h-[30px] w-[30px] md:h-[36px] md:w-[36px] lg:hidden shrink-0" variant="color" />
            <h2 className="hidden min-[430px]:block max-w-[120px] text-sm md:max-w-none md:text-lg font-semibold text-text truncate">
              {getPageTitle()}
            </h2>
          </div>

          <div className="flex items-center gap-0.5 min-[360px]:gap-1 md:gap-4 shrink-0">
            {/* Quick Bill Trigger Button */}
            {supportsRetail(mode) && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-quick-bill'))}
                className="flex h-11 w-11 items-center justify-center gap-1.5 p-0 sm:w-auto sm:px-3 md:px-4 text-xs font-black text-white bg-accent hover:bg-accent/90 rounded-xl transition-all shadow-sm shadow-accent/15 cursor-pointer active:scale-[0.98]"
                aria-label="Open quick bill"
                id="global-quick-bill-trigger"
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Quick Bill</span>
              </button>
            )}

            {/* Interactive Search Bar Clickable Target */}
            <button 
              onClick={() => setSearchOpen(true)}
              className="hidden md:flex items-center gap-3 px-4 py-2.5 text-sm text-text/40 hover:text-text/70 bg-background hover:bg-background/80 border border-border rounded-xl transition-all cursor-pointer min-w-[240px] text-left shadow-sm"
              id="global-search-desktop-trigger"
            >
              <Search className="h-4 w-4 shrink-0 text-text/30" />
              <span className="flex-1 truncate">Search medicines, invoices...</span>
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-surface border border-border rounded text-text/50">Ctrl K</kbd>
            </button>

            {/* Mobile Search Button Icon */}
            <button 
              onClick={() => setSearchOpen(true)}
              className="md:hidden flex h-11 w-11 items-center justify-center rounded-xl text-text/50 hover:bg-background hover:text-text transition-colors"
              aria-label="Search PharmaFlow"
              id="global-search-mobile-trigger"
            >
              <Search className="h-5 w-5" />
            </button>

            {/* Dynamic Notification Bell Component */}
            <div className="relative" ref={notifRef}>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 h-11 w-11 rounded-xl text-text/50 hover:bg-background hover:text-text cursor-pointer"
                id="notification-bell-btn"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-danger border border-surface flex items-center justify-center animate-pulse" />
                )}
              </Button>

              {/* Notification Popover */}
              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="fixed left-2 right-2 top-16 mt-1 bg-surface border border-border rounded-xl shadow-2xl overflow-hidden z-50 flex flex-col max-h-[calc(100dvh-5rem)] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96 sm:max-h-[480px] sm:rounded-2xl"
                    id="notification-popover-dropdown"
                  >
                    {/* Popover Header */}
                    <div className="px-4 py-3 bg-background border-b border-border flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-text text-sm">Notifications</h4>
                        <p className="text-xs text-text/40">{unreadCount} active alert{unreadCount !== 1 ? 's' : ''}</p>
                      </div>
                      {unreadCount > 0 && (
                        <button 
                          onClick={handleMarkAllAsRead}
                          className="text-xs font-semibold text-primary hover:text-primary-dark cursor-pointer flex items-center gap-1"
                          id="mark-all-read-btn"
                        >
                          <Check className="h-3.5 w-3.5" /> Mark read
                        </button>
                      )}
                    </div>

                    {/* Preferences Quick Toggles */}
                    <div className="px-4 py-2 border-b border-border bg-background/50 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <button
                        onClick={toggleSound}
                        className="text-xs flex items-center gap-1.5 text-text/60 hover:text-text cursor-pointer transition-colors"
                        id="toggle-sound-btn"
                      >
                        {soundEnabled ? (
                          <>
                            <Volume2 className="h-3.5 w-3.5 text-success" />
                            <span>Sound On</span>
                          </>
                        ) : (
                          <>
                            <VolumeX className="h-3.5 w-3.5 text-text/30" />
                            <span>Sound Muted</span>
                          </>
                        )}
                      </button>
                      <button
                        onClick={toggleEmailAlerts}
                        className="text-xs flex items-center gap-1.5 text-text/60 hover:text-text cursor-pointer transition-colors"
                        id="toggle-email-alerts-btn"
                      >
                        <span className={cn("h-2 w-2 rounded-full", emailAlertsEnabled ? "bg-success animate-pulse" : "bg-text/20")} />
                        <span>Email Alerts: {emailAlertsEnabled ? 'Enabled' : 'Disabled'}</span>
                      </button>
                    </div>

                    {/* Notifications Body List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-border custom-scrollbar">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center text-text/40">
                          <Check className="h-8 w-8 mx-auto mb-2 text-success opacity-40 bg-success/10 rounded-full p-1.5 animate-bounce" />
                          <p className="text-sm font-semibold">Inventory Secure</p>
                          <p className="text-xs mt-0.5">No near-expiry or critical stock found.</p>
                        </div>
                      ) : (
                        notifications.map((notif) => {
                          const readNotifs = JSON.parse(localStorage.getItem('pharma_read_notifications') || '[]');
                          const isRead = readNotifs.includes(notif.id);
                          return (
                            <div 
                              key={notif.id}
                              onClick={() => handleNotificationClick(notif)}
                              className={cn(
                                "p-4 hover:bg-background/50 transition-colors cursor-pointer text-left relative",
                                !isRead && "bg-primary/5"
                              )}
                            >
                              {!isRead && (
                                <span className="absolute left-2.5 top-5 h-1.5 w-1.5 rounded-full bg-primary" />
                              )}
                              <div className="pl-3">
                                <div className="flex items-start justify-between gap-2">
                                  <span className={cn(
                                    "text-xs font-bold flex items-center gap-1",
                                    notif.severity === 'critical' ? 'text-danger' : 'text-warning'
                                  )}>
                                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                                    {notif.title}
                                  </span>
                                  {notif.item?.expiryDate && notif.type.includes('expiry') && (
                                    <span className="text-[10px] text-text/40 whitespace-nowrap">
                                      Exp: {new Date(toJsDate(notif.item.expiryDate)).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-text/80 mt-1">{notif.message}</p>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-[10px] text-text/30 font-mono">SKU: {notif.item?.sku}</span>
                                  <span className="text-[10px] text-primary hover:underline font-semibold flex items-center gap-0.5">
                                    Resolve →
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex h-11 min-w-11 items-center justify-center gap-2 md:h-auto md:justify-start md:gap-3 md:pl-4 md:border-l md:border-border hover:opacity-85 active:opacity-75 transition-all text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
                id="user-profile-menu-btn"
              >
                <div className="hidden md:block text-right">
                  <p className="text-sm font-semibold text-text leading-none">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-text/40 mt-1 capitalize">{user?.role || 'Staff'}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-background border border-border overflow-hidden flex items-center justify-center font-semibold text-text/60 text-xs shrink-0 bg-primary/10 text-primary transition-transform duration-200 hover:scale-105">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="User Avatar" className="h-full w-full object-cover" />
                  ) : (
                    user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
                  )}
                </div>
              </button>

              <AnimatePresence>
                {profileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-64 bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden z-50 flex flex-col"
                    id="user-profile-dropdown"
                  >
                    {/* User Header Info */}
                    <div className="p-4 border-b border-border bg-background/50">
                      <p className="text-sm font-bold text-text truncate">{user?.displayName || 'User'}</p>
                      <p className="text-xs text-text/40 truncate mt-0.5">{user?.email || 'No email'}</p>
                      <span className="inline-block mt-2 px-2 py-0.5 rounded text-[10px] font-black uppercase bg-primary/10 text-primary tracking-widest">
                        {user?.role || 'Staff'}
                      </span>
                    </div>

                    {/* Navigation Actions */}
                    <div className="p-1.5 space-y-0.5">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/settings');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-text/70 hover:text-text hover:bg-background transition-colors cursor-pointer"
                        id="dropdown-settings-btn"
                      >
                        <Settings className="h-4 w-4 text-text/40" />
                        <span>Account Settings</span>
                      </button>

                      {user?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setProfileOpen(false);
                            navigate('/users');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-text/70 hover:text-text hover:bg-background transition-colors cursor-pointer"
                          id="dropdown-users-btn"
                        >
                          <Users className="h-4 w-4 text-text/40" />
                          <span>Manage Team</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          navigate('/subscription');
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-text/70 hover:text-text hover:bg-background transition-colors cursor-pointer"
                        id="dropdown-subscription-btn"
                      >
                        <Package className="h-4 w-4 text-text/40" />
                        <span>My Subscription</span>
                      </button>
                    </div>

                    {/* Separator & Logout */}
                    <div className="border-t border-border p-1.5">
                      <button
                        onClick={() => {
                          setProfileOpen(false);
                          logout();
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-left text-xs font-semibold text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                        id="dropdown-logout-btn"
                      >
                        <LogOut className="h-4 w-4" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </header>

      {/* Global Interactive Search Modal */}
      <AnimatePresence>
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 md:px-0">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSearchOpen(false)}
              className="fixed inset-0 bg-text/40 backdrop-blur-sm"
              id="global-search-backdrop"
            />

            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[70vh]"
              id="global-search-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="global-search-heading"
            >
              {/* Input Header */}
              <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-background">
                <Search className="h-5 w-5 text-text/40" />
                <input
                  type="text"
                  placeholder="Type to search medicines, invoices, customers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={event => {
                    if (event.key !== 'Enter') return;
                    const firstProduct = filteredProducts[0];
                    const firstInvoice = filteredInvoices[0];
                    const firstCustomer = filteredCustomers[0];
                    if (firstProduct) {
                      event.preventDefault();
                      navigate(`/inventory?view=${firstProduct.id}`);
                      setSearchOpen(false);
                    } else if (firstInvoice) {
                      event.preventDefault();
                      navigate(`/invoice/${firstInvoice.id}`);
                      setSearchOpen(false);
                    } else if (firstCustomer) {
                      event.preventDefault();
                      navigate(`/customers/${firstCustomer.id}`);
                      setSearchOpen(false);
                    }
                  }}
                  className="flex-1 bg-transparent border-0 outline-none text-text text-base placeholder-text/30"
                  autoFocus
                  id="global-search-input"
                  aria-label="Global search across products, invoices, and customers"
                />
                <button 
                  onClick={() => setSearchOpen(false)}
                  className="p-1.5 rounded-lg hover:bg-background text-text/40 hover:text-text transition-colors cursor-pointer"
                  id="close-search-modal-btn"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Results Body */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-6">
                {loadingSearch && (
                  <div className="flex flex-col items-center justify-center py-12 text-text/40" id="search-loading-spinner">
                    <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
                    <p className="text-sm font-medium">Searching tenant records...</p>
                  </div>
                )}

                {!loadingSearch && !searchQuery && (
                  <div className="text-center py-12 text-text/40" id="search-prompt-screen">
                    <Search className="h-10 w-10 mx-auto mb-3 opacity-30 text-primary animate-pulse" />
                    <p id="global-search-heading" className="text-sm font-semibold text-text">Search PharmaFlow</p>
                    <p className="text-xs mt-1">Search medicines, invoice numbers, customer names, SKU codes, barcodes, or phone numbers.</p>
                    <p className="text-[11px] mt-4 font-mono text-primary/60 bg-primary/5 inline-block px-2 py-1 rounded border border-primary/10">Press Ctrl+K to open, Enter to open the first result, Esc to close</p>
                  </div>
                )}

                {!loadingSearch && searchQuery.trim().length > 0 && searchQuery.trim().length < 2 && (
                  <div className="text-center py-12 text-text/40" id="search-min-length">
                    <Search className="h-10 w-10 mx-auto mb-3 opacity-30 text-primary" />
                    <p className="text-sm font-semibold text-text">Type at least 2 characters</p>
                    <p className="text-xs mt-1">This search stays tenant-scoped and returns a small result set for speed.</p>
                  </div>
                )}

                {!loadingSearch && searchError && (
                  <div className="text-center py-12 text-danger" id="search-error">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-60" />
                    <p className="text-sm font-semibold">{searchError}</p>
                    <p className="text-xs mt-1 text-text/50">Retry by refining the query or reopening search.</p>
                  </div>
                )}

                {!loadingSearch && searchQuery.trim().length >= 2 && !searchError &&
                 filteredProducts.length === 0 &&
                 filteredInvoices.length === 0 &&
                 filteredCustomers.length === 0 && (
                  <div className="text-center py-12 text-text/40" id="search-no-results">
                    <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-30 text-warning" />
                    <p className="text-sm font-semibold">No matches found for "{searchQuery}"</p>
                    <p className="text-xs mt-1">Verify medication spelling or customer details.</p>
                  </div>
                )}

                {/* Products Section */}
                {filteredProducts.length > 0 && (
                  <div id="search-products-section">
                    <h3 className="text-xs font-semibold text-text/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" /> Medicines & Inventory
                    </h3>
                    <div className="space-y-1">
                      {filteredProducts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => {
                            navigate(`/inventory?view=${p.id}`);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-background text-left transition-colors group cursor-pointer border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="text-sm font-semibold text-text group-hover:text-primary transition-colors">{p.name}</p>
                            <p className="text-xs text-text/40 flex items-center gap-2 mt-0.5">
                              <span>SKU: {p.sku}</span>
                              <span>•</span>
                              <span>Category: {p.category}</span>
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={cn(
                              "text-xs px-2 py-1 rounded-full font-semibold",
                              p.stockQuantity === 0 
                                ? 'bg-danger/10 text-danger' 
                                : p.stockQuantity <= p.minimumStock 
                                  ? 'bg-warning/10 text-warning' 
                                  : 'bg-success/10 text-success'
                            )}>
                              {p.stockQuantity} in stock
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Invoices Section */}
                {filteredInvoices.length > 0 && (
                  <div id="search-invoices-section">
                    <h3 className="text-xs font-semibold text-text/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <ReceiptText className="h-3.5 w-3.5" /> Invoices
                    </h3>
                    <div className="space-y-1">
                      {filteredInvoices.map(i => (
                        <button
                          key={i.id}
                          onClick={() => {
                            navigate(`/invoice/${i.id}`);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-background text-left transition-colors group cursor-pointer border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="text-sm font-semibold text-text group-hover:text-primary transition-colors">{i.invoiceNumber}</p>
                            <p className="text-xs text-text/40 mt-0.5">
                              Customer: {i.customerName}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-text">{formatCurrency(i.grandTotal)}</p>
                            <span className={cn(
                              "text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded",
                              i.paymentStatus === 'paid' 
                                ? 'bg-success/10 text-success' 
                                : i.paymentStatus === 'due' 
                                  ? 'bg-danger/10 text-danger' 
                                  : 'bg-warning/10 text-warning'
                            )}>
                              {i.paymentStatus}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Customers Section */}
                {filteredCustomers.length > 0 && (
                  <div id="search-customers-section">
                    <h3 className="text-xs font-semibold text-text/40 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Users className="h-3.5 w-3.5" /> Customers
                    </h3>
                    <div className="space-y-1">
                      {filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          onClick={() => {
                            navigate(`/customers/${c.id}`);
                            setSearchOpen(false);
                          }}
                          className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-background text-left transition-colors group cursor-pointer border border-transparent hover:border-border"
                        >
                          <div>
                            <p className="text-sm font-semibold text-text group-hover:text-primary transition-colors">{c.name}</p>
                            <p className="text-xs text-text/40 mt-0.5">
                              Phone: {c.phone} {c.email ? `• ${c.email}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-text/60">
                              Total spent: {formatCurrency(c.totalPurchases)}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
