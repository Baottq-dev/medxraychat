'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Bell, 
  Search, 
  Moon, 
  Sun, 
  User,
  Settings,
  LogOut,
  Menu,
  Activity
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores';

interface HeaderProps {
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export function Header({ onMenuClick, showMenuButton = false }: HeaderProps) {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/studies?search=${encodeURIComponent(searchQuery)}`);
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const notifications = [
    { id: 1, title: 'Phân tích hoàn tất', message: 'Ảnh X-quang #123 đã được phân tích', time: '5 phút trước' },
    { id: 2, title: 'Báo cáo mới', message: 'Báo cáo cho bệnh nhân Nguyễn Văn A đã sẵn sàng', time: '1 giờ trước' },
    { id: 3, title: 'Cập nhật hệ thống', message: 'Model AI đã được cập nhật lên phiên bản mới', time: '2 giờ trước' },
  ];

  return (
    <header className="sticky top-0 z-50 h-16 bg-card border-b border-border">
      <div className="flex items-center justify-between h-full px-4">
        {/* Left Section */}
        <div className="flex items-center gap-4">
          {showMenuButton && (
            <Button variant="ghost" size="icon" onClick={onMenuClick}>
              <Menu className="w-5 h-5" />
            </Button>
          )}
          
          {/* Search */}
          <form onSubmit={handleSearch} className="hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Tìm kiếm nghiên cứu, bệnh nhân..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-80 pl-10"
              />
            </div>
          </form>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          {/* Dark Mode Toggle */}
          <Button variant="ghost" size="icon" onClick={toggleDarkMode}>
            {isDarkMode ? (
              <Sun className="w-5 h-5" />
            ) : (
              <Moon className="w-5 h-5" />
            )}
          </Button>

          {/* Notifications */}
          <div className="relative">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </Button>

            {showNotifications && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowNotifications(false)}
                />
                <div className="absolute right-0 mt-2 w-80 bg-card border border-border rounded-lg shadow-lg z-50">
                  <div className="p-3 border-b border-border">
                    <h3 className="font-semibold">Thông báo</h3>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.map((notification) => (
                      <div 
                        key={notification.id}
                        className="p-3 hover:bg-muted/50 cursor-pointer border-b border-border last:border-0"
                      >
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-sm text-muted-foreground">{notification.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
                      </div>
                    ))}
                  </div>
                  <div className="p-2 border-t border-border">
                    <Button variant="ghost" size="sm" className="w-full">
                      Xem tất cả
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* User Menu */}
          <div className="relative">
            <Button 
              variant="ghost" 
              className="flex items-center gap-2"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </div>
              <span className="hidden md:block text-sm">
                {user?.fullName || 'User'}
              </span>
            </Button>

            {showUserMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowUserMenu(false)}
                />
                <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-50">
                  <div className="p-3 border-b border-border">
                    <p className="font-medium">{user?.fullName || 'User'}</p>
                    <p className="text-sm text-muted-foreground">{user?.email}</p>
                  </div>
                  <div className="py-1">
                    <Link
                      href="/profile"
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User className="w-4 h-4" />
                      <span>Hồ sơ</span>
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Settings className="w-4 h-4" />
                      <span>Cài đặt</span>
                    </Link>
                  </div>
                  <div className="border-t border-border py-1">
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-2 px-3 py-2 w-full hover:bg-muted/50 text-red-500"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Đăng xuất</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
