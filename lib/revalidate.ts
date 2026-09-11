/**
 * The ISR window used by every authenticated Riot fetch, so an inner cache
 * entry can never outlive the generated page that created it. When the page
 * goes stale and regenerates, its Riot data is stale too and is genuinely
 * refetched.
 *
 * Next only accepts a literal for a route segment's `revalidate`, so
 * app/page.tsx hardcodes the same number. Change both together.
 */
export const REVALIDATE_SECONDS = 600;
