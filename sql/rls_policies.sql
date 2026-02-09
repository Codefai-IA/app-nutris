-- ===========================================
-- SECURITY FIX: Enable Row Level Security
-- Run this in Supabase Dashboard > SQL Editor
-- Project: ixqrdmitrbxcbvaejagj
-- ===========================================

-- ===========================================
-- ENABLE RLS ON ALL USER DATA TABLES
-- ===========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE anamnesis ENABLE ROW LEVEL SECURITY;
ALTER TABLE diet_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_substitutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE weight_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_meals ENABLE ROW LEVEL SECURITY;
ALTER TABLE extra_meal_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_guidelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabela_taco ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_metadata ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- PROFILES - User can see own, Admin sees all
-- ===========================================

CREATE POLICY "Users read own profile" ON profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins full access profiles" ON profiles
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ===========================================
-- CLIENT DATA (client_id based tables)
-- ===========================================

-- ANAMNESIS
CREATE POLICY "Users read own anamnesis" ON anamnesis
FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Admins manage anamnesis" ON anamnesis
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- DIET_PLANS
CREATE POLICY "Users read own diet plans" ON diet_plans
FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Admins manage diet plans" ON diet_plans
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- MEALS (via diet_plans)
CREATE POLICY "Users read own meals" ON meals
FOR SELECT USING (
  EXISTS (SELECT 1 FROM diet_plans WHERE id = meals.diet_plan_id AND client_id = auth.uid())
);

CREATE POLICY "Admins manage meals" ON meals
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- MEAL_FOODS
CREATE POLICY "Users read own meal foods" ON meal_foods
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM meals
    JOIN diet_plans ON diet_plans.id = meals.diet_plan_id
    WHERE meals.id = meal_foods.meal_id AND diet_plans.client_id = auth.uid()
  )
);

CREATE POLICY "Admins manage meal foods" ON meal_foods
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- FOOD_SUBSTITUTIONS
CREATE POLICY "Users read own substitutions" ON food_substitutions
FOR SELECT USING (
  EXISTS (SELECT 1 FROM diet_plans WHERE id = food_substitutions.diet_plan_id AND client_id = auth.uid())
);

CREATE POLICY "Admins manage substitutions" ON food_substitutions
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- WORKOUT_PLANS
CREATE POLICY "Users read own workouts" ON workout_plans
FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Admins manage workouts" ON workout_plans
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- DAILY_WORKOUTS
CREATE POLICY "Users read own daily workouts" ON daily_workouts
FOR SELECT USING (
  EXISTS (SELECT 1 FROM workout_plans WHERE id = daily_workouts.workout_plan_id AND client_id = auth.uid())
);

CREATE POLICY "Admins manage daily workouts" ON daily_workouts
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- EXERCISES
CREATE POLICY "Users read own exercises" ON exercises
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM daily_workouts
    JOIN workout_plans ON workout_plans.id = daily_workouts.workout_plan_id
    WHERE daily_workouts.id = exercises.daily_workout_id AND workout_plans.client_id = auth.uid()
  )
);

CREATE POLICY "Admins manage exercises" ON exercises
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- DAILY_PROGRESS
CREATE POLICY "Users manage own progress" ON daily_progress
FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "Admins manage progress" ON daily_progress
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- WEIGHT_HISTORY
CREATE POLICY "Users manage own weight" ON weight_history
FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "Admins manage weight" ON weight_history
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- EXTRA_MEALS
CREATE POLICY "Users manage own extra meals" ON extra_meals
FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "Admins manage extra meals" ON extra_meals
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- EXTRA_MEAL_FOODS
CREATE POLICY "Users manage own extra meal foods" ON extra_meal_foods
FOR ALL USING (
  EXISTS (SELECT 1 FROM extra_meals WHERE id = extra_meal_foods.extra_meal_id AND client_id = auth.uid())
);

CREATE POLICY "Admins manage extra meal foods" ON extra_meal_foods
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- EXERCISE_LOGS
CREATE POLICY "Users manage own logs" ON exercise_logs
FOR ALL USING (auth.uid() = client_id);

CREATE POLICY "Admins manage logs" ON exercise_logs
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- PATIENT_GUIDELINES
CREATE POLICY "Users read own guidelines" ON patient_guidelines
FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "Admins manage guidelines" ON patient_guidelines
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ===========================================
-- PUBLIC READ TABLES (nutrition/exercise data)
-- ===========================================

CREATE POLICY "Anyone can read tabela_taco" ON tabela_taco
FOR SELECT USING (true);

CREATE POLICY "Admins manage tabela_taco" ON tabela_taco
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Anyone can read food_metadata" ON food_metadata
FOR SELECT USING (true);

CREATE POLICY "Admins manage food_metadata" ON food_metadata
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE POLICY "Anyone can read exercise_library" ON exercise_library
FOR SELECT USING (true);

CREATE POLICY "Admins manage exercise_library" ON exercise_library
FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
