import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { AIAssistant } from '../components/ai/AIAssistant';
import { QuickBillModal } from '../components/billing/QuickBillModal';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';

export default function MainLayout() {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.matchMedia('(max-width: 1023px)').matches) return false;
    return localStorage.getItem('pharma_sidebar_collapsed') !== 'true';
  });
  const [quickBillOpen, setQuickBillOpen] = useState(false);

  useEffect(() => {
    const handleOpenQuickBill = () => {
      setQuickBillOpen(true);
    };

    window.addEventListener('open-quick-bill', handleOpenQuickBill);
    return () => window.removeEventListener('open-quick-bill', handleOpenQuickBill);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const handleResize = (event: MediaQueryListEvent | MediaQueryList) => {
      const mobile = event.matches;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(localStorage.getItem('pharma_sidebar_collapsed') !== 'true');
    };

    handleResize(media);
    media.addEventListener('change', handleResize);
    return () => media.removeEventListener('change', handleResize);
  }, []);

  const setSidebarVisibility = (open: boolean) => {
    setSidebarOpen(open);
    if (!isMobile) localStorage.setItem('pharma_sidebar_collapsed', String(!open));
  };

  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarVisibility} 
        isMobile={isMobile}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className={cn(
        "flex flex-1 flex-col min-w-0 transition-all duration-300",
        !isMobile && sidebarOpen ? "pl-[260px]" : !isMobile ? "pl-[88px]" : "pl-0"
      )}>
        <Header onMenuClick={() => setSidebarVisibility(!sidebarOpen)} />
        <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-x-hidden w-full">
          <Outlet />
        </div>
        <AIAssistant />
      </main>

      {/* Global Quick Bill Modal Overlay */}
      <QuickBillModal isOpen={quickBillOpen} onClose={() => setQuickBillOpen(false)} />
    </div>
  );
}
