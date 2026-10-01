import { test, expect } from '@playwright/test';

test.describe('Shorky validation: broken login flow', () => {
  test('user should be able to log in with the current username/password fields', async ({ page }) => {
    await page.goto('/login');

    // Updated locators to match the current DOM structure.
    await page.locator('#username').fill('tomsmith');
    await page.locator('#password').fill('SuperSecretPassword!');

    await page.getByRole('button', { name: /Login/ }).click();

    await expect(page).toHaveURL(/\/secure/);
    await expect(page.locator('#flash')).toContainText('You logged into a secure area!');
  });
});
