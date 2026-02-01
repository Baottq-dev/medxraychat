'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore, useStudyStore } from '@/stores';
import { dashboardApi } from '@/lib/api';
import type { DashboardStats } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Activity,
  FolderOpen,
  MessageSquare,
  FileText,
  Upload,
  Clock,
  LogOut,
  Settings,
  User,
  ChevronRight,
} from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, hasHydrated } = useAuthStore();
  const { studies, fetchStudies, isLoading } = useStudyStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Redirect if not authenticated (only after hydration)
  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push('/login');
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Fetch studies on mount
  useEffect(() => {
    fetchStudies(1, 5);
  }, [fetchStudies]);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setIsLoadingStats(true);
        const data = await dashboardApi.getStats();
        setStats(data);
      } catch (error) {
        console.error('Failed to fetch dashboard stats:', error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    if (isAuthenticated) {
      fetchStats();
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Show loading while hydrating or not authenticated
  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const statsConfig = [
    {
      title: 'Tổng số Study',
      value: isLoadingStats ? '...' : String(stats?.totalStudies ?? 0),
      icon: FolderOpen,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Phân tích hôm nay',
      value: isLoadingStats ? '...' : String(stats?.analysesToday ?? 0),
      icon: Activity,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Chat sessions',
      value: isLoadingStats ? '...' : String(stats?.chatSessions ?? 0),
      icon: MessageSquare,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Báo cáo',
      value: isLoadingStats ? '...' : String(stats?.reports ?? 0),
      icon: FileText,
      color: 'text-orange-500',
      bgColor: 'bg-orange-500/10',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Activity className="h-7 w-7 text-blue-500" />
            <span className="text-lg font-bold text-white">MedXrayChat</span>
          </Link>

          <div className="flex items-center gap-6">
            <Link
              href="/studies"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Studies
            </Link>
            <Link
              href="/viewer"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Viewer
            </Link>
            <Link
              href="/reports"
              className="text-slate-400 hover:text-white transition-colors"
            >
              Reports
            </Link>
          </div>

          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="text-slate-400">
              <Settings className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              <div className="hidden md:block">
                <p className="text-sm font-medium text-white">{user?.fullName}</p>
                <p className="text-xs text-slate-500">{user?.role}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-red-400"
              onClick={handleLogout}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="pt-20 pb-8 px-4">
        <div className="container mx-auto">
          {/* Welcome */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">
              Xin chào, {user?.fullName}! 👋
            </h1>
            <p className="text-slate-400">
              Đây là tổng quan hoạt động của bạn hôm nay.
            </p>
          </div>

          {/* Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statsConfig.map((stat, index) => (
              <Card key={index} className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">{stat.title}</p>
                      <p className="text-2xl font-bold text-white mt-1">
                        {stat.value}
                      </p>
                    </div>
                    <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                      <stat.icon className={`h-6 w-6 ${stat.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Quick actions */}
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <Card className="bg-gradient-to-br from-blue-600/20 to-blue-800/20 border-blue-500/30">
              <CardContent className="p-6">
                <Upload className="h-8 w-8 text-blue-400 mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  Upload Study mới
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Tải lên file DICOM để bắt đầu phân tích
                </p>
                <Link href="/studies/upload">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Upload ngay
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30">
              <CardContent className="p-6">
                <Activity className="h-8 w-8 text-green-400 mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  Xem Viewer
                </h3>
                <p className="text-slate-400 text-sm mb-4">
                  Mở DICOM Viewer với công cụ phân tích AI
                </p>
                <Link href="/viewer">
                  <Button className="bg-green-600 hover:bg-green-700">
                    Mở Viewer
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

          </div>

          {/* Recent studies */}
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">Studies gần đây</CardTitle>
              <Link href="/studies">
                <Button variant="ghost" size="sm" className="text-blue-400">
                  Xem tất cả
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="loading-spinner w-6 h-6 text-blue-500" />
                </div>
              ) : studies.length === 0 ? (
                <div className="text-center py-8">
                  <FolderOpen className="h-12 w-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-slate-400">Chưa có study nào</p>
                  <Link href="/studies/upload">
                    <Button variant="link" className="text-blue-400 mt-2">
                      Upload study đầu tiên
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {studies.slice(0, 5).map((study) => (
                    <Link
                      key={study.id}
                      href={`/studies/${study.id}`}
                      className="flex items-center justify-between p-4 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center">
                          <FolderOpen className="h-5 w-5 text-slate-300" />
                        </div>
                        <div>
                          <p className="font-medium text-white">
                            {study.patientName}
                          </p>
                          <p className="text-sm text-slate-400">
                            {study.modality} • {study.imageCount} images
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              study.status === 'completed'
                                ? 'bg-green-500/20 text-green-400'
                                : study.status === 'in_progress'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-slate-500/20 text-slate-400'
                            }`}
                          >
                            {study.status}
                          </span>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(study.createdAt)}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-500" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
