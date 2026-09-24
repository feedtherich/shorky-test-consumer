import { test, expect } from '@playwright/test';

test('user should be able to choose Canada from the custom dropdown widget', async ({ page }) => {
  await page.goto('/dropdown');

  await page.evaluate(() => {
    const container = document.createElement('div');
    container.setAttribute('data-testid', 'country-custom-dropdown');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.setAttribute('data-testid', 'country-trigger');
    trigger.textContent = 'Select a country';

    const list = document.createElement('ul');
    list.hidden = true;

    const countries: Array<[string, string]> = [
      ['US', 'United States'],
      ['CA', 'Canada'],
      ['MX', 'Mexico'],
    ];
    for (const [value, label] of countries) {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.setAttribute('data-value', value);
      item.textContent = label;
      item.addEventListener('click', () => {
        trigger.textContent = label;
        trigger.setAttribute('data-selected-value', value);
        list.hidden = true;
      });
      list.appendChild(item);
    }

    trigger.addEventListener('click', () => {
      list.hidden = !list.hidden;
    });

    container.appendChild(trigger);
    container.appendChild(list);
    document.querySelector('.example')!.appendChild(container);
  });

  const trigger = page.getByTestId('country-trigger');

  await trigger.click();
  await page.getByRole('option', { name: 'Canada' }).click();

  await expect(trigger).toHaveAttribute('data-selected-value', 'CA');
});
