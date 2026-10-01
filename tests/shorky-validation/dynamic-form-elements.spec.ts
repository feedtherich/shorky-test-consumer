import { test, expect } from '@playwright/test';

test.describe('Shorky validation: dynamic form elements', () => {
  test('user should be able to choose Option 2 from the dropdown', async ({ page }) => {
    await page.goto('/dropdown');

    const dropdown = page.locator('#dropdown');

    // Correct action contract: Use `selectOption()` for `<select>` elements.
    await dropdown.selectOption('2');

    await expect(dropdown).toHaveValue('2');
  });

  test('user should be able to check the first checkbox', async ({ page }) => {
    await page.goto('/checkboxes');

    const checkboxes = page.locator('#checkboxes input[type="checkbox"]');
    const firstCheckbox = checkboxes.nth(0);

    // Correct action contract: Use `check()` for checkboxes.
    await firstCheckbox.check();

    await expect(firstCheckbox).toBeChecked();
  });
});
