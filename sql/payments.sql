-- ===========================================
-- PAYMENT SYSTEM: Multi-Gateway Integration
-- Run this in Supabase Dashboard > SQL Editor
-- ===========================================

-- ===========================================
-- 1. PAYMENT_SETTINGS - Gateway configuration per admin
-- ===========================================

CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,

  -- Active gateway selection
  active_gateway VARCHAR(20) DEFAULT 'none',  -- none, mercado_pago, asaas, pagseguro, pagarme

  -- Mercado Pago credentials
  mp_access_token TEXT,
  mp_public_key TEXT,

  -- Asaas credentials
  asaas_api_key TEXT,
  asaas_environment VARCHAR(10) DEFAULT 'sandbox',  -- sandbox, production

  -- PagSeguro credentials
  ps_email TEXT,
  ps_token TEXT,

  -- Pagar.me credentials
  pm_api_key TEXT,
  pm_encryption_key TEXT,

  -- Payment methods enabled
  pix_enabled BOOLEAN DEFAULT true,
  boleto_enabled BOOLEAN DEFAULT true,
  credit_card_enabled BOOLEAN DEFAULT true,

  -- Public checkout configuration
  checkout_slug VARCHAR(50) UNIQUE,
  checkout_title TEXT DEFAULT 'Plano de Acompanhamento',
  checkout_description TEXT,
  checkout_success_message TEXT DEFAULT 'Pagamento realizado com sucesso! Você receberá um email com suas credenciais de acesso.',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast slug lookup
CREATE INDEX IF NOT EXISTS idx_payment_settings_slug ON payment_settings(checkout_slug);

-- ===========================================
-- 2. SUBSCRIPTION_PLANS - Prices defined by admin
-- ===========================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,
  description TEXT,
  duration_days INTEGER NOT NULL DEFAULT 30,
  price_cents INTEGER NOT NULL,

  -- Plan features (array of strings)
  features JSONB DEFAULT '[]',

  -- Display settings
  is_active BOOLEAN DEFAULT true,
  is_featured BOOLEAN DEFAULT false,  -- Highlight this plan
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast plan lookup by owner
CREATE INDEX IF NOT EXISTS idx_subscription_plans_owner ON subscription_plans(owner_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON subscription_plans(owner_id, is_active);

-- ===========================================
-- 3. PAYMENTS - Transaction history
-- ===========================================

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES profiles(id),
  client_id UUID REFERENCES profiles(id),  -- NULL until user is created
  plan_id UUID REFERENCES subscription_plans(id),

  -- Gateway info
  gateway VARCHAR(20) NOT NULL,  -- mercado_pago, asaas, pagseguro, pagarme
  gateway_payment_id VARCHAR(255),  -- External payment ID

  -- Payment details
  amount_cents INTEGER NOT NULL,
  payment_method VARCHAR(20),  -- pix, boleto, credit_card
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, expired, refunded

  -- Customer info (captured at checkout)
  customer_email VARCHAR(255) NOT NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20),
  customer_cpf VARCHAR(14),

  -- PIX specific fields
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  pix_expiration TIMESTAMPTZ,

  -- Boleto specific fields
  boleto_url TEXT,
  boleto_barcode TEXT,
  boleto_expiration DATE,

  -- Credit card specific
  card_last_digits VARCHAR(4),
  card_brand VARCHAR(20),
  installments INTEGER DEFAULT 1,

  -- Tracking
  paid_at TIMESTAMPTZ,
  webhook_data JSONB,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_payments_owner ON payments(owner_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_id ON payments(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at DESC);

-- ===========================================
-- 4. ENABLE ROW LEVEL SECURITY
-- ===========================================

ALTER TABLE payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- 5. RLS POLICIES - payment_settings
-- ===========================================

-- Admin can manage their own settings
CREATE POLICY "Admin manages own payment settings" ON payment_settings
FOR ALL USING (
  auth.uid() = owner_id AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Public can read settings by slug (for checkout page)
CREATE POLICY "Public read settings by slug" ON payment_settings
FOR SELECT USING (
  checkout_slug IS NOT NULL
);

-- ===========================================
-- 6. RLS POLICIES - subscription_plans
-- ===========================================

-- Admin can manage their own plans
CREATE POLICY "Admin manages own plans" ON subscription_plans
FOR ALL USING (
  auth.uid() = owner_id AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Public can read active plans (for checkout page)
CREATE POLICY "Public read active plans" ON subscription_plans
FOR SELECT USING (
  is_active = true
);

-- ===========================================
-- 7. RLS POLICIES - payments
-- ===========================================

-- Admin can see all payments they own
CREATE POLICY "Admin manages own payments" ON payments
FOR ALL USING (
  auth.uid() = owner_id AND
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- Client can see their own payments
CREATE POLICY "Client reads own payments" ON payments
FOR SELECT USING (
  auth.uid() = client_id
);

-- Service role can insert payments (for Edge Functions)
-- Note: Edge Functions use service_role key which bypasses RLS

-- ===========================================
-- 8. UPDATE TRIGGERS
-- ===========================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for payment_settings
DROP TRIGGER IF EXISTS update_payment_settings_updated_at ON payment_settings;
CREATE TRIGGER update_payment_settings_updated_at
  BEFORE UPDATE ON payment_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for subscription_plans
DROP TRIGGER IF EXISTS update_subscription_plans_updated_at ON subscription_plans;
CREATE TRIGGER update_subscription_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for payments
DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ===========================================
-- 9. HELPER FUNCTIONS
-- ===========================================

-- Function to get checkout settings by slug
CREATE OR REPLACE FUNCTION get_checkout_by_slug(slug TEXT)
RETURNS TABLE (
  owner_id UUID,
  checkout_title TEXT,
  checkout_description TEXT,
  checkout_success_message TEXT,
  active_gateway VARCHAR(20),
  pix_enabled BOOLEAN,
  boleto_enabled BOOLEAN,
  credit_card_enabled BOOLEAN,
  mp_public_key TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ps.owner_id,
    ps.checkout_title,
    ps.checkout_description,
    ps.checkout_success_message,
    ps.active_gateway,
    ps.pix_enabled,
    ps.boleto_enabled,
    ps.credit_card_enabled,
    ps.mp_public_key
  FROM payment_settings ps
  WHERE ps.checkout_slug = slug
  AND ps.active_gateway != 'none';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active plans for a checkout
CREATE OR REPLACE FUNCTION get_checkout_plans(p_owner_id UUID)
RETURNS TABLE (
  id UUID,
  name VARCHAR(100),
  description TEXT,
  duration_days INTEGER,
  price_cents INTEGER,
  features JSONB,
  is_featured BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sp.id,
    sp.name,
    sp.description,
    sp.duration_days,
    sp.price_cents,
    sp.features,
    sp.is_featured
  FROM subscription_plans sp
  WHERE sp.owner_id = p_owner_id
  AND sp.is_active = true
  ORDER BY sp.display_order ASC, sp.price_cents ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ===========================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ===========================================

COMMENT ON TABLE payment_settings IS 'Gateway configuration and checkout settings per admin';
COMMENT ON TABLE subscription_plans IS 'Subscription plans with pricing defined by admin';
COMMENT ON TABLE payments IS 'Transaction history for all payment attempts';

COMMENT ON COLUMN payment_settings.active_gateway IS 'none, mercado_pago, asaas, pagseguro, pagarme';
COMMENT ON COLUMN payment_settings.checkout_slug IS 'URL-friendly identifier for public checkout page';
COMMENT ON COLUMN payments.status IS 'pending, approved, rejected, expired, refunded';
COMMENT ON COLUMN payments.payment_method IS 'pix, boleto, credit_card';
