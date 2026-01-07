import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { Clock, ChevronRight, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePageData } from '../../hooks';
import { PageContainer, Header, BottomNav } from '../../components/layout';
import { Card, Checkbox, Button, Modal, MacroPieChart, DailyMacrosSummary, AddExtraMealModal } from '../../components/ui';
import type { ExtraMeal } from '../../components/ui';
import { parseBrazilianNumber } from '../../components/ui/FoodSelect';
import { formatFoodName } from '../../utils/formatters';
import { formatQuantityDisplay } from '../../utils/foodUnits';
import type { Meal, MealFood, FoodSubstitution, UnitType } from '../../types/database';
import styles from './Diet.module.css';

interface MealFoodWithNutrition extends MealFood {
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
}

interface MealWithNutrition extends Meal {
  foods: MealFoodWithNutrition[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
}

// Retorna a data atual no fuso horário de Brasília (UTC-3) no formato YYYY-MM-DD
function getBrasiliaDate(): string {
  const now = new Date();
  // Brasília é UTC-3
  const brasiliaOffset = -3 * 60; // -3 horas em minutos
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utc + (brasiliaOffset * 60000));
  return brasiliaTime.toISOString().split('T')[0];
}

// Retorna a data formatada para exibição no header
function getBrasiliaDisplayDate(): string {
  const now = new Date();
  const brasiliaOffset = -3 * 60;
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const brasiliaTime = new Date(utc + (brasiliaOffset * 60000));
  return brasiliaTime.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function Diet() {
  const { profile } = useAuth();
  const [meals, setMeals] = useState<MealWithNutrition[]>([]);
  const [completedMeals, setCompletedMeals] = useState<string[]>([]);
  const [selectedMeal, setSelectedMeal] = useState<MealWithNutrition | null>(null);
  const [substitutions, setSubstitutions] = useState<FoodSubstitution[]>([]);
  const [expandedFoods, setExpandedFoods] = useState<Set<string>>(new Set());
  const [_dietPlanId, setDietPlanId] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(getBrasiliaDate());
  const currentDateRef = useRef(currentDate);
  const [extraMeals, setExtraMeals] = useState<ExtraMeal[]>([]);
  const [showAddExtraMeal, setShowAddExtraMeal] = useState(false);

  console.log('[Diet] render - profile?.id:', profile?.id, 'meals.length:', meals.length);

  // Log de mount/unmount do componente
  useEffect(() => {
    console.log('[Diet] ===== COMPONENT MOUNTED =====');
    return () => {
      console.log('[Diet] ===== COMPONENT UNMOUNTED =====');
    };
  }, []);

  // Callback para buscar todos os dados
  const fetchAllData = useCallback(async () => {
    console.log('[Diet] fetchAllData called - profile?.id:', profile?.id);
    await Promise.all([fetchDiet(), fetchProgress()]);
    console.log('[Diet] fetchAllData DONE');
  }, [profile?.id]);

  // Hook que gerencia loading e refetch automático
  const { isInitialLoading: loading } = usePageData({
    userId: profile?.id,
    fetchData: fetchAllData,
  });

  // Verificar mudança de dia a cada minuto (reset automático à meia-noite)
  useEffect(() => {
    const checkDayChange = () => {
      const newDate = getBrasiliaDate();
      if (newDate !== currentDateRef.current) {
        currentDateRef.current = newDate;
        setCurrentDate(newDate);
        setCompletedMeals([]);
        setExtraMeals([]);
        fetchProgress();
      }
    };

    const interval = setInterval(checkDayChange, 60000);
    return () => clearInterval(interval);
  }, [profile?.id]);

  // Calcular macros totais planejados
  const totalPlannedMacros = useMemo(() => {
    return meals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.totalCalories,
        protein: acc.protein + meal.totalProtein,
        carbs: acc.carbs + meal.totalCarbs,
        fats: acc.fats + meal.totalFats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [meals]);

  // Calcular macros consumidos (refeições marcadas + extras)
  const consumedMacros = useMemo(() => {
    // Macros das refeições planejadas que foram marcadas
    const fromPlanned = meals
      .filter((meal) => completedMeals.includes(meal.id))
      .reduce(
        (acc, meal) => ({
          calories: acc.calories + meal.totalCalories,
          protein: acc.protein + meal.totalProtein,
          carbs: acc.carbs + meal.totalCarbs,
          fats: acc.fats + meal.totalFats,
        }),
        { calories: 0, protein: 0, carbs: 0, fats: 0 }
      );

    // Macros das refeições extras (sempre contam como consumidas)
    const fromExtras = extraMeals.reduce(
      (acc, meal) => ({
        calories: acc.calories + meal.total_calories,
        protein: acc.protein + meal.total_protein,
        carbs: acc.carbs + meal.total_carbs,
        fats: acc.fats + meal.total_fats,
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );

    return {
      calories: fromPlanned.calories + fromExtras.calories,
      protein: fromPlanned.protein + fromExtras.protein,
      carbs: fromPlanned.carbs + fromExtras.carbs,
      fats: fromPlanned.fats + fromExtras.fats,
    };
  }, [meals, completedMeals, extraMeals]);

  // Adicionar refeição extra
  const handleAddExtraMeal = (meal: ExtraMeal) => {
    setExtraMeals([...extraMeals, meal]);
  };

  // Remover refeição extra
  const handleRemoveExtraMeal = (id: string) => {
    setExtraMeals(extraMeals.filter((m) => m.id !== id));
  };

  async function fetchDiet() {
    console.log('[Diet] fetchDiet started - profile?.id:', profile?.id);
    // Query única com JOIN para buscar diet_plan + meals + meal_foods
    const { data: dietPlanData } = await supabase
      .from('diet_plans')
      .select(`
        id,
        meals (
          id,
          name,
          suggested_time,
          order_index,
          meal_foods (
            id,
            food_name,
            quantity,
            order_index
          )
        ),
        food_substitutions (
          id,
          diet_plan_id,
          original_food,
          substitute_food,
          substitute_quantity
        )
      `)
      .eq('client_id', profile!.id)
      .maybeSingle();

    console.log('[Diet] fetchDiet - supabase query returned, dietPlanData:', !!dietPlanData);

    if (!dietPlanData) {
      console.log('[Diet] fetchDiet - NO dietPlanData, returning');
      return;
    }
    setDietPlanId(dietPlanData.id);

    // Extrair todos os nomes de alimentos únicos
    const allFoodNames = new Set<string>();
    dietPlanData.meals?.forEach((meal: any) => {
      meal.meal_foods?.forEach((food: any) => {
        if (food.food_name) {
          allFoodNames.add(food.food_name);
        }
      });
    });

    // Buscar dados nutricionais de todos os alimentos de uma vez só
    let nutritionMap = new Map<string, { caloria: string; proteina: string; carboidrato: string; gordura: string }>();

    if (allFoodNames.size > 0) {
      const { data: tacoData } = await supabase
        .from('tabela_taco')
        .select('alimento, caloria, proteina, carboidrato, gordura')
        .in('alimento', Array.from(allFoodNames));

      if (tacoData) {
        tacoData.forEach((item) => {
          nutritionMap.set(item.alimento, {
            caloria: item.caloria,
            proteina: item.proteina,
            carboidrato: item.carboidrato,
            gordura: item.gordura,
          });
        });
      }
    }

    // Processar meals com dados nutricionais
    const mealsWithNutrition: MealWithNutrition[] = (dietPlanData.meals || [])
      .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
      .map((meal: any) => {
        const foodsWithNutrition: MealFoodWithNutrition[] = (meal.meal_foods || [])
          .sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0))
          .map((food: any) => {
            const nutrition = food.food_name ? nutritionMap.get(food.food_name) : null;

            if (nutrition) {
              const qty = parseBrazilianNumber(food.quantity);
              const multiplier = qty / 100;

              return {
                ...food,
                calories: parseBrazilianNumber(nutrition.caloria) * multiplier,
                protein: parseBrazilianNumber(nutrition.proteina) * multiplier,
                carbs: parseBrazilianNumber(nutrition.carboidrato) * multiplier,
                fats: parseBrazilianNumber(nutrition.gordura) * multiplier,
              };
            }
            return food;
          });

        // Calcular totais da refeição
        const totals = foodsWithNutrition.reduce(
          (acc, food) => ({
            calories: acc.calories + (food.calories || 0),
            protein: acc.protein + (food.protein || 0),
            carbs: acc.carbs + (food.carbs || 0),
            fats: acc.fats + (food.fats || 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fats: 0 }
        );

        return {
          ...meal,
          foods: foodsWithNutrition,
          totalCalories: totals.calories,
          totalProtein: totals.protein,
          totalCarbs: totals.carbs,
          totalFats: totals.fats,
        };
      });

    console.log('[Diet] fetchDiet - setting meals, count:', mealsWithNutrition.length);
    setMeals(mealsWithNutrition);
    setSubstitutions(dietPlanData.food_substitutions || []);
    console.log('[Diet] fetchDiet COMPLETE');
  }

  async function fetchProgress() {
    console.log('[Diet] fetchProgress started');
    const today = getBrasiliaDate();

    const { data } = await supabase
      .from('daily_progress')
      .select('meals_completed')
      .eq('client_id', profile!.id)
      .eq('date', today)
      .maybeSingle();

    if (data && data.meals_completed) {
      setCompletedMeals(data.meals_completed);
    } else {
      setCompletedMeals([]);
    }
    console.log('[Diet] fetchProgress COMPLETE');
  }

  async function toggleMeal(mealId: string) {
    const today = getBrasiliaDate();
    const isCompleted = completedMeals.includes(mealId);
    const newCompleted = isCompleted
      ? completedMeals.filter(id => id !== mealId)
      : [...completedMeals, mealId];

    // Atualiza estado local imediatamente
    setCompletedMeals(newCompleted);

    try {
      // Verifica se já existe registro para hoje
      const { data: existing } = await supabase
        .from('daily_progress')
        .select('id')
        .eq('client_id', profile!.id)
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        // Atualiza registro existente
        const { error } = await supabase
          .from('daily_progress')
          .update({
            meals_completed: newCompleted
          })
          .eq('id', existing.id);

        if (error) throw error;
      } else {
        // Cria novo registro para hoje
        const { error } = await supabase.from('daily_progress').insert({
          client_id: profile!.id,
          date: today,
          exercises_completed: [],
          meals_completed: newCompleted,
          water_consumed_ml: 0,
        });

        if (error) throw error;
      }
    } catch (error) {
      console.error('Erro ao salvar progresso:', error);
      // Reverte o estado local em caso de erro
      setCompletedMeals(completedMeals);
    }
  }

  function formatTime(time: string | null): string {
    if (!time) return '';
    return time.slice(0, 5);
  }

  function getSubstitutionsForFood(foodName: string): FoodSubstitution[] {
    return substitutions.filter(
      (sub) => sub.original_food.toLowerCase() === foodName.toLowerCase()
    );
  }

  function toggleFoodExpansion(foodId: string) {
    setExpandedFoods((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(foodId)) {
        newSet.delete(foodId);
      } else {
        newSet.add(foodId);
      }
      return newSet;
    });
  }

  function handleOpenMeal(meal: MealWithNutrition) {
    setSelectedMeal(meal);
    setExpandedFoods(new Set()); // Reset expanded foods when opening a new meal
  }

  function handleCloseMeal() {
    setSelectedMeal(null);
    setExpandedFoods(new Set());
  }

  // Skeleton de carregamento
  const LoadingSkeleton = () => (
    <div className={styles.skeleton}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonCheckbox} />
          <div className={styles.skeletonContent}>
            <div className={styles.skeletonTitle} />
            <div className={styles.skeletonMeta} />
          </div>
          <div className={styles.skeletonArrow} />
        </div>
      ))}
    </div>
  );

  console.log('[Diet] RENDERING - loading:', loading, 'meals.length:', meals.length);

  return (
    <PageContainer>
      <Header title="Dieta" subtitle={getBrasiliaDisplayDate()} showBack />

      <main className={styles.content}>
        {/* Barra de Macros do Dia */}
        {!loading && meals.length > 0 && (
          <DailyMacrosSummary
            totalPlanned={totalPlannedMacros}
            consumed={consumedMacros}
          />
        )}

        {loading ? (
          <LoadingSkeleton />
        ) : meals.length > 0 ? (
          <>
            {meals.map((meal) => {
              const isCompleted = completedMeals.includes(meal.id);
              return (
                <Card
                  key={meal.id}
                  hoverable
                  className={styles.mealCard}
                  onClick={() => handleOpenMeal(meal)}
                >
                  <Checkbox
                    checked={isCompleted}
                    stopPropagation
                    onChange={() => toggleMeal(meal.id)}
                  />
                  <div className={styles.mealContent}>
                    <h3 className={`${styles.mealName} ${isCompleted ? styles.completed : ''}`}>
                      {meal.name}
                    </h3>
                    <div className={styles.mealMeta}>
                      {meal.suggested_time && (
                        <span className={styles.mealTime}>
                          <Clock size={14} />
                          {formatTime(meal.suggested_time)}
                        </span>
                      )}
                      {meal.totalCalories > 0 && (
                        <span className={styles.mealCalories}>
                          {Math.round(meal.totalCalories)} kcal
                        </span>
                      )}
                    </div>
                    <p className={styles.mealHint}>Toque para ver detalhes</p>
                  </div>
                  <button className={styles.arrowButton}>
                    <ChevronRight size={20} />
                  </button>
                </Card>
              );
            })}

            {/* Refeições Extras */}
            {extraMeals.length > 0 && (
              <div className={styles.extraMealsSection}>
                <h3 className={styles.extraMealsTitle}>Refeicoes Extras</h3>
                {extraMeals.map((meal) => (
                  <Card key={meal.id} className={styles.extraMealCard}>
                    <div className={styles.extraMealContent}>
                      <h4 className={styles.extraMealName}>{meal.meal_name}</h4>
                      <div className={styles.extraMealMacros}>
                        <span className={styles.extraMealCalories}>
                          {meal.total_calories} kcal
                        </span>
                        <span>P: {meal.total_protein.toFixed(1)}g</span>
                        <span>C: {meal.total_carbs.toFixed(1)}g</span>
                        <span>G: {meal.total_fats.toFixed(1)}g</span>
                      </div>
                    </div>
                    <button
                      className={styles.removeExtraButton}
                      onClick={() => handleRemoveExtraMeal(meal.id)}
                    >
                      <Trash2 size={18} />
                    </button>
                  </Card>
                ))}
              </div>
            )}

            {/* Botão Adicionar Refeição Extra */}
            <Button
              variant="outline"
              fullWidth
              className={styles.addExtraButton}
              onClick={() => setShowAddExtraMeal(true)}
            >
              <Plus size={18} />
              Adicionar Refeicao Extra
            </Button>
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>Nenhuma dieta cadastrada</p>
          </div>
        )}
      </main>

      <Modal
        isOpen={!!selectedMeal}
        onClose={handleCloseMeal}
        title={selectedMeal?.name}
        subtitle={selectedMeal?.suggested_time ? formatTime(selectedMeal.suggested_time) : undefined}
        showCheckbox
        checked={selectedMeal ? completedMeals.includes(selectedMeal.id) : false}
      >
        <div className={styles.modalContent}>
          {/* Gráfico de Macros */}
          {selectedMeal && (selectedMeal.totalProtein > 0 || selectedMeal.totalCarbs > 0) && (
            <div className={styles.chartSection}>
              <MacroPieChart
                protein={selectedMeal.totalProtein}
                carbs={selectedMeal.totalCarbs}
                fats={selectedMeal.totalFats}
                calories={selectedMeal.totalCalories}
                size="md"
              />
            </div>
          )}

          <h4 className={styles.modalLabel}>Alimentos:</h4>
          <ul className={styles.foodList}>
            {selectedMeal?.foods.map((food) => {
              const foodSubs = getSubstitutionsForFood(food.food_name);
              const isExpanded = expandedFoods.has(food.id);
              const hasSubstitutions = foodSubs.length > 0;

              // Format quantity display based on unit_type
              const quantityDisplay = formatQuantityDisplay(
                parseBrazilianNumber(food.quantity),
                food.quantity_units,
                food.unit_type || 'gramas'
              );

              return (
                <li key={food.id} className={styles.foodItemWrapper}>
                  <div className={styles.foodItem}>
                    <span className={styles.foodBullet} />
                    <div className={styles.foodInfo}>
                      <span className={styles.foodName}>{formatFoodName(food.food_name)}</span>
                      <span className={styles.foodDetails}>
                        {quantityDisplay}
                        {food.calories !== undefined && food.calories > 0 && (
                          <> • {Math.round(food.calories)} kcal</>
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Botão para ver substituições */}
                  {hasSubstitutions && (
                    <button
                      className={styles.substitutionToggle}
                      onClick={() => toggleFoodExpansion(food.id)}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      <span>Ver substituicoes ({foodSubs.length})</span>
                    </button>
                  )}

                  {/* Lista de substituições inline */}
                  {isExpanded && hasSubstitutions && (
                    <div className={styles.inlineSubstitutions}>
                      <span className={styles.substitutionHint}>Troque por:</span>
                      {foodSubs.map((sub) => (
                        <div key={sub.id} className={styles.substitutionRow}>
                          <span className={styles.substitutionArrow}>→</span>
                          <span>{formatFoodName(sub.substitute_food)} ({sub.substitute_quantity}g)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <Button fullWidth onClick={handleCloseMeal}>
            Fechar
          </Button>
        </div>
      </Modal>

      {/* Modal Adicionar Refeição Extra */}
      <AddExtraMealModal
        isOpen={showAddExtraMeal}
        onClose={() => setShowAddExtraMeal(false)}
        onAdd={handleAddExtraMeal}
      />

      <BottomNav />
    </PageContainer>
  );
}
