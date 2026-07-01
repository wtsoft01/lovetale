// Heat-tier unlock prices in credits. Subscribers bypass payment.
// Shared between client (paywall UI) and server (consume_credits call).
export const TIER_COST: Record<string, number> = {
  soft: 0,
  warm: 0,
  spicy: 3,
  steamy: 8,
};
