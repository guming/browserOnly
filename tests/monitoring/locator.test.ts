import { buildStableLocatorFromElement } from '../../src/workflows/locator';
import { toElementSelection } from '../../src/monitoring/elementPicker';

describe('monitor locator selection', () => {
  test('orders semantic candidates before CSS', () => {
    expect(buildStableLocatorFromElement({ role: 'status', accessibleName: 'Price', label: 'Price', testId: 'price', id: 'current-price', text: '$10' })).toEqual({
      role: 'status', accessibleName: 'Price', label: 'Price', testId: 'price', text: '$10', css: '#current-price',
      fallbackOrder: ['role', 'label', 'testId', 'text', 'css'],
    });
  });

  test('rejects prohibited fields', () => {
    expect(() => toElementSelection({ sample: '', tagName: 'input', css: 'input', prohibited: true })).toThrow(/cannot be monitored/);
  });
});
