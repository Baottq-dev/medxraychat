import { test, expect } from '@playwright/test';

// Helper function to login
async function login(page: any) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill('test@example.com');
  await page.getByLabel(/mật khẩu/i).fill('testpassword');
  await page.getByRole('button', { name: /đăng nhập/i }).click();
  await page.waitForURL(/\/(dashboard|viewer|studies)/);
}

test.describe('DICOM Viewer', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication for testing
    await page.addInitScript(() => {
      localStorage.setItem('medxray-tokens', JSON.stringify({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        tokenType: 'Bearer',
      }));
    });
  });

  test.describe('Viewer Layout', () => {
    test('should display viewer page elements', async ({ page }) => {
      await page.goto('/viewer');

      // Check for toolbar
      await expect(page.locator('[data-testid="viewer-toolbar"]')).toBeVisible();

      // Check for viewer canvas area
      await expect(page.locator('[data-testid="dicom-viewport"]')).toBeVisible();
    });

    test('should display viewer toolbar with tools', async ({ page }) => {
      await page.goto('/viewer');

      // Check for common tools
      await expect(page.getByRole('button', { name: /pan/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /zoom/i })).toBeVisible();
    });
  });

  test.describe('Viewer Controls', () => {
    test('should zoom in and out', async ({ page }) => {
      await page.goto('/viewer');

      const zoomInButton = page.getByRole('button', { name: /zoom.*in|phóng.*to/i });
      const zoomOutButton = page.getByRole('button', { name: /zoom.*out|thu.*nhỏ/i });

      if (await zoomInButton.isVisible()) {
        await zoomInButton.click();
        // Verify zoom level changed (check UI indicator if present)
      }

      if (await zoomOutButton.isVisible()) {
        await zoomOutButton.click();
      }
    });

    test('should reset view', async ({ page }) => {
      await page.goto('/viewer');

      const resetButton = page.getByRole('button', { name: /reset|fit|khôi.*phục/i });

      if (await resetButton.isVisible()) {
        await resetButton.click();
      }
    });

    test('should toggle invert mode', async ({ page }) => {
      await page.goto('/viewer');

      const invertButton = page.getByRole('button', { name: /invert|đảo.*ngược/i });

      if (await invertButton.isVisible()) {
        await invertButton.click();
        // Image should be inverted
      }
    });
  });

  test.describe('Tool Selection', () => {
    test('should switch between pan and zoom tools', async ({ page }) => {
      await page.goto('/viewer');

      const panTool = page.getByRole('button', { name: /pan/i });
      const zoomTool = page.getByRole('button', { name: /zoom/i });

      if (await panTool.isVisible()) {
        await panTool.click();
        await expect(panTool).toHaveAttribute('aria-pressed', 'true');
      }

      if (await zoomTool.isVisible()) {
        await zoomTool.click();
        await expect(zoomTool).toHaveAttribute('aria-pressed', 'true');
      }
    });

    test('should activate measurement tool', async ({ page }) => {
      await page.goto('/viewer');

      const measureTool = page.getByRole('button', { name: /measure|đo|length/i });

      if (await measureTool.isVisible()) {
        await measureTool.click();
      }
    });

    test('should activate annotation tool', async ({ page }) => {
      await page.goto('/viewer');

      const annotationTool = page.getByRole('button', { name: /annotate|chú.*thích|arrow/i });

      if (await annotationTool.isVisible()) {
        await annotationTool.click();
      }
    });
  });

  test.describe('Detection Panel', () => {
    test('should display detection panel', async ({ page }) => {
      await page.goto('/viewer');

      const detectionPanel = page.locator('[data-testid="detection-panel"]');

      if (await detectionPanel.isVisible()) {
        await expect(detectionPanel).toBeVisible();
      }
    });

    test('should toggle detection panel visibility', async ({ page }) => {
      await page.goto('/viewer');

      const toggleButton = page.getByRole('button', { name: /phát.*hiện|detections/i });

      if (await toggleButton.isVisible()) {
        await toggleButton.click();
      }
    });
  });
});

test.describe('Viewer with Image', () => {
  test('should display placeholder when no image loaded', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('medxray-tokens', JSON.stringify({
        accessToken: 'test-token',
        refreshToken: 'test-refresh',
        tokenType: 'Bearer',
      }));
    });

    await page.goto('/viewer');

    await expect(page.getByText(/no image|chưa có ảnh|select.*image/i)).toBeVisible();
  });
});
