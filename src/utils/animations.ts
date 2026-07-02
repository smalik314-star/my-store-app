export const transitions = {
  default: { type: 'spring' as const, stiffness: 300, damping: 30 },
  smooth: { type: 'tween' as const, ease: 'easeInOut' as const, duration: 0.3 },
  fast: { type: 'tween' as const, ease: 'easeOut' as const, duration: 0.2 },
};

export const pageVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
};

export const modalVariants = {
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  content: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
  },
};

export const sidebarVariants = {
  expanded: { width: '280px' },
  collapsed: { width: '80px' },
  mobile: { x: 0 },
  mobileHidden: { x: '-100%' },
};

export const itemVariants = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0 },
};

export const hoverVariants = {
  lift: { y: -4, shadow: '0 10px 25px -5px rgba(0,0,0,0.1)' },
  scale: { scale: 1.02 },
  tap: { scale: 0.98 },
};
