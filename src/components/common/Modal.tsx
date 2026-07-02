import { ReactNode, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { Button } from './Button';
import { modalVariants, transitions } from '../../utils/animations';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ isOpen, onClose, title, children, footer }: ModalProps) {
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            variants={modalVariants.overlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-text/40 backdrop-blur-sm"
          />
          <motion.div
            variants={modalVariants.content}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={shouldReduceMotion ? { duration: 0 } : transitions.default}
            className="relative w-full max-w-lg overflow-hidden rounded-[2rem] bg-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border p-6">
              <h3 className="text-xl font-black text-text tracking-tight uppercase">{title}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="rounded-full p-2 h-auto hover:rotate-90 transition-transform"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto">{children}</div>
            {footer && (
              <div className="flex justify-end gap-3 border-t border-border bg-background p-6">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
