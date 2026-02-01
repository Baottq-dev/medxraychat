'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  FileText, 
  Download, 
  Printer, 
  Share2, 
  Calendar,
  User,
  Clock,
  CheckCircle,
  AlertTriangle,
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  Edit,
  Trash2,
  Plus,
  Search,
  Filter
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuthStore } from '@/stores';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';

interface Finding {
  id: string;
  class_name: string;
  class_name_vi: string;
  confidence: number;
  severity: 'normal' | 'mild' | 'moderate' | 'severe';
  location?: string;
  description?: string;
}

interface Report {
  id: string;
  study_id: string;
  patient_name: string;
  patient_id: string;
  study_date: string;
  report_date: string;
  status: 'draft' | 'pending_review' | 'approved' | 'final';
  doctor_name?: string;
  findings: Finding[];
  impression: string;
  recommendation: string;
  ai_analysis?: {
    model: string;
    confidence: number;
    analysis_time: number;
  };
}

function ReportsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const studyId = searchParams.get('study');
  
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const { toast } = useToast();
  
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFindings, setExpandedFindings] = useState<string[]>([]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    fetchReports();
  }, [hasHydrated, isAuthenticated, router, studyId]);

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      // Mock data for demo
      const mockReports: Report[] = [
        {
          id: '1',
          study_id: 'study-1',
          patient_name: 'Nguyễn Văn A',
          patient_id: 'BN001',
          study_date: '2026-01-28',
          report_date: '2026-01-28',
          status: 'final',
          doctor_name: 'BS. Trần Thị B',
          findings: [
            {
              id: 'f1',
              class_name: 'Cardiomegaly',
              class_name_vi: 'Phì đại tim',
              confidence: 0.92,
              severity: 'moderate',
              location: 'Trung tâm ngực',
              description: 'Bóng tim to, CTR > 0.5'
            },
            {
              id: 'f2',
              class_name: 'Pleural effusion',
              class_name_vi: 'Tràn dịch màng phổi',
              confidence: 0.78,
              severity: 'mild',
              location: 'Góc sườn hoành phải',
              description: 'Tràn dịch lượng ít'
            }
          ],
          impression: 'Hình ảnh X-quang ngực cho thấy phì đại tim mức độ trung bình và tràn dịch màng phổi lượng ít bên phải.',
          recommendation: 'Đề nghị siêu âm tim đánh giá chức năng tim. Theo dõi tình trạng tràn dịch.',
          ai_analysis: {
            model: 'YOLOv11-MedXray',
            confidence: 0.85,
            analysis_time: 1.2
          }
        },
        {
          id: '2',
          study_id: 'study-2',
          patient_name: 'Lê Thị C',
          patient_id: 'BN002',
          study_date: '2026-01-27',
          report_date: '2026-01-27',
          status: 'approved',
          doctor_name: 'BS. Nguyễn Văn D',
          findings: [
            {
              id: 'f3',
              class_name: 'No finding',
              class_name_vi: 'Không có bất thường',
              confidence: 0.95,
              severity: 'normal'
            }
          ],
          impression: 'Hình ảnh X-quang ngực trong giới hạn bình thường.',
          recommendation: 'Không cần can thiệp. Khám định kỳ theo lịch.',
          ai_analysis: {
            model: 'YOLOv11-MedXray',
            confidence: 0.95,
            analysis_time: 0.8
          }
        },
        {
          id: '3',
          study_id: 'study-3',
          patient_name: 'Phạm Văn E',
          patient_id: 'BN003',
          study_date: '2026-01-26',
          report_date: '2026-01-26',
          status: 'pending_review',
          findings: [
            {
              id: 'f4',
              class_name: 'Pulmonary fibrosis',
              class_name_vi: 'Xơ phổi',
              confidence: 0.72,
              severity: 'moderate',
              location: 'Hai đáy phổi',
              description: 'Dấu hiệu xơ hóa mô kẽ hai bên'
            },
            {
              id: 'f5',
              class_name: 'Lung Opacity',
              class_name_vi: 'Mờ phổi',
              confidence: 0.65,
              severity: 'mild',
              location: 'Thùy dưới phổi phải'
            }
          ],
          impression: 'Nghi ngờ xơ phổi hai bên và mờ thùy dưới phổi phải.',
          recommendation: 'Cần CT ngực độ phân giải cao để đánh giá chi tiết. Tham vấn chuyên khoa hô hấp.',
          ai_analysis: {
            model: 'YOLOv11-MedXray',
            confidence: 0.68,
            analysis_time: 1.5
          }
        }
      ];
      
      setReports(mockReports);
      if (studyId) {
        const report = mockReports.find(r => r.study_id === studyId);
        if (report) setSelectedReport(report);
      } else if (mockReports.length > 0) {
        setSelectedReport(mockReports[0]);
      }
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể tải danh sách báo cáo',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleFinding = (findingId: string) => {
    setExpandedFindings(prev => 
      prev.includes(findingId) 
        ? prev.filter(id => id !== findingId)
        : [...prev, findingId]
    );
  };

  const getStatusBadge = (status: Report['status']) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-500/20 text-gray-400',
      pending_review: 'bg-yellow-500/20 text-yellow-400',
      approved: 'bg-blue-500/20 text-blue-400',
      final: 'bg-green-500/20 text-green-400'
    };
    const labels: Record<string, string> = {
      draft: 'Nháp',
      pending_review: 'Chờ duyệt',
      approved: 'Đã duyệt',
      final: 'Hoàn thành'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const getSeverityBadge = (severity: Finding['severity']) => {
    const styles: Record<string, string> = {
      normal: 'bg-green-500/20 text-green-400',
      mild: 'bg-yellow-500/20 text-yellow-400',
      moderate: 'bg-orange-500/20 text-orange-400',
      severe: 'bg-red-500/20 text-red-400'
    };
    const labels: Record<string, string> = {
      normal: 'Bình thường',
      mild: 'Nhẹ',
      moderate: 'Trung bình',
      severe: 'Nặng'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${styles[severity]}`}>
        {labels[severity]}
      </span>
    );
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!selectedReport) return;
    toast({
      title: 'Đang xuất báo cáo',
      description: `Đang tạo file ${format.toUpperCase()}...`
    });
    // TODO: Implement export
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredReports = reports.filter(report =>
    report.patient_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    report.patient_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
              <h1 className="text-xl font-semibold">Báo cáo</h1>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                In
              </Button>
              <Button variant="outline" onClick={() => handleExport('pdf')}>
                <Download className="w-4 h-4 mr-2" />
                Xuất PDF
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Report List */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm báo cáo..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredReports.map(report => (
                  <Card 
                    key={report.id}
                    className={`cursor-pointer transition-all hover:border-primary ${
                      selectedReport?.id === report.id ? 'border-primary bg-primary/5' : ''
                    }`}
                    onClick={() => setSelectedReport(report)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-medium">{report.patient_name}</h3>
                          <p className="text-sm text-muted-foreground">{report.patient_id}</p>
                        </div>
                        {getStatusBadge(report.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(report.study_date).toLocaleDateString('vi-VN')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {report.findings.length} phát hiện
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Report Detail */}
          <div className="lg:col-span-2">
            {selectedReport ? (
              <div className="space-y-6">
                {/* Report Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">
                          Báo cáo X-quang ngực
                        </CardTitle>
                        <CardDescription>
                          ID: {selectedReport.id}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => router.push(`/viewer?study=${selectedReport.study_id}`)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Share2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Bệnh nhân</p>
                        <p className="font-medium">{selectedReport.patient_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Mã BN</p>
                        <p className="font-medium">{selectedReport.patient_id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Ngày chụp</p>
                        <p className="font-medium">
                          {new Date(selectedReport.study_date).toLocaleDateString('vi-VN')}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Bác sĩ</p>
                        <p className="font-medium">{selectedReport.doctor_name || 'Chưa có'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Analysis Info */}
                {selectedReport.ai_analysis && (
                  <Card className="bg-primary/5 border-primary/20">
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-4">
                        <Activity className="w-8 h-8 text-primary" />
                        <div className="flex-1">
                          <h4 className="font-medium">Phân tích AI</h4>
                          <p className="text-sm text-muted-foreground">
                            Model: {selectedReport.ai_analysis.model} | 
                            Độ tin cậy: {(selectedReport.ai_analysis.confidence * 100).toFixed(0)}% |
                            Thời gian: {selectedReport.ai_analysis.analysis_time}s
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Findings */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Phát hiện ({selectedReport.findings.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedReport.findings.map(finding => (
                      <div 
                        key={finding.id}
                        className="border border-border rounded-lg overflow-hidden"
                      >
                        <div 
                          className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleFinding(finding.id)}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-lg font-bold text-primary">
                                {(finding.confidence * 100).toFixed(0)}%
                              </span>
                            </div>
                            <div>
                              <h4 className="font-medium">{finding.class_name_vi}</h4>
                              <p className="text-sm text-muted-foreground">{finding.class_name}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {getSeverityBadge(finding.severity)}
                            {expandedFindings.includes(finding.id) 
                              ? <ChevronUp className="w-4 h-4" />
                              : <ChevronDown className="w-4 h-4" />
                            }
                          </div>
                        </div>
                        
                        {expandedFindings.includes(finding.id) && (
                          <div className="p-3 pt-0 border-t border-border bg-muted/20">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                              {finding.location && (
                                <div>
                                  <span className="text-muted-foreground">Vị trí: </span>
                                  <span>{finding.location}</span>
                                </div>
                              )}
                              {finding.description && (
                                <div className="col-span-2">
                                  <span className="text-muted-foreground">Mô tả: </span>
                                  <span>{finding.description}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Impression & Recommendation */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <FileText className="w-5 h-5" />
                        Kết luận
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">
                        {selectedReport.impression}
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle className="w-5 h-5" />
                        Đề xuất
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">
                        {selectedReport.recommendation}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-4">
                  {selectedReport.status === 'draft' && (
                    <Button variant="outline">
                      Gửi duyệt
                    </Button>
                  )}
                  {selectedReport.status === 'pending_review' && (
                    <>
                      <Button variant="outline">
                        Từ chối
                      </Button>
                      <Button>
                        Phê duyệt
                      </Button>
                    </>
                  )}
                  {selectedReport.status === 'approved' && (
                    <Button>
                      Hoàn thành
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <Card>
                <CardContent className="py-20 text-center">
                  <FileText className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Chưa chọn báo cáo</h3>
                  <p className="text-muted-foreground">
                    Chọn một báo cáo từ danh sách để xem chi tiết
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          header, .no-print {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .lg\\:col-span-2 {
            grid-column: span 3 !important;
          }
        }
      `}</style>
    </div>
  );
}

// Wrapper component with Suspense for useSearchParams
export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <ReportsContent />
    </Suspense>
  );
}
