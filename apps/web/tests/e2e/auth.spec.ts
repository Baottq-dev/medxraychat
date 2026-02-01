import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');

      await expect(page.getByRole('heading', { name: /đăng nhập/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/mật khẩu/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /đăng nhập/i })).toBeVisible();
    });

    test('should show validation errors for empty form', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('button', { name: /đăng nhập/i }).click();

      await expect(page.getByText(/email.*bắt buộc/i)).toBeVisible();
      await expect(page.getByText(/mật khẩu.*bắt buộc/i)).toBeVisible();
    });

    test('should show error for invalid email format', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('invalid-email');
      await page.getByLabel(/mật khẩu/i).fill('password123');
      await page.getByRole('button', { name: /đăng nhập/i }).click();

      await expect(page.getByText(/email.*hợp lệ/i)).toBeVisible();
    });

    test('should redirect to register page', async ({ page }) => {
      await page.goto('/login');

      await page.getByRole('link', { name: /đăng ký/i }).click();

      await expect(page).toHaveURL('/register');
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');

      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/mật khẩu/i).fill('wrongpassword');
      await page.getByRole('button', { name: /đăng nhập/i }).click();

      // Should show error toast or message
      await expect(page.getByText(/đăng nhập thất bại|sai mật khẩu/i)).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');

      await expect(page.getByRole('heading', { name: /đăng ký/i })).toBeVisible();
      await expect(page.getByLabel(/họ.*tên/i)).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByLabel(/^mật khẩu$/i)).toBeVisible();
      await expect(page.getByLabel(/xác nhận mật khẩu/i)).toBeVisible();
    });

    test('should show error when passwords do not match', async ({ page }) => {
      await page.goto('/register');

      await page.getByLabel(/họ.*tên/i).fill('Test User');
      await page.getByLabel(/email/i).fill('test@example.com');
      await page.getByLabel(/^mật khẩu$/i).fill('password123');
      await page.getByLabel(/xác nhận mật khẩu/i).fill('differentpassword');
      await page.getByRole('button', { name: /đăng ký/i }).click();

      await expect(page.getByText(/mật khẩu.*không khớp/i)).toBeVisible();
    });

    test('should redirect to login page', async ({ page }) => {
      await page.goto('/register');

      await page.getByRole('link', { name: /đăng nhập/i }).click();

      await expect(page).toHaveURL('/login');
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when not authenticated', async ({ page }) => {
      await page.goto('/dashboard');

      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should redirect to login when accessing viewer without auth', async ({ page }) => {
      await page.goto('/viewer');

      await expect(page).toHaveURL(/\/login/);
    });

    test('should redirect to login when accessing studies without auth', async ({ page }) => {
      await page.goto('/studies');

      await expect(page).toHaveURL(/\/login/);
    });
  });
});
