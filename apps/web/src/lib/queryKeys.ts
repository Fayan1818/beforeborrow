/**
 * TanStack Query key factory.
 * Keys are prefixed with the current user ID so cached data is never shared
 * across accounts after a logout/login cycle.
 *
 * Owner: A
 */
export const queryKeys = {
  me: () => ['me'] as const,

  profile: (userId: string) => [userId, 'profile'] as const,

  cashflowRules: (userId: string) => [userId, 'cashflow-rules'] as const,

  obligations: (userId: string) => [userId, 'obligations'] as const,

  calendar: (userId: string, from: string, to: string) =>
    [userId, 'calendar', from, to] as const,

  scenarios: (userId: string) => [userId, 'scenarios'] as const,
  scenario: (userId: string, id: string) => [userId, 'scenarios', id] as const,

  analysis: (userId: string, id: string) => [userId, 'analyses', id] as const,

  receipts: (userId: string) => [userId, 'receipts'] as const,
  receipt: (userId: string, id: string) => [userId, 'receipts', id] as const,

  alerts: (userId: string) => [userId, 'alerts'] as const,
}
