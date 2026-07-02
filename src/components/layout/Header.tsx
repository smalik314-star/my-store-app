import { Bell, Menu, Search, User } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../common/Button';

interface HeaderProps {
  onMenuClick: () => void;
  pageTitle?: string;
}

export function Header({ onMenuClick, pageTitle }: HeaderProps) {
  const { user } = useAuth();
  const location = useLocation();

  const getPageTitle = () => {
    if (pageTitle) return pageTitle;
    const path = location.pathname.split('/').pop() || 'Dashboard';
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  return (
    <header className="sticky top-0 z-30 h-16 lg:h-[72px] w-full border-b border-border bg-surface/90 backdrop-blur-md px-4 md:px-8 no-print">
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onMenuClick}
            className="lg:hidden p-2 h-10 w-10 flex shrink-0"
          >
            <Menu className="h-6 w-6" />
          </Button>
          <h2 className="text-base md:text-lg font-semibold text-text truncate">
            {getPageTitle()}
          </h2>
        </div>

        <div className="flex items-center gap-2 md:gap-6 shrink-0">
          <button className="hidden sm:flex text-text/40 hover:text-text transition-colors p-2">
            <Search className="h-5 w-5" />
          </button>

          <Button variant="ghost" size="sm" className="relative p-2 h-10 w-10 rounded-full text-text/40 hover:text-text">
            <Bell className="h-5 w-5" />
            <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-danger border-2 border-surface" />
          </Button>

          <div className="flex items-center gap-2 md:gap-3 md:pl-6 md:border-l md:border-border">
            <div className="hidden md:block text-right">
              <p className="text-sm font-semibold text-text leading-none">
                {user?.displayName || 'User'}
              </p>
              <p className="text-xs text-text/40 mt-1 capitalize">{user?.role || 'Staff'}</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-background border border-border overflow-hidden flex items-center justify-center font-semibold text-text/60 text-xs shrink-0 bg-primary/10 text-primary">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="User Avatar" className="h-full w-full object-cover" />
              ) : (
                user?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
