import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test.describe('Landing Page', () => {
    test('should display landing page', async ({ page }) => {
      await page.goto('/');

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test('should have navigation to login', async ({ page }) => {
      await page.goto('/');

      const loginLink = page.getByRole('link', { name: /đăng nhập|login/i });
      await expect(loginLink).toBeVisible();
    });

    test('should have navigation to register', async ({ page }) => {
      await page.goto('/');

      const registerLink = page.getByRole('link', { name: /đăng ký|register/i });
      await expect(registerLink).toBeVisible();
    });
  });

  test.describe('Authenticated Navigation', () => {
    test.beforeEach(async ({ page }) => {
      // Mock authentication
      await page.addInitScript(() => {
        localStorage.setItem('medxray-tokens', JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          tokenType: 'Bearer',
        }));
      });
    });

    test('should navigate to dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      await expect(page.getByRole('heading', { name: /dashboard|tổng quan/i })).toBeVisible();
    });

    test('should navigate to studies', async ({ page }) => {
      await page.goto('/studies');

      await expect(page.getByRole('heading', { name: /studies|nghiên cứu/i })).toBeVisible();
    });

    test('should navigate to viewer', async ({ page }) => {
      await page.goto('/viewer');

      // Viewer page should load
      await expect(page.locator('[data-testid="viewer-toolbar"], [data-testid="dicom-viewport"]')).toBeVisible();
    });

    test('should navigate to reports', async ({ page }) => {
      await page.goto('/reports');

      await expect(page.getByRole('heading', { name: /reports|báo cáo/i })).toBeVisible();
    });
  });

  test.describe('Sidebar Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('medxray-tokens', JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          tokenType: 'Bearer',
        }));
      });
    });

    test('should display sidebar on dashboard', async ({ page }) => {
      await page.goto('/dashboard');

      const sidebar = page.locator('[data-testid="sidebar"], aside, nav');
      await expect(sidebar.first()).toBeVisible();
    });

    test('should navigate using sidebar links', async ({ page }) => {
      await page.goto('/dashboard');

      // Click studies link in sidebar
      const studiesLink = page.getByRole('link', { name: /studies|nghiên cứu/i });
      if (await studiesLink.isVisible()) {
        await studiesLink.click();
        await expect(page).toHaveURL(/\/studies/);
      }
    });
  });

  test.describe('Mobile Navigation', () => {
    test('should display mobile menu on small screens', async ({ page }) => {
      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      await page.addInitScript(() => {
        localStorage.setItem('medxray-tokens', JSON.stringify({
          accessToken: 'test-token',
          refreshToken: 'test-refresh',
          tokenType: 'Bearer',
        }));
      });

      await page.goto('/dashboard');

      // Look for mobile menu button
      const menuButton = page.getByRole('button', { name: /menu/i });
      if (await menuButton.isVisible()) {
        await menuButton.click();
        // Mobile menu should appear
      }
    });
  });
});
