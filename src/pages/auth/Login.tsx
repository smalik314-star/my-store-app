import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../components/common/Logo';
import { Link } from 'react-router-dom';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await login();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/unauthorized-domain') {
        const domain = window.location.hostname;
        setError(`Domain "${domain}" is not authorized. Please add it to your Firebase Console under Authentication > Settings > Authorized domains.`);
      } else {
        setError('Failed to sign in with Google. Please try again.');
      }
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md z-10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex mb-4">
            <Logo className="h-16 w-16 drop-shadow-xl" variant="color" />
          </div>
          <h1 className="text-3xl font-bold text-text tracking-tight animate-fade-in">PharmaFlow</h1>
          <p className="text-text/60 mt-2 font-medium">Professional Pharmacy Management</p>
        </div>

        <Card className="p-8 shadow-2xl border-white/20 glass-morphism">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-semibold text-text">Welcome Back</h2>
            <p className="text-sm text-text/40 mt-1">Sign in to manage your inventory and billing</p>
          </div>

          {error && (
            <div className="mb-6 flex flex-col gap-3 rounded-xl bg-danger/10 p-4 text-sm font-medium text-danger border border-danger/20">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <p>{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Button
              onClick={handleGoogleLogin}
              isLoading={loading}
              className="w-full h-14 text-base font-bold shadow-lg"
              leftIcon={!loading && <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="h-5 w-5 mr-2" />}
            >
              {loading ? 'Signing in...' : 'Sign in with Google'}
            </Button>
          </div>

          <div className="mt-8 pt-8 border-t border-border/50 text-center">
            <p className="text-xs text-text/40 leading-relaxed">
              By signing in, you agree to the service terms and acknowledge our{' '}
              <Link to="/privacy" className="text-primary font-semibold underline">Privacy & Data Policy</Link>.
            </p>
          </div>
        </Card>

        <p className="mt-8 text-center text-sm text-text/40">
          Secure pharmacy inventory and billing
        </p>
      </motion.div>
    </div>
  );
}
