'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/stores';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { Activity, Loader2, Eye, EyeOff, CheckCircle } from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();
  
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  const passwordRequirements = [
    { met: password.length >= 8, text: 'Ít nhất 8 ký tự' },
    { met: /[A-Z]/.test(password), text: 'Chứa ít nhất 1 chữ in hoa' },
    { met: /[a-z]/.test(password), text: 'Chứa ít nhất 1 chữ thường' },
    { met: /[0-9]/.test(password), text: 'Chứa ít nhất 1 số' },
  ];

  const isPasswordValid = passwordRequirements.every(req => req.met);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    if (!fullName || !email || !password) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng điền đầy đủ thông tin',
        variant: 'destructive',
      });
      return;
    }

    if (!isPasswordValid) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu chưa đáp ứng yêu cầu',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Lỗi',
        description: 'Mật khẩu xác nhận không khớp',
        variant: 'destructive',
      });
      return;
    }

    if (!acceptTerms) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng đồng ý với điều khoản sử dụng',
        variant: 'destructive',
      });
      return;
    }

    try {
      await register(email, password, fullName);
      toast({
        title: 'Đăng ký thành công',
        description: 'Tài khoản của bạn đã được tạo!',
      });
      router.push('/dashboard');
    } catch (err) {
      toast({
        title: 'Đăng ký thất bại',
        description: error || 'Có lỗi xảy ra, vui lòng thử lại',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 px-4 py-8">
      <Card className="w-full max-w-md bg-slate-800/50 border-slate-700">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-blue-500/10">
              <Activity className="h-10 w-10 text-blue-500" />
            </div>
          </div>
          <CardTitle className="text-2xl text-white">Đăng ký tài khoản</CardTitle>
          <CardDescription className="text-slate-400">
            Tạo tài khoản để sử dụng MedXrayChat
          </CardDescription>
        </CardHeader>
        
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName" className="text-slate-300">Họ và tên</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Nguyễn Văn A"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="doctor@hospital.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
                disabled={isLoading}
                autoComplete="email"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Mật khẩu</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              
              {/* Password requirements */}
              {password && (
                <div className="mt-2 space-y-1">
                  {passwordRequirements.map((req, index) => (
                    <div 
                      key={index}
                      className={`flex items-center gap-2 text-xs ${
                        req.met ? 'text-green-500' : 'text-slate-500'
                      }`}
                    >
                      <CheckCircle className={`h-3 w-3 ${req.met ? 'opacity-100' : 'opacity-30'}`} />
                      {req.text}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-slate-300">Xác nhận mật khẩu</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={`bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 ${
                  confirmPassword && password !== confirmPassword ? 'border-red-500' : ''
                }`}
                disabled={isLoading}
                autoComplete="new-password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">Mật khẩu không khớp</p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                checked={acceptTerms}
                onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 rounded border-slate-600 bg-slate-700"
              />
              <label htmlFor="terms" className="text-sm text-slate-400">
                Tôi đồng ý với{' '}
                <Link href="/terms" className="text-blue-400 hover:text-blue-300">
                  Điều khoản sử dụng
                </Link>
                {' '}và{' '}
                <Link href="/privacy" className="text-blue-400 hover:text-blue-300">
                  Chính sách bảo mật
                </Link>
              </label>
            </div>
          </CardContent>
          
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={isLoading || !acceptTerms}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang đăng ký...
                </>
              ) : (
                'Đăng ký'
              )}
            </Button>
            
            <p className="text-center text-sm text-slate-400">
              Đã có tài khoản?{' '}
              <Link 
                href="/login"
                className="text-blue-400 hover:text-blue-300"
              >
                Đăng nhập
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
