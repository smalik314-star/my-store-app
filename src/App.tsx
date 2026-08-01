import { AuthProvider } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { ToastProvider } from './context/ToastContext';
import { AIProvider } from './context/AIContext';
import { AppRouter } from './routes/AppRouter';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { BusinessModeProvider } from './context/BusinessModeContext';

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BusinessModeProvider>
          <SettingsProvider>
            <ToastProvider>
              <AIProvider>
                <AppRouter />
              </AIProvider>
            </ToastProvider>
          </SettingsProvider>
        </BusinessModeProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
