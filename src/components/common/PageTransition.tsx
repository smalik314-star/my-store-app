import { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { pageVariants, transitions } from '../../utils/animations';

interface PageTransitionProps {
  children: ReactNode;
}

export function PageTransition({ children }: PageTransitionProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={shouldReduceMotion ? { duration: 0 } : transitions.smooth}
    >
      {children}
    </motion.div>
  );
}
