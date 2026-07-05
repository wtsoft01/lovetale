ALTER TYPE public.credit_order_status ADD VALUE IF NOT EXISTS 'refunded';

ALTER TABLE public.credit_orders
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES auth.users(id);

ALTER TABLE public.credit_ledger
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS credit_ledger_ref_idx
  ON public.credit_ledger(ref_type, ref_id);

CREATE OR REPLACE FUNCTION public.admin_adjust_user_credits(
  _user_id UUID,
  _delta INTEGER,
  _reason TEXT,
  _note TEXT DEFAULT NULL,
  _ref_type TEXT DEFAULT 'admin_manual',
  _ref_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id UUID := auth.uid();
  _new_balance INTEGER;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'missing user id';
  END IF;
  IF _delta IS NULL OR _delta = 0 THEN
    RAISE EXCEPTION 'invalid amount';
  END IF;

  UPDATE public.profiles
     SET credits = credits + _delta,
         updated_at = now()
   WHERE id = _user_id
     AND credits + _delta >= 0
   RETURNING credits INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient credits' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger
    (user_id, delta, reason, ref_type, ref_id, balance_after, note, created_by)
  VALUES
    (_user_id, _delta, COALESCE(NULLIF(_reason, ''), 'admin_adjustment'), _ref_type, _ref_id, _new_balance, _note, _admin_id);

  RETURN _new_balance;
END;
$$;

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
  _admin_id UUID := auth.uid();
  _order public.credit_orders;
  _new_balance INTEGER;
  _months INTEGER := 1;
  _note_json JSONB;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _order FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF _order.status = 'confirmed' THEN
    RETURN _order;
  END IF;
  IF _order.status = 'failed' OR _order.status = 'refunded' THEN
    RAISE EXCEPTION 'order cannot be confirmed from current status';
  END IF;

  UPDATE public.profiles
     SET credits = credits + _order.credits,
         updated_at = now()
   WHERE id = _order.user_id
   RETURNING credits INTO _new_balance;

  INSERT INTO public.credit_ledger
    (user_id, delta, reason, ref_type, ref_id, balance_after, note, created_by)
  VALUES
    (_order.user_id, _order.credits, 'order_confirmed', 'credit_order', _order.id::text, _new_balance, _note, _admin_id);

  IF _order.package_id LIKE 'sub_%' THEN
    BEGIN
      _note_json := _order.note::jsonb;
      _months := GREATEST(1, COALESCE((_note_json->>'months')::integer, 1));
    EXCEPTION WHEN others THEN
      _months := 1;
    END;

    UPDATE public.profiles
       SET is_subscribed = true,
           subscription_expires_at =
             GREATEST(COALESCE(subscription_expires_at, now()), now()) + make_interval(months => _months),
           updated_at = now()
     WHERE id = _order.user_id;
  END IF;

  UPDATE public.credit_orders
     SET status = 'confirmed',
         tx_hash = COALESCE(NULLIF(_tx_hash, ''), tx_hash),
         note = COALESCE(_note, note),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, _admin_id),
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO _order;

  RETURN _order;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_refund_credit_order(
  _order_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS public.credit_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id UUID := auth.uid();
  _order public.credit_orders;
  _new_balance INTEGER;
BEGIN
  IF NOT public.has_role(_admin_id, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _order FROM public.credit_orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'order not found';
  END IF;
  IF _order.status = 'refunded' THEN
    RETURN _order;
  END IF;
  IF _order.status <> 'confirmed' THEN
    RAISE EXCEPTION 'only confirmed orders can be refunded';
  END IF;

  UPDATE public.profiles
     SET credits = credits - _order.credits,
         updated_at = now()
   WHERE id = _order.user_id
     AND credits >= _order.credits
   RETURNING credits INTO _new_balance;

  IF _new_balance IS NULL THEN
    RAISE EXCEPTION 'insufficient credits for refund reversal' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger
    (user_id, delta, reason, ref_type, ref_id, balance_after, note, created_by)
  VALUES
    (_order.user_id, -_order.credits, 'order_refunded', 'credit_order', _order.id::text, _new_balance, _reason, _admin_id);

  UPDATE public.credit_orders
     SET status = 'refunded',
         refunded_at = now(),
         refund_reason = _reason,
         updated_at = now()
   WHERE id = _order_id
   RETURNING * INTO _order;

  RETURN _order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_user_credits(UUID, INTEGER, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_confirm_credit_order(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_refund_credit_order(UUID, TEXT) TO authenticated, service_role;
