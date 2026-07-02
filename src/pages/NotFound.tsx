import { motion } from 'motion/react';
import { Home, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="mb-8 rounded-full bg-danger/10 p-6 text-danger"
      >
        <AlertTriangle className="h-20 w-20" />
      </motion.div>
      <motion.h1
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-4 text-4xl font-bold text-text md:text-6xl"
      >
        404
      </motion.h1>
      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mb-8 text-xl font-medium text-text/60 md:text-2xl"
      >
        Oops! The page you're looking for doesn't exist.
      </motion.h2>
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Link to="/">
          <Button size="lg" leftIcon={<Home className="h-5 w-5" />}>
            Back to Dashboard
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}
