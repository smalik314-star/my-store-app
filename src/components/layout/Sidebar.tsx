import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  LayoutDashboard, 
  Package, 
  Clock,
  ShoppingCart,
  Users, 
  ReceiptText, 
  BarChart3, 
  Settings, 
  Plus,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  X,
  Zap,
  CreditCard,
  Truck
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';
import { transitions } from '../../utils/animations';
import { Logo } from '../common/Logo';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  isMobile: boolean;
  onCloseMobile?: () => void;
}

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', active: true },
  { icon: Package, label: 'Inventory', path: '/inventory', active: true },
  { icon: Truck, label: 'Stock In / Purchases', path: '/purchases', active: true },
  { icon: Clock, label: 'Expiry Alerts', path: '/expiry-alerts', active: true },
  { icon: ShoppingCart, label: 'Low Stock', path: '/low-stock', active: true },
  { icon: Users, label: 'Customers', path: '/customers', active: true },
  { icon: Plus, label: 'New Bill', path: '/billing', active: true },
  { icon: ReceiptText, label: 'Invoices', path: '/invoices', active: true },
  { icon: BarChart3, label: 'Reports', path: '/reports', active: true },
  { icon: Users, label: 'Users', path: '/users', active: true },
  { icon: CreditCard, label: 'Subscription', path: '/subscription', active: true },
  { icon: Settings, label: 'Settings', path: '/settings', active: true },
];

export function Sidebar({ isOpen, setIsOpen, isMobile, onCloseMobile }: SidebarProps) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldReduceMotion = useReducedMotion();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleNavClick = (path: string, isActive: boolean) => {
    if (!isActive) {
      alert('Coming in future module');
      return;
    }
    if (isMobile && onCloseMobile) onCloseMobile();
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
          "fixed inset-y-0 left-0 z-50 flex flex-col bg-primary text-white border-r border-white/10 shadow-2xl lg:shadow-none no-print",
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
          <Button variant="ghost" size="sm" onClick={onCloseMobile} className="p-1 h-auto rounded-lg">
            <X className="h-6 w-6" />
          </Button>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 py-5 overflow-y-auto min-w-[260px] custom-scrollbar">
        {menuItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.active ? item.path : '#'}
            onClick={(e) => {
              if (!item.active) e.preventDefault();
              handleNavClick(item.path, item.active);
            }}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-6 py-3 text-sm font-medium transition-all group relative",
              isActive && item.active
                ? "text-white" 
                : "text-white/70 hover:bg-white/5 hover:text-white"
            )}
          >
            {location.pathname === item.path && item.active && (
              <motion.div
                layoutId="active-nav"
                className="absolute inset-y-1 left-2 right-2 bg-white/10 rounded-xl -z-10"
                transition={transitions.smooth}
              />
            )}
            
            <item.icon className={cn(
              "h-5 w-5 shrink-0 transition-transform group-hover:scale-110",
              location.pathname === item.path && item.active ? "text-secondary" : "text-white/40 group-hover:text-white"
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
                  {!item.active && (
                    <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded opacity-60 uppercase font-black">Soon</span>
                  )}
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
      </nav>

      {/* Sidebar Footer */}
      <div className="border-t border-white/10 p-5 min-w-[260px]">
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-1 py-1 text-sm font-medium text-white transition-all hover:text-white/80 group relative"
        >
          <LogOut className="h-5 w-5 shrink-0 group-hover:rotate-12 transition-transform" />
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
            className="mt-4 flex w-full items-center justify-center rounded-xl p-2 text-white/40 hover:bg-white/10 hover:text-white transition-all"
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
