import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/layout/Sidebar';
import { Header } from '../components/layout/Header';
import { AIAssistant } from '../components/ai/AIAssistant';
import { QuickBillModal } from '../components/billing/QuickBillModal';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [quickBillOpen, setQuickBillOpen] = useState(false);

  useEffect(() => {
    const handleOpenQuickBill = () => {
      setQuickBillOpen(true);
    };

    window.addEventListener('open-quick-bill', handleOpenQuickBill);
    return () => window.removeEventListener('open-quick-bill', handleOpenQuickBill);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
      else setSidebarOpen(true);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex min-h-screen bg-background overflow-x-hidden">
      <Sidebar 
        isOpen={sidebarOpen} 
        setIsOpen={setSidebarOpen} 
        isMobile={isMobile}
        onCloseMobile={() => setSidebarOpen(false)}
      />

      <main className={cn(
        "flex flex-1 flex-col min-w-0 transition-all duration-300",
        !isMobile && sidebarOpen ? "pl-[260px]" : !isMobile ? "pl-[88px]" : "pl-0"
      )}>
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        <div className="flex-1 p-2 min-[360px]:p-3 md:p-4 lg:p-5 overflow-x-hidden w-full">
          <Outlet />
        </div>
        <AIAssistant />
      </main>

      {/* Global Quick Bill Modal Overlay */}
      <QuickBillModal isOpen={quickBillOpen} onClose={() => setQuickBillOpen(false)} />
    </div>
  );
}
