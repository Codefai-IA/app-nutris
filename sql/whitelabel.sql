-- ============================================
-- WHITELABEL SETTINGS TABLE
-- Execute este SQL no Supabase SQL Editor
-- ============================================

-- Tabela de configuracoes do app (whitelabel)
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identidade do App
  app_name VARCHAR(100) DEFAULT 'Michael Cezar Nutricionista',
  app_short_name VARCHAR(20) DEFAULT 'MC Nutri',
  app_description TEXT DEFAULT 'App de acompanhamento nutricional e treinos',

  -- Cores Primarias
  color_primary VARCHAR(7) DEFAULT '#1c4c9b',
  color_primary_hover VARCHAR(7) DEFAULT '#153a75',
  color_primary_light VARCHAR(30) DEFAULT 'rgba(28, 76, 155, 0.1)',

  -- Cores Secundarias
  color_secondary VARCHAR(7) DEFAULT '#263066',

  -- Cores de Destaque (Accent)
  color_accent VARCHAR(7) DEFAULT '#f3985b',
  color_accent_hover VARCHAR(7) DEFAULT '#e07d3a',
  color_accent_light VARCHAR(30) DEFAULT 'rgba(243, 152, 91, 0.1)',

  -- Cores de Texto
  color_text_primary VARCHAR(7) DEFAULT '#080d15',
  color_text_secondary VARCHAR(7) DEFAULT '#4a5568',

  -- Cores de Fundo
  color_bg_main VARCHAR(7) DEFAULT '#f5f7fa',
  color_bg_card VARCHAR(7) DEFAULT '#ffffff',

  -- URLs dos Logos (Supabase Storage)
  logo_main_url TEXT DEFAULT NULL,
  logo_icon_url TEXT DEFAULT NULL,
  favicon_url TEXT DEFAULT NULL,

  -- PWA
  pwa_theme_color VARCHAR(7) DEFAULT '#1c4c9b',
  pwa_background_color VARCHAR(7) DEFAULT '#f5f7fa',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Inserir configuracao padrao (apenas se a tabela estiver vazia)
INSERT INTO app_settings (id)
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM app_settings LIMIT 1);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_app_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS app_settings_updated_at ON app_settings;
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_updated_at();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Qualquer um pode ler (para carregar o tema)
DROP POLICY IF EXISTS "Anyone can read app_settings" ON app_settings;
CREATE POLICY "Anyone can read app_settings"
  ON app_settings FOR SELECT
  USING (true);

-- Apenas admins podem atualizar
DROP POLICY IF EXISTS "Admins can update app_settings" ON app_settings;
CREATE POLICY "Admins can update app_settings"
  ON app_settings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================
-- STORAGE BUCKET PARA BRANDING
-- ============================================

-- Criar bucket para assets de branding (logos, favicon)
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir leitura publica
DROP POLICY IF EXISTS "Public read access for branding" ON storage.objects;
CREATE POLICY "Public read access for branding"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'branding');

-- Apenas admins podem fazer upload/delete
DROP POLICY IF EXISTS "Admins can upload branding assets" ON storage.objects;
CREATE POLICY "Admins can upload branding assets"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update branding assets" ON storage.objects;
CREATE POLICY "Admins can update branding assets"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete branding assets" ON storage.objects;
CREATE POLICY "Admins can delete branding assets"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'branding'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
