
-- =========== roles ===========
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- admins can manage all role rows
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- =========== credit ledger ===========
CREATE TABLE public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  balance_after INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users view own ledger" ON public.credit_ledger
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX credit_ledger_user_idx ON public.credit_ledger(user_id, created_at DESC);

-- =========== consume credits (any authed user) ===========
CREATE OR REPLACE FUNCTION public.consume_credits(
  _amount INTEGER,
  _reason TEXT,
  _ref_type TEXT DEFAULT NULL,
  _ref_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
  _new INTEGER;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  UPDATE public.profiles
     SET credits = credits - _amount,
         updated_at = now()
   WHERE id = _uid AND credits >= _amount
   RETURNING credits INTO _new;

  IF _new IS NULL THEN
    RAISE EXCEPTION 'insufficient credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
  VALUES (_uid, -_amount, _reason, _ref_type, _ref_id, _new);

  RETURN _new;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_credits(INTEGER, TEXT, TEXT, TEXT) TO authenticated;

-- =========== admin confirm order ===========
CREATE OR REPLACE FUNCTION public.admin_confirm_credit_order(
  _order_id UUID,
  _tx_hash TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS public.credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.credit_orders;
  _new_balance INTEGER;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _order FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF _order.status = 'confirmed' THEN
    RAISE EXCEPTION 'order already confirmed';
  END IF;

  UPDATE public.profiles
     SET credits = credits + _order.credits,
         updated_at = now()
   WHERE id = _order.user_id
   RETURNING credits INTO _new_balance;

  INSERT INTO public.credit_ledger (user_id, delta, reason, ref_type, ref_id, balance_after)
  VALUES (_order.user_id, _order.credits, 'order_confirmed', 'credit_order', _order.id::text, _new_balance);

  UPDATE public.credit_orders
     SET status = 'confirmed',
         tx_hash = COALESCE(_tx_hash, tx_hash),
         note = COALESCE(_note, note),
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO _order;

  RETURN _order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_confirm_credit_order(UUID, TEXT, TEXT) TO authenticated;

-- admin sees and manages all orders
CREATE POLICY "admins view all orders" ON public.credit_orders
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins update all orders" ON public.credit_orders
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_orders;
ALTER TABLE public.credit_orders REPLICA IDENTITY FULL;
