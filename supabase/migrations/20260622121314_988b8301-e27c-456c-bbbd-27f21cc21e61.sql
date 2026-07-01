
CREATE TYPE public.credit_order_status AS ENUM ('pending', 'submitted', 'confirmed', 'failed');

CREATE TABLE public.credit_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL,
  credits INTEGER NOT NULL,
  amount_usd NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL,
  network TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  tx_hash TEXT,
  status public.credit_order_status NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.credit_orders TO authenticated;
GRANT ALL ON public.credit_orders TO service_role;

ALTER TABLE public.credit_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own orders" ON public.credit_orders
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users create own orders" ON public.credit_orders
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users update own pending orders" ON public.credit_orders
  FOR UPDATE TO authenticated USING (auth.uid() = user_id AND status IN ('pending','submitted'))
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER credit_orders_updated_at
  BEFORE UPDATE ON public.credit_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX credit_orders_user_idx ON public.credit_orders(user_id, created_at DESC);
