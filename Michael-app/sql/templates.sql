-- =============================================
-- TEMPLATES DE DIETA
-- =============================================

-- Tabela principal de templates de dieta
CREATE TABLE IF NOT EXISTS diet_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  daily_calories INTEGER,
  protein_g INTEGER,
  carbs_g INTEGER,
  fat_g INTEGER,
  water_goal_liters NUMERIC(3,1) DEFAULT 2.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Refeicoes do template de dieta
CREATE TABLE IF NOT EXISTS diet_template_meals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES diet_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  suggested_time TIME,
  order_index INTEGER DEFAULT 0
);

-- Alimentos das refeicoes do template
CREATE TABLE IF NOT EXISTS diet_template_meal_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_meal_id UUID NOT NULL REFERENCES diet_template_meals(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  quantity TEXT NOT NULL,
  order_index INTEGER DEFAULT 0,
  unit_type TEXT DEFAULT 'gramas',
  quantity_units NUMERIC(10,2)
);

-- Adicionar colunas de unidade (para tabelas existentes)
ALTER TABLE diet_template_meal_foods
ADD COLUMN IF NOT EXISTS unit_type TEXT DEFAULT 'gramas';

ALTER TABLE diet_template_meal_foods
ADD COLUMN IF NOT EXISTS quantity_units NUMERIC(10,2);

-- =============================================
-- TEMPLATES DE TREINO
-- =============================================

-- Tabela principal de templates de treino
CREATE TABLE IF NOT EXISTS workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Dias do template de treino
CREATE TABLE IF NOT EXISTS workout_template_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  workout_type TEXT
);

-- Exercicios dos dias do template
CREATE TABLE IF NOT EXISTS workout_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_day_id UUID NOT NULL REFERENCES workout_template_days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sets INTEGER DEFAULT 3,
  reps TEXT DEFAULT '10-12',
  rest TEXT,
  weight_kg NUMERIC(5,2),
  video_url TEXT,
  notes TEXT,
  order_index INTEGER DEFAULT 0,
  technique_id TEXT,
  effort_parameter_id TEXT
);

-- =============================================
-- INDICES PARA PERFORMANCE
-- =============================================

CREATE INDEX IF NOT EXISTS idx_diet_template_meals_template_id ON diet_template_meals(template_id);
CREATE INDEX IF NOT EXISTS idx_diet_template_meal_foods_meal_id ON diet_template_meal_foods(template_meal_id);
CREATE INDEX IF NOT EXISTS idx_workout_template_days_template_id ON workout_template_days(template_id);
CREATE INDEX IF NOT EXISTS idx_workout_template_exercises_day_id ON workout_template_exercises(template_day_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

-- Habilitar RLS nas tabelas de templates
ALTER TABLE diet_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_template_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_template_meal_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_template_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_template_exercises ENABLE ROW LEVEL SECURITY;

-- Politicas para diet_templates (apenas admins podem gerenciar)
CREATE POLICY "Admins can manage diet templates" ON diet_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Politicas para diet_template_meals
CREATE POLICY "Admins can manage diet template meals" ON diet_template_meals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Politicas para diet_template_meal_foods
CREATE POLICY "Admins can manage diet template meal foods" ON diet_template_meal_foods
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Politicas para workout_templates
CREATE POLICY "Admins can manage workout templates" ON workout_templates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Politicas para workout_template_days
CREATE POLICY "Admins can manage workout template days" ON workout_template_days
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Politicas para workout_template_exercises
CREATE POLICY "Admins can manage workout template exercises" ON workout_template_exercises
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =============================================
-- FUNCAO PARA ATUALIZAR TIMESTAMP
-- =============================================

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para diet_templates
DROP TRIGGER IF EXISTS update_diet_templates_updated_at ON diet_templates;
CREATE TRIGGER update_diet_templates_updated_at
  BEFORE UPDATE ON diet_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

-- Triggers para workout_templates
DROP TRIGGER IF EXISTS update_workout_templates_updated_at ON workout_templates;
CREATE TRIGGER update_workout_templates_updated_at
  BEFORE UPDATE ON workout_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_template_updated_at();

-- =============================================
-- SUBSTITUICOES DE ALIMENTOS NOS TEMPLATES
-- =============================================

-- Tabela de substituicoes de alimentos nos templates
CREATE TABLE IF NOT EXISTS diet_template_food_substitutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_food_id UUID NOT NULL REFERENCES diet_template_meal_foods(id) ON DELETE CASCADE,
  substitute_food TEXT NOT NULL,
  substitute_quantity TEXT NOT NULL
);

-- Indice para performance
CREATE INDEX IF NOT EXISTS idx_template_food_subs_food_id
  ON diet_template_food_substitutions(template_food_id);

-- Habilitar RLS
ALTER TABLE diet_template_food_substitutions ENABLE ROW LEVEL SECURITY;

-- Politica para admins
CREATE POLICY "Admins can manage template food substitutions"
  ON diet_template_food_substitutions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- =============================================
-- EQUIVALENCIAS DE ALIMENTOS
-- =============================================

-- Grupos de equivalencia (ex: Carboidratos, Proteinas)
CREATE TABLE IF NOT EXISTS food_equivalence_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alimentos dentro de cada grupo com suas quantidades equivalentes
CREATE TABLE IF NOT EXISTS food_equivalences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES food_equivalence_groups(id) ON DELETE CASCADE,
  food_name TEXT NOT NULL,
  quantity_grams INTEGER NOT NULL,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_food_equivalences_group ON food_equivalences(group_id);
CREATE INDEX IF NOT EXISTS idx_food_equivalences_name ON food_equivalences(food_name);

-- Habilitar RLS
ALTER TABLE food_equivalence_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_equivalences ENABLE ROW LEVEL SECURITY;

-- Politicas - Todos podem ler (clientes e admins)
CREATE POLICY "Everyone can read food equivalence groups"
  ON food_equivalence_groups FOR SELECT
  USING (true);

CREATE POLICY "Everyone can read food equivalences"
  ON food_equivalences FOR SELECT
  USING (true);

-- Apenas admins podem modificar
CREATE POLICY "Admins can manage food equivalence groups"
  ON food_equivalence_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can manage food equivalences"
  ON food_equivalences FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );
