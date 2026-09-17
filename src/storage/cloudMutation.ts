export interface CloudErrorLike {
  code?: string;
  message?: string;
}

export function cloudErrorMessage(
  error: CloudErrorLike | null | undefined,
  prefix: string,
): string {
  if (
    error?.code === '23514' &&
    error.message?.includes('SELL quantity exceeds available')
  ) {
    return 'The transaction was rejected because it would make historical holdings negative. Refresh the portfolio and review the earlier BUY/SELL operations.';
  }
  return error?.message ? `${prefix}: ${error.message}` : `${prefix}.`;
}

/**
 * PostgREST UPDATE/DELETE can succeed with zero matching rows. For financial
 * mutations that is not success: accepting it would let the local cache claim a
 * write that never became canonical in Supabase.
 */
export function requireCloudRow<T>(
  result: { data: T | null; error: CloudErrorLike | null },
  prefix: string,
  notFoundMessage: string,
): T {
  if (result.error) throw new Error(cloudErrorMessage(result.error, prefix));
  if (result.data === null) throw new Error(notFoundMessage);
  return result.data;
}
