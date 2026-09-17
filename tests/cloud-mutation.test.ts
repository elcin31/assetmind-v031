import { expect, it } from 'vitest';
import { cloudErrorMessage, requireCloudRow } from '../src/storage/cloudMutation';

it('does not treat a zero-row cloud mutation as success', () => {
  expect(() => requireCloudRow(
    { data: null, error: null },
    'Cloud sync failed',
    'Canonical row was not found.',
  )).toThrow('Canonical row was not found.');
});

it('returns the canonical mutation row when Supabase confirms it', () => {
  const row = { transaction_id: 'tx-1' };
  expect(requireCloudRow(
    { data: row, error: null },
    'Cloud sync failed',
    'Canonical row was not found.',
  )).toBe(row);
});

it('maps database oversell rejection to a non-technical portfolio error', () => {
  expect(cloudErrorMessage({
    code: '23514',
    message: 'SELL quantity exceeds available AAPL position at the requested execution time.',
  }, 'Cloud portfolio sync failed')).toContain('historical holdings negative');
});

it('preserves unexpected provider details behind the operation prefix', () => {
  expect(cloudErrorMessage(
    { code: '42501', message: 'permission denied' },
    'Capital data sync failed',
  )).toBe('Capital data sync failed: permission denied');
});
