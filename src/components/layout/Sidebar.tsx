import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  LayoutDashboard, 
  Package, 
  Clock,
  TriangleAlert,
  Users, 
  ReceiptText, 
  RotateCcw,
  BarChart3, 
  Settings, 
  Plus,
  LogOut,
  ChevronLeft,
  X,
  CreditCard,
  Truck,
  UserCog
  ,Banknote
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { transitions } from '../../utils/animations';
import { Logo } from '../common/Logo';
import { UserRole } from '../../types';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isMobile: boolean;
  onCloseMobile?: () => void;
}

interface MenuItem {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  allowedRoles?: UserRole[];
}

const menuSections: Array<{ title: string; items: MenuItem[] }> = [
  {
    title: 'Overview',
    items: [
      { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    ]
  },
  {
    title: 'Sales',
    items: [
      { icon: Plus, label: 'New Sale / Billing', path: '/billing', allowedRoles: ['owner', 'admin', 'staff'] },
      { icon: ReceiptText, label: 'Sales Invoices', path: '/invoices' },
      { icon: RotateCcw, label: 'Sale Returns', path: '/sale-returns', allowedRoles: ['owner', 'admin', 'staff'] },
    ]
  },
  {
    title: 'Purchases',
    items: [
      { icon: Truck, label: 'Purchase Bills', path: '/purchases', allowedRoles: ['owner', 'admin', 'staff'] },
    ]
  },
  {
    title: 'Inventory',
    items: [
      { icon: Package, label: 'Products & Stock', path: '/inventory' },
      { icon: Clock, label: 'Expiry Management', path: '/expiry-alerts' },
      { icon: TriangleAlert, label: 'Low Stock', path: '/low-stock' },
    ]
  },
  {
    title: 'Parties',
    items: [
      { icon: Users, label: 'Customers', path: '/customers' },
    ]
  },
  {
    title: 'Accounting',
    items: [
      { icon: Banknote, label: 'Customer Receipts', path: '/receipts', allowedRoles: ['owner', 'admin', 'staff'] },
    ]
  },
  {
    title: 'Reports',
    items: [
      { icon: BarChart3, label: 'Business Reports', path: '/reports' },
    ]
  },
  {
    title: 'Administration',
    items: [
      { icon: UserCog, label: 'Users & Roles', path: '/users', allowedRoles: ['owner', 'admin'] },
      { icon: CreditCard, label: 'Subscription', path: '/subscription', allowedRoles: ['owner'] },
      { icon: Settings, label: 'Settings', path: '/settings', allowedRoles: ['owner', 'admin'] },
    ]
  }
];

export function Sidebar({ isOpen, setIsOpen, isMobile, onCloseMobile }: SidebarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    if (isMobile && onCloseMobile) onCloseMobile();
  };

  const isCurrentPath = (path: string) => {
    if (path === '/dashboard') return location.pathname === path;
    if (path === '/invoices') return location.pathname === path || location.pathname.startsWith('/invoice/');
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  };

  const sidebarVariants = {
    open: { 
      x: 0,
      width: isMobile ? '280px' : '260px',
      transition: shouldReduceMotion ? { duration: 0 } : transitions.default
    },
    closed: { 
      x: isMobile ? -280 : 0,
      width: isMobile ? '280px' : '88px',
      transition: shouldReduceMotion ? { duration: 0 } : transitions.default
    }
  } as any;

  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobile && isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-text/40 backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      <motion.aside
        initial={isMobile ? { x: -280 } : false}
        animate={isOpen ? 'open' : 'closed'}
        variants={sidebarVariants}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-primary text-white border-r border-white/10 shadow-2xl lg:shadow-none no-print overflow-x-hidden",
          !isOpen && !isMobile && "lg:static"
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 lg:h-[72px] items-center justify-between px-6 border-b border-white/10 min-w-[260px]">
          <div className="flex items-center gap-3">
            <motion.div 
              whileHover={shouldReduceMotion ? {} : { rotate: 360 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="flex shrink-0 items-center justify-center"
            >
              <Logo className="h-[32px] w-[32px] md:h-[36px] md:w-[36px] lg:h-[44px] lg:w-[44px] drop-shadow-md" variant="light" />
            </motion.div>
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={transitions.fast}
                  className="text-[22px] font-semibold tracking-[0.5px]"
                >
                  PharmaFlow
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          {isMobile && (
            <Button variant="ghost" size="sm" onClick={onCloseMobile} className="p-1 h-auto rounded-lg" aria-label="Close Sidebar">
              <X className="h-6 w-6" />
            </Button>
          )}
        </div>

        {/* Navigation Menu */}
        <nav role="navigation" aria-label="Main Navigation" className="flex-1 py-4 overflow-y-auto min-w-[260px] custom-scrollbar space-y-4">
          {menuSections.map((section, sectionIdx) => {
            const visibleItems = section.items.filter(
              item => !item.allowedRoles || (user?.role && item.allowedRoles.includes(user.role))
            );
            if (visibleItems.length === 0) return null;
            return (
            <div key={section.title} className="space-y-1">
              {isOpen ? (
                <div className="px-6 py-1.5 text-[10px] font-black uppercase tracking-[2px] text-white/30">
                  {section.title}
                </div>
              ) : (
                sectionIdx > 0 && (
                  <div className="mx-6 my-2 border-t border-white/10" aria-hidden="true" />
                )
              )}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink
                    key={item.label}
                    to={item.path}
                    onClick={handleNavClick}
                    aria-label={item.label}
                    className={() => cn(
                      "flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all group relative focus-visible:outline-none focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-secondary/50 focus-visible:ring-inset",
                      isCurrentPath(item.path)
                        ? "text-white" 
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                  >
                    {isCurrentPath(item.path) && (
                      <motion.div
                        layoutId="active-nav"
                        className="absolute inset-y-1 left-2 right-2 bg-white/10 rounded-xl -z-10"
                        transition={transitions.smooth}
                      />
                    )}
                    
                    <item.icon className={cn(
                      "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
                      isCurrentPath(item.path) ? "text-secondary" : "text-white/40 group-hover:text-white"
                    )} />
                    <AnimatePresence>
                      {isOpen && (
                        <motion.span
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -10 }}
                          transition={transitions.fast}
                          className="whitespace-nowrap flex items-center justify-between flex-1"
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                    {!isOpen && (
                      <div className="absolute left-full ml-4 rounded-md bg-text px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap z-50 pointer-events-none">
                        {item.label}
                      </div>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          )})}
        </nav>

        {/* Sidebar Footer */}
        <div className="border-t border-white/10 p-5 min-w-[260px] space-y-4">
          <button
            onClick={handleLogout}
            aria-label="Logout"
            className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:bg-white/5 hover:text-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 group relative"
          >
            <LogOut className="h-5 w-5 shrink-0 group-hover:rotate-12 transition-transform text-white/40 group-hover:text-white" />
            <AnimatePresence>
              {isOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={transitions.fast}
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          
          {!isMobile && (
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-expanded={isOpen}
              aria-label={isOpen ? "Collapse Sidebar" : "Expand Sidebar"}
              className="flex w-full items-center justify-center rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 transition-all"
            >
              <motion.div
                animate={{ rotate: isOpen ? 0 : 180 }}
                transition={transitions.smooth}
              >
                <ChevronLeft className="h-5 w-5" />
              </motion.div>
            </button>
          )}
        </div>
      </motion.aside>
    </>
  );
}
