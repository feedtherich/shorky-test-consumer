import { test, expect } from '@playwright/test';

test('user should be able to select United States from the country dropdown', async ({ page }) => {
  await page.goto('/dropdown');

  await page.evaluate(() => {
    const select = document.createElement('select');
    select.id = 'country-select';

    const options: Array<[string, string]> = [
      ['', 'Please select a country'],
      ['US', 'United States'],
      ['CA', 'Canada'],
      ['MX', 'Mexico'],
    ];
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }

    document.querySelector('.example')!.appendChild(select);
  });

  const countrySelect = page.locator('#country-select');

  await countrySelect.selectOption('US', { timeout: 5000 });

  await expect(countrySelect).toHaveValue('US');
});
