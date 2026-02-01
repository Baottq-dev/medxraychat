import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Brain, 
  Shield, 
  Zap,
  ArrowRight,
  CheckCircle
} from 'lucide-react';

export default function HomePage() {
  const features = [
    {
      icon: Brain,
      title: 'AI-Powered Analysis',
      description: 'Qwen3-VL và YOLOv11 được fine-tune trên VinDR-CXR dataset để phát hiện 22 loại bệnh lý',
    },
    {
      icon: Zap,
      title: 'Real-time Detection',
      description: 'Phát hiện bất thường trong vài giây với độ chính xác cao nhờ mô hình YOLO tối ưu',
    },
    {
      icon: Shield,
      title: 'HIPAA Compliant',
      description: 'Bảo mật dữ liệu y tế theo tiêu chuẩn quốc tế, mã hóa end-to-end',
    },
    {
      icon: Activity,
      title: 'Interactive Viewer',
      description: 'Công cụ xem DICOM chuyên nghiệp với annotation, measurement và zoom tools',
    },
  ];

  const capabilities = [
    'Hỗ trợ định dạng DICOM chuẩn',
    'Phát hiện 22 bệnh lý X-quang ngực',
    'Chat AI để phân tích chi tiết',
    'Xuất báo cáo tự động',
    'Đo lường và annotation',
    'Lưu trữ và quản lý study',
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-8 w-8 text-blue-500" />
            <span className="text-xl font-bold text-white">MedXrayChat</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost" className="text-slate-300 hover:text-white">
                Đăng nhập
              </Button>
            </Link>
            <Link href="/register">
              <Button className="bg-blue-600 hover:bg-blue-700">
                Đăng ký
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-2 mb-6">
            <span className="text-blue-400 text-sm">🚀 Powered by Qwen3-VL & YOLOv11</span>
          </div>
          
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            Phân tích X-quang<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
              với AI thông minh
            </span>
          </h1>
          
          <p className="text-xl text-slate-400 mb-10 max-w-2xl mx-auto">
            Nền tảng phân tích hình ảnh y tế sử dụng AI tiên tiến, 
            hỗ trợ bác sĩ chẩn đoán nhanh chóng và chính xác hơn.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-lg px-8 py-6">
                Bắt đầu miễn phí
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/demo">
              <Button size="lg" variant="outline" className="text-lg px-8 py-6 border-slate-600 text-slate-300 hover:bg-slate-800">
                Xem Demo
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            Tính năng nổi bật
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div 
                key={index}
                className="p-6 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500/50 transition-colors"
              >
                <feature.icon className="h-12 w-12 text-blue-500 mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-400">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="py-20 px-4 bg-slate-800/30">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold text-white mb-6">
                Được thiết kế cho chuyên gia y tế
              </h2>
              <p className="text-slate-400 mb-8">
                MedXrayChat cung cấp đầy đủ công cụ cần thiết cho việc phân tích 
                và chẩn đoán hình ảnh X-quang một cách chuyên nghiệp.
              </p>
              
              <div className="grid sm:grid-cols-2 gap-4">
                {capabilities.map((capability, index) => (
                  <div key={index} className="flex items-center gap-3">
                    <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    <span className="text-slate-300">{capability}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="relative">
              <div className="aspect-video rounded-xl bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-slate-700 flex items-center justify-center">
                <div className="text-center">
                  <Activity className="h-20 w-20 text-blue-500 mx-auto mb-4 animate-pulse" />
                  <p className="text-slate-400">DICOM Viewer Preview</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Sẵn sàng trải nghiệm?
          </h2>
          <p className="text-slate-400 mb-8 max-w-xl mx-auto">
            Đăng ký ngay để sử dụng nền tảng phân tích X-quang AI tiên tiến nhất.
          </p>
          <Link href="/register">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
              Đăng ký miễn phí
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-slate-800">
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Activity className="h-6 w-6 text-blue-500" />
            <span className="text-slate-400">© 2024 MedXrayChat. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/privacy" className="text-slate-400 hover:text-white">
              Chính sách bảo mật
            </Link>
            <Link href="/terms" className="text-slate-400 hover:text-white">
              Điều khoản sử dụng
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
