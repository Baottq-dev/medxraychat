'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  FileText, 
  Trash2, 
  Calendar,
  User,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  SortAsc,
  SortDesc
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/stores';
import { useStudyStore } from '@/stores';

type ViewMode = 'grid' | 'list';
type SortField = 'date' | 'name' | 'patient';
type SortOrder = 'asc' | 'desc';

export default function StudiesPage() {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const { studies, isLoading, fetchStudies, deleteStudy, totalStudies, currentPage, pageSize } = useStudyStore();
  
  // Calculate total pages from store values
  const totalPages = Math.ceil(totalStudies / pageSize);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedStudies, setSelectedStudies] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState({ from: '', to: '' });
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchStudies();
  }, [hasHydrated, isAuthenticated, router, fetchStudies]);

  const filteredStudies = studies
    .filter(study => {
      const matchesSearch = 
        study.patientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        study.patientId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        study.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === 'all' || study.status === statusFilter;
      
      let matchesDate = true;
      if (dateFilter.from) {
        matchesDate = matchesDate && new Date(study.studyDate) >= new Date(dateFilter.from);
      }
      if (dateFilter.to) {
        matchesDate = matchesDate && new Date(study.studyDate) <= new Date(dateFilter.to);
      }
      
      return matchesSearch && matchesStatus && matchesDate;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'date':
          comparison = new Date(a.studyDate).getTime() - new Date(b.studyDate).getTime();
          break;
        case 'name':
          comparison = (a.description || '').localeCompare(b.description || '');
          break;
        case 'patient':
          comparison = (a.patientName || '').localeCompare(b.patientName || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const toggleStudySelection = (studyId: string) => {
    setSelectedStudies(prev => 
      prev.includes(studyId) 
        ? prev.filter(id => id !== studyId)
        : [...prev, studyId]
    );
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Xác nhận xóa ${selectedStudies.length} nghiên cứu?`)) return;
    for (const id of selectedStudies) {
      await deleteStudy(id);
    }
    setSelectedStudies([]);
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      completed: 'bg-green-500/20 text-green-400',
      pending: 'bg-yellow-500/20 text-yellow-400',
      analyzing: 'bg-blue-500/20 text-blue-400',
      failed: 'bg-red-500/20 text-red-400'
    };
    const labels: Record<string, string> = {
      completed: 'Hoàn thành',
      pending: 'Chờ xử lý',
      analyzing: 'Đang phân tích',
      failed: 'Lỗi'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${styles[status] || styles.pending}`}>
        {labels[status] || status}
      </span>
    );
  };

  // Show loading while hydrating or not authenticated
  if (!hasHydrated || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="text-2xl font-bold text-primary">
                MedXrayChat
              </Link>
              <span className="text-muted-foreground">/</span>
              <h1 className="text-xl font-semibold">Danh sách nghiên cứu</h1>
            </div>
            <Link href="/upload">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tải lên mới
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Tìm kiếm theo tên bệnh nhân, ID, mô tả..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setFilterOpen(!filterOpen)}
              className={filterOpen ? 'bg-primary/10' : ''}
            >
              <Filter className="w-4 h-4 mr-2" />
              Bộ lọc
            </Button>
            
            <div className="flex border border-border rounded-md">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('grid')}
                className={viewMode === 'grid' ? 'bg-primary/10' : ''}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setViewMode('list')}
                className={viewMode === 'list' ? 'bg-primary/10' : ''}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Filter Panel */}
        {filterOpen && (
          <Card className="mb-6">
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Từ ngày</label>
                  <Input
                    type="date"
                    value={dateFilter.from}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, from: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Đến ngày</label>
                  <Input
                    type="date"
                    value={dateFilter.to}
                    onChange={(e) => setDateFilter(prev => ({ ...prev, to: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block">Trạng thái</label>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="all">Tất cả</option>
                    <option value="completed">Hoàn thành</option>
                    <option value="pending">Chờ xử lý</option>
                    <option value="analyzing">Đang phân tích</option>
                    <option value="failed">Lỗi</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setDateFilter({ from: '', to: '' });
                      setStatusFilter('all');
                    }}
                  >
                    Xóa bộ lọc
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected Actions */}
        {selectedStudies.length > 0 && (
          <div className="flex items-center gap-4 mb-4 p-3 bg-primary/10 rounded-lg">
            <span className="text-sm">Đã chọn {selectedStudies.length} nghiên cứu</span>
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="w-4 h-4 mr-2" />
              Xóa
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedStudies([])}>
              Bỏ chọn
            </Button>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredStudies.length === 0 ? (
          <Card>
            <CardContent className="py-20 text-center">
              <ImageIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Không có nghiên cứu nào</h3>
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'Không tìm thấy kết quả phù hợp' : 'Bắt đầu bằng cách tải lên ảnh X-quang'}
              </p>
              <Link href="/upload">
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Tải lên ảnh mới
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStudies.map(study => (
              <Card 
                key={study.id} 
                className={`cursor-pointer transition-all hover:border-primary ${
                  selectedStudies.includes(study.id) ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <CardContent className="p-4">
                  {/* Thumbnail */}
                  <div 
                    className="aspect-square bg-muted rounded-lg mb-3 flex items-center justify-center overflow-hidden"
                    onClick={() => router.push(`/viewer?study=${study.id}`)}
                  >
                    {study.thumbnailUrl ? (
                      <img
                        src={study.thumbnailUrl}
                        alt={study.description}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium truncate flex-1">
                        {study.description || 'Chưa có mô tả'}
                      </h3>
                      <input
                        type="checkbox"
                        checked={selectedStudies.includes(study.id)}
                        onChange={() => toggleStudySelection(study.id)}
                        className="w-4 h-4 rounded border-gray-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span className="truncate">{study.patientName || 'N/A'}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(study.studyDate)}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <ImageIcon className="w-3 h-3" />
                        <span>{study.imageCount || 0} ảnh</span>
                      </div>
                      {getStatusBadge(study.status)}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => router.push(`/viewer?study=${study.id}`)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Xem
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => router.push(`/reports?study=${study.id}`)}
                      >
                        <FileText className="w-3 h-3 mr-1" />
                        Báo cáo
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* List View */
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="w-10 p-3">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedStudies(filteredStudies.map(s => s.id));
                          } else {
                            setSelectedStudies([]);
                          }
                        }}
                        checked={selectedStudies.length === filteredStudies.length && filteredStudies.length > 0}
                      />
                    </th>
                    <th className="p-3 text-left">
                      <button 
                        className="flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSort('patient')}
                      >
                        Bệnh nhân
                        {sortField === 'patient' && (
                          sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 text-left">
                      <button 
                        className="flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSort('name')}
                      >
                        Mô tả
                        {sortField === 'name' && (
                          sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 text-left">
                      <button 
                        className="flex items-center gap-1 hover:text-primary"
                        onClick={() => toggleSort('date')}
                      >
                        Ngày
                        {sortField === 'date' && (
                          sortOrder === 'asc' ? <SortAsc className="w-3 h-3" /> : <SortDesc className="w-3 h-3" />
                        )}
                      </button>
                    </th>
                    <th className="p-3 text-left">Số ảnh</th>
                    <th className="p-3 text-left">Trạng thái</th>
                    <th className="p-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStudies.map(study => (
                    <tr key={study.id} className="border-t border-border hover:bg-muted/30">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selectedStudies.includes(study.id)}
                          onChange={() => toggleStudySelection(study.id)}
                        />
                      </td>
                      <td className="p-3">
                        <div>
                          <div className="font-medium">{study.patientName || 'N/A'}</div>
                          <div className="text-sm text-muted-foreground">{study.patientId}</div>
                        </div>
                      </td>
                      <td className="p-3">{study.description || 'Chưa có mô tả'}</td>
                      <td className="p-3">{formatDate(study.studyDate)}</td>
                      <td className="p-3">{study.imageCount || 0}</td>
                      <td className="p-3">{getStatusBadge(study.status)}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => router.push(`/viewer?study=${study.id}`)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => router.push(`/reports?study=${study.id}`)}
                          >
                            <FileText className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => {
                              if (confirm('Xác nhận xóa?')) deleteStudy(study.id);
                            }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === 1}
              onClick={() => fetchStudies(currentPage - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <span className="text-sm text-muted-foreground">
              Trang {currentPage} / {totalPages}
            </span>
            
            <Button
              variant="outline"
              size="icon"
              disabled={currentPage === totalPages}
              onClick={() => fetchStudies(currentPage + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
