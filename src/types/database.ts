export type UserRole = 'client' | 'admin';

// ============================================
// APP SETTINGS (WHITELABEL)
// ============================================

export interface AppSettings {
  id: string;

  // Identidade do App
  app_name: string;
  app_short_name: string;
  app_description: string;

  // Cores Primarias
  color_primary: string;
  color_primary_hover: string;
  color_primary_light: string;

  // Cores Secundarias
  color_secondary: string;

  // Cores de Destaque (Accent)
  color_accent: string;
  color_accent_hover: string;
  color_accent_light: string;

  // Cores de Texto
  color_text_primary: string;
  color_text_secondary: string;

  // Cores de Fundo
  color_bg_main: string;
  color_bg_card: string;

  // URLs dos Logos
  logo_main_url: string | null;
  logo_icon_url: string | null;
  favicon_url: string | null;

  // PWA
  pwa_theme_color: string;
  pwa_background_color: string;

  // Metadata
  created_at: string;
  updated_at: string;
}

export const DEFAULT_APP_SETTINGS: Omit<AppSettings, 'id' | 'created_at' | 'updated_at'> = {
  app_name: 'Michael Cezar Nutricionista',
  app_short_name: 'MC Nutri',
  app_description: 'App de acompanhamento nutricional e treinos',
  color_primary: '#1c4c9b',
  color_primary_hover: '#153a75',
  color_primary_light: 'rgba(28, 76, 155, 0.1)',
  color_secondary: '#263066',
  color_accent: '#f3985b',
  color_accent_hover: '#e07d3a',
  color_accent_light: 'rgba(243, 152, 91, 0.1)',
  color_text_primary: '#080d15',
  color_text_secondary: '#4a5568',
  color_bg_main: '#f5f7fa',
  color_bg_card: '#ffffff',
  logo_main_url: null,
  logo_icon_url: null,
  favicon_url: null,
  pwa_theme_color: '#1c4c9b',
  pwa_background_color: '#f5f7fa',
};
export type HealthRating = 'excellent' | 'good' | 'regular' | 'poor';
export type UnitType = 'gramas' | 'ml' | 'unidade' | 'fatia' | 'colher_sopa' | 'colher_cha' | 'xicara' | 'copo' | 'porcao';
export type DigestionRating = 'good' | 'poor' | 'terrible';
export type BowelFrequency = 'once_a_day' | 'every_other_day' | 'constipated' | 'more_than_once';
export type SleepQuality = 'excellent' | 'good' | 'regular' | 'poor' | 'terrible';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  height_cm: number | null;
  current_weight_kg: number | null;
  starting_weight_kg: number | null;
  goal_weight_kg: number | null;
  age: number | null;
  coaching_start_date: string | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
  goals: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  protein_goal: number | null;
  carbs_goal: number | null;
  fats_goal: number | null;
  calories_goal: number | null;
  fiber_goal: number | null;
}

export interface Anamnesis {
  id: string;
  client_id: string;
  meals_per_day: number | null;
  water_liters_per_day: number | null;
  meal_times: Record<string, string> | null;
  meals_prepared_same_day: boolean | null;
  preferred_foods: string | null;
  disliked_foods: string | null;
  supplements: string | null;
  food_allergies: string | null;
  gluten_intolerance: boolean;
  alcohol_consumption: string | null;
  current_exercise_type: string | null;
  exercise_duration: string | null;
  routine_exercises: string | null;
  weekly_routine: Record<string, string> | null;
  health_rating: HealthRating | null;
  smoker: boolean;
  cigarettes_per_day: number | null;
  digestion: DigestionRating | null;
  bowel_frequency: BowelFrequency | null;
  medications: string | null;
  bedtime: string | null;
  wakeup_time: string | null;
  sleep_quality: SleepQuality | null;
  sleep_hours: number | null;
  diseases: string | null;
  family_history: string | null;
  updated_at: string;
}

export interface DietPlan {
  id: string;
  client_id: string;
  name: string;
  display_order: number;
  daily_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_goal_liters: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Meal {
  id: string;
  diet_plan_id: string;
  name: string;
  suggested_time: string | null;
  order_index: number;
  meal_substitutions?: MealSubstitution[];
}

export interface MealFood {
  id: string;
  meal_id: string;
  food_name: string;
  quantity: string;
  quantity_units: number | null;
  unit_type: UnitType;
  order_index: number;
}

export interface FoodSubstitution {
  id: string;
  diet_plan_id: string;
  original_food: string;
  substitute_food: string;
  substitute_quantity: string;
}

export interface TemplateFoodSubstitution {
  id: string;
  template_food_id: string;
  substitute_food: string;
  substitute_quantity: string;
}

export interface MealSubstitutionItem {
  food_name: string;
  quantity: string;
  unit_type: UnitType;
  quantity_units: number | null;
}

export interface MealSubstitution {
  id: string;
  name: string;
  items: MealSubstitutionItem[];
}

export interface FoodEquivalenceGroup {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface FoodEquivalence {
  id: string;
  group_id: string;
  food_name: string;
  quantity_grams: number;
  order_index: number;
  created_at: string;
}

export interface WorkoutPlan {
  id: string;
  client_id: string;
  created_at: string;
  updated_at: string;
}

export interface DailyWorkout {
  id: string;
  workout_plan_id: string;
  day_of_week: number;
  workout_type: string | null;
}

export interface Exercise {
  id: string;
  daily_workout_id: string;
  name: string;
  sets: number | null;
  reps: string | null;
  rest: string | null;
  weight_kg: number | null;
  video_url: string | null;
  notes: string | null;
  order_index: number;
  technique_id: string | null;
  effort_parameter_id: string | null;
}

export interface ExerciseLibrary {
  id: string;
  name: string;
  video_url: string | null;
  muscle_group: string | null;
  description: string | null;
  created_at: string;
}

export interface DailyProgress {
  id: string;
  client_id: string;
  date: string;
  exercises_completed: string[];
  meals_completed: string[];
  water_consumed_ml: number;
  created_at: string;
}

export interface WeightHistory {
  id: string;
  client_id: string;
  weight_kg: number;
  recorded_at: string;
}

export interface TabelaTaco {
  id: number;
  created_at: string;
  alimento: string;
  caloria: string;
  proteina: string;
  carboidrato: string;
  gordura: string;
  fibra: string;
}

export interface FoodMetadata {
  id: string;
  taco_id: number;
  nome_simplificado: string;
  unidade_tipo: UnitType;
  peso_por_unidade: number | null;
  created_at: string;
  updated_at: string;
}

export interface TabelaTacoWithMetadata extends TabelaTaco {
  food_metadata?: FoodMetadata | null;
}

export interface ExtraMeal {
  id: string;
  client_id: string;
  date: string;
  meal_name: string;
  created_at: string;
}

export interface ExtraMealFood {
  id: string;
  extra_meal_id: string;
  food_id: number | null;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface ExtraMealWithFoods extends ExtraMeal {
  foods: ExtraMealFood[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
}

export interface ExerciseLogSet {
  set: number;
  weight: number;
  reps: number;
}

export interface ExerciseLogRecord {
  id: string;
  client_id: string;
  exercise_id: string;
  daily_workout_id: string;
  date: string;
  sets_completed: ExerciseLogSet[];
  created_at: string;
}

// ============================================
// PAYMENT SYSTEM
// ============================================

export type PaymentGateway = 'none' | 'mercado_pago' | 'asaas' | 'pagseguro' | 'pagarme';
export type PaymentMethod = 'pix' | 'boleto' | 'credit_card';
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'refunded';
export type AsaasEnvironment = 'sandbox' | 'production';

export interface PaymentSettings {
  id: string;
  owner_id: string;

  // Active gateway selection
  active_gateway: PaymentGateway;

  // Mercado Pago credentials
  mp_access_token: string | null;
  mp_public_key: string | null;

  // Asaas credentials
  asaas_api_key: string | null;
  asaas_environment: AsaasEnvironment;

  // PagSeguro credentials
  ps_email: string | null;
  ps_token: string | null;

  // Pagar.me credentials
  pm_api_key: string | null;
  pm_encryption_key: string | null;

  // Payment methods enabled
  pix_enabled: boolean;
  boleto_enabled: boolean;
  credit_card_enabled: boolean;

  // Public checkout configuration
  checkout_slug: string | null;
  checkout_title: string;
  checkout_description: string | null;
  checkout_success_message: string;

  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_cents: number;
  features: string[];
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  owner_id: string;
  client_id: string | null;
  plan_id: string | null;

  // Gateway info
  gateway: PaymentGateway;
  gateway_payment_id: string | null;

  // Payment details
  amount_cents: number;
  payment_method: PaymentMethod | null;
  status: PaymentStatus;

  // Customer info
  customer_email: string;
  customer_name: string;
  customer_phone: string | null;
  customer_cpf: string | null;

  // PIX specific
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_expiration: string | null;

  // Boleto specific
  boleto_url: string | null;
  boleto_barcode: string | null;
  boleto_expiration: string | null;

  // Credit card specific
  card_last_digits: string | null;
  card_brand: string | null;
  installments: number;

  // Tracking
  paid_at: string | null;
  webhook_data: Record<string, unknown> | null;
  error_message: string | null;

  created_at: string;
  updated_at: string;
}

// Payment with related data for display
export interface PaymentWithPlan extends Payment {
  plan?: SubscriptionPlan;
  client?: Profile;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id'>>;
      };
      anamnesis: {
        Row: Anamnesis;
        Insert: Omit<Anamnesis, 'id' | 'updated_at'>;
        Update: Partial<Omit<Anamnesis, 'id'>>;
      };
      diet_plans: {
        Row: DietPlan;
        Insert: Omit<DietPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<DietPlan, 'id'>>;
      };
      meals: {
        Row: Meal;
        Insert: Omit<Meal, 'id'>;
        Update: Partial<Omit<Meal, 'id'>>;
      };
      meal_foods: {
        Row: MealFood;
        Insert: Omit<MealFood, 'id'>;
        Update: Partial<Omit<MealFood, 'id'>>;
      };
      food_substitutions: {
        Row: FoodSubstitution;
        Insert: Omit<FoodSubstitution, 'id'>;
        Update: Partial<Omit<FoodSubstitution, 'id'>>;
      };
      workout_plans: {
        Row: WorkoutPlan;
        Insert: Omit<WorkoutPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<WorkoutPlan, 'id'>>;
      };
      daily_workouts: {
        Row: DailyWorkout;
        Insert: Omit<DailyWorkout, 'id'>;
        Update: Partial<Omit<DailyWorkout, 'id'>>;
      };
      exercises: {
        Row: Exercise;
        Insert: Omit<Exercise, 'id'>;
        Update: Partial<Omit<Exercise, 'id'>>;
      };
      exercise_library: {
        Row: ExerciseLibrary;
        Insert: Omit<ExerciseLibrary, 'id' | 'created_at'>;
        Update: Partial<Omit<ExerciseLibrary, 'id'>>;
      };
      daily_progress: {
        Row: DailyProgress;
        Insert: Omit<DailyProgress, 'id' | 'created_at'>;
        Update: Partial<Omit<DailyProgress, 'id'>>;
      };
      weight_history: {
        Row: WeightHistory;
        Insert: Omit<WeightHistory, 'id' | 'recorded_at'>;
        Update: Partial<Omit<WeightHistory, 'id'>>;
      };
      tabela_taco: {
        Row: TabelaTaco;
        Insert: Omit<TabelaTaco, 'id' | 'created_at'>;
        Update: Partial<Omit<TabelaTaco, 'id'>>;
      };
      food_metadata: {
        Row: FoodMetadata;
        Insert: Omit<FoodMetadata, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<FoodMetadata, 'id'>>;
      };
      extra_meals: {
        Row: ExtraMeal;
        Insert: Omit<ExtraMeal, 'id' | 'created_at'>;
        Update: Partial<Omit<ExtraMeal, 'id'>>;
      };
      extra_meal_foods: {
        Row: ExtraMealFood;
        Insert: Omit<ExtraMealFood, 'id'>;
        Update: Partial<Omit<ExtraMealFood, 'id'>>;
      };
      exercise_logs: {
        Row: ExerciseLogRecord;
        Insert: Omit<ExerciseLogRecord, 'id' | 'created_at'>;
        Update: Partial<Omit<ExerciseLogRecord, 'id'>>;
      };
      payment_settings: {
        Row: PaymentSettings;
        Insert: Omit<PaymentSettings, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<PaymentSettings, 'id'>>;
      };
      subscription_plans: {
        Row: SubscriptionPlan;
        Insert: Omit<SubscriptionPlan, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<SubscriptionPlan, 'id'>>;
      };
      payments: {
        Row: Payment;
        Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Payment, 'id'>>;
      };
    };
  };
}
