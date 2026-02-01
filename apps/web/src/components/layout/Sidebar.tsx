'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  FolderOpen, 
  Upload, 
  Eye, 
  FileText, 
  MessageSquare,
  Settings,
  HelpCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Activity
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

const menuItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Nghiên cứu',
    href: '/studies',
    icon: FolderOpen,
  },
  {
    title: 'Tải lên',
    href: '/upload',
    icon: Upload,
  },
  {
    title: 'Xem ảnh',
    href: '/viewer',
    icon: Eye,
  },
  {
    title: 'Báo cáo',
    href: '/reports',
    icon: FileText,
  },
];

const bottomMenuItems = [
  {
    title: 'Cài đặt',
    href: '/settings',
    icon: Settings,
  },
  {
    title: 'Trợ giúp',
    href: '/help',
    icon: HelpCircle,
  },
];

export function Sidebar({ collapsed: initialCollapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const handleToggle = () => {
    setCollapsed(!collapsed);
    onToggle?.();
  };

  return (
    <aside 
      className={`
        flex flex-col h-screen bg-card border-r border-border transition-all duration-300
        ${collapsed ? 'w-16' : 'w-64'}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center gap-2">
            <Activity className="w-8 h-8 text-primary" />
            <span className="text-xl font-bold text-primary">MedXray</span>
          </Link>
        )}
        {collapsed && (
          <Link href="/dashboard" className="mx-auto">
            <Activity className="w-8 h-8 text-primary" />
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          className={collapsed ? 'mx-auto' : ''}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors
                    ${isActive 
                      ? 'bg-primary text-primary-foreground' 
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-border py-4">
        <ul className="space-y-1 px-2">
          {bottomMenuItems.map((item) => {
            const Icon = item.icon;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                    text-muted-foreground hover:bg-muted hover:text-foreground
                    ${collapsed ? 'justify-center' : ''}
                  `}
                  title={collapsed ? item.title : undefined}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* User Section */}
      <div className="border-t border-border p-4">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
              {user?.fullName?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {user?.fullName || 'User'}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.email || ''}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              title="Đăng xuất"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="w-full"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </Button>
        )}
      </div>
    </aside>
  );
}
