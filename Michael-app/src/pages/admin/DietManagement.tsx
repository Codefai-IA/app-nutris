import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Plus, Trash2, Clock, Check, AlertCircle, FileText, RefreshCw, X, ChevronUp, ChevronDown, Layers, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header } from '../../components/layout';
import { Card, Input, Button, FoodSelect, Select } from '../../components/ui';
import { parseBrazilianNumber } from '../../components/ui/FoodSelect';

const MEAL_OPTIONS = [
  { value: 'Café da Manhã', label: 'Café da Manhã' },
  { value: 'Lanche da Manhã', label: 'Lanche da Manhã' },
  { value: 'Almoço', label: 'Almoço' },
  { value: 'Lanche da Tarde', label: 'Lanche da Tarde' },
  { value: 'Jantar', label: 'Jantar' },
  { value: 'Ceia', label: 'Ceia' },
  { value: 'Pré-Treino', label: 'Pré-Treino' },
  { value: 'Pós-Treino', label: 'Pós-Treino' },
];

const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: 'gramas', label: 'Gramas (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'fatia', label: 'Fatia' },
];

import type { Profile, DietPlan, Meal, TabelaTaco, FoodSubstitution, UnitType, TabelaTacoWithMetadata, MealSubstitution, MealSubstitutionItem } from '../../types/database';
import { UNIT_TYPES } from '../../constants/foodUnits';
import { calculateGramsFromUnits, formatQuantityDisplay, getUnitLabel } from '../../utils/foodUnits';
import styles from './DietManagement.module.css';

interface MealFoodWithNutrition {
  id: string;
  meal_id: string;
  food_name: string;
  quantity: string;
  order_index: number;
  // Unit support
  unit_type: UnitType;
  quantity_units: number | null;
  peso_por_unidade: number | null; // grams per unit (from food_metadata)
  // Valores calculados baseados na quantidade
  calories?: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  // Valores base por 100g (da tabela_taco)
  calories_per_100g?: number;
  protein_per_100g?: number;
  carbs_per_100g?: number;
  fats_per_100g?: number;
}

interface MealWithFoods extends Meal {
  foods: MealFoodWithNutrition[];
  meal_substitutions: MealSubstitution[];
}

interface MacroTotals {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

interface MacroGoals {
  protein_goal: number | null;
  carbs_goal: number | null;
  fats_goal: number | null;
  calories_goal: number | null;
  fiber_goal: number | null;
}

type MacroStatus = 'good' | 'close' | 'low' | 'high' | 'neutral';

// Interface para substituições locais (incluindo novas ainda não salvas)
interface LocalSubstitution {
  id: string;
  original_food: string;
  substitute_food: string;
  substitute_quantity: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

function getMacroStatus(current: number, goal: number | null): { status: MacroStatus; diff: number; percentage: number } {
  if (!goal) return { status: 'neutral', diff: 0, percentage: 0 };

  const diff = current - goal;
  const percentage = Math.round((current / goal) * 100);

  let status: MacroStatus = 'neutral';
  if (percentage >= 95 && percentage <= 105) status = 'good';
  else if (percentage < 90) status = 'low';
  else if (percentage > 110) status = 'high';
  else status = 'close';

  return { status, diff, percentage };
}

function getStatusIcon(status: MacroStatus): string {
  switch (status) {
    case 'good': return '\u2705';
    case 'close': return '\uD83D\uDFE1';
    case 'low': return '\uD83D\uDD34';
    case 'high': return '\uD83D\uDFE0';
    default: return '\u26AA';
  }
}

export function DietManagement() {
  const { id, dietId } = useParams<{ id: string; dietId: string }>();
  const [client, setClient] = useState<Profile | null>(null);
  const [macroGoals, setMacroGoals] = useState<MacroGoals>({
    protein_goal: null,
    carbs_goal: null,
    fats_goal: null,
    calories_goal: null,
    fiber_goal: null,
  });
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [meals, setMeals] = useState<MealWithFoods[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Substitutions state
  const [substitutions, setSubstitutions] = useState<LocalSubstitution[]>([]);
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [editingFoodName, setEditingFoodName] = useState<string | null>(null);
  const [newSubstituteFood, setNewSubstituteFood] = useState('');
  const [newSubstituteQty, setNewSubstituteQty] = useState('');

  // Meal Substitutions state
  const [showMealSubModal, setShowMealSubModal] = useState(false);
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null);
  const [editingMealSubIndex, setEditingMealSubIndex] = useState<number | null>(null);
  const [mealSubName, setMealSubName] = useState('');
  const [mealSubFoods, setMealSubFoods] = useState<MealSubstitutionItem[]>([]);

  useEffect(() => {
    if (id && dietId) {
      fetchClient();
      fetchDiet();
    }
  }, [id, dietId]);

  async function fetchClient() {
    const { data } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (data) {
      setClient(data);
      setMacroGoals({
        protein_goal: data.protein_goal,
        carbs_goal: data.carbs_goal,
        fats_goal: data.fats_goal,
        calories_goal: data.calories_goal,
        fiber_goal: data.fiber_goal,
      });
    }
  }

  async function fetchDiet() {
    try {
      const { data: plan, error: fetchError } = await supabase
        .from('diet_plans')
        .select('*')
        .eq('id', dietId)
        .single();

      if (fetchError) {
        console.error('Fetch error:', fetchError);
        alert('Erro ao buscar plano de dieta: ' + fetchError.message);
        setLoading(false);
        return;
      }

      if (plan) {
        setDietPlan(plan);

        // OTIMIZADO: Busca refeições com alimentos em uma única query usando JOIN
        const { data: mealsData } = await supabase
          .from('meals')
          .select(`
            *,
            meal_foods (*)
          `)
          .eq('diet_plan_id', plan.id)
          .order('order_index');

        // Buscar substituições existentes
        const { data: substitutionsData } = await supabase
          .from('food_substitutions')
          .select('*')
          .eq('diet_plan_id', plan.id);

        if (substitutionsData) {
          setSubstitutions(substitutionsData.map(sub => ({
            id: sub.id,
            original_food: sub.original_food,
            substitute_food: sub.substitute_food,
            substitute_quantity: sub.substitute_quantity,
          })));
        } else {
          setSubstitutions([]);
        }

        if (mealsData && mealsData.length > 0) {
          // Coleta todos os nomes de alimentos únicos para buscar nutrição em batch
          const allFoodNames = new Set<string>();
          mealsData.forEach(meal => {
            (meal.meal_foods || []).forEach((food: { food_name?: string }) => {
              if (food.food_name) {
                allFoodNames.add(food.food_name);
              }
            });
          });

          // OTIMIZADO: Busca todos os dados nutricionais em uma única query (com metadata)
          let nutritionMap = new Map<string, TabelaTacoWithMetadata>();
          if (allFoodNames.size > 0) {
            const { data: tacoFoods } = await supabase
              .from('tabela_taco')
              .select('*, food_metadata(*)')
              .in('alimento', Array.from(allFoodNames));

            if (tacoFoods) {
              tacoFoods.forEach(food => {
                nutritionMap.set(food.alimento, food as TabelaTacoWithMetadata);
              });
            }
          }

          // Processa os dados usando o mapa de nutrição
          const mealsWithFoods: MealWithFoods[] = mealsData.map(meal => {
            const mealFoods = (meal.meal_foods || [])
              .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index);

            const foodsWithNutrition: MealFoodWithNutrition[] = mealFoods.map((food: any) => {
              // Initialize unit fields with defaults if not present
              const unitType: UnitType = food.unit_type || 'gramas';
              const quantityUnits: number | null = food.quantity_units ?? null;

              if (!food.food_name) {
                return {
                  ...food,
                  unit_type: unitType,
                  quantity_units: quantityUnits,
                  peso_por_unidade: null,
                };
              }

              const tacoFood = nutritionMap.get(food.food_name);
              if (tacoFood) {
                const qty = parseBrazilianNumber(food.quantity);
                const multiplier = qty / 100;

                const caloriesPer100g = parseBrazilianNumber(tacoFood.caloria);
                const proteinPer100g = parseBrazilianNumber(tacoFood.proteina);
                const carbsPer100g = parseBrazilianNumber(tacoFood.carboidrato);
                const fatsPer100g = parseBrazilianNumber(tacoFood.gordura);

                // Get peso_por_unidade from food_metadata if available
                const pesoPorUnidade = tacoFood.food_metadata?.peso_por_unidade ?? null;

                return {
                  ...food,
                  unit_type: unitType,
                  quantity_units: quantityUnits,
                  peso_por_unidade: pesoPorUnidade,
                  calories_per_100g: caloriesPer100g,
                  protein_per_100g: proteinPer100g,
                  carbs_per_100g: carbsPer100g,
                  fats_per_100g: fatsPer100g,
                  calories: caloriesPer100g * multiplier,
                  protein: proteinPer100g * multiplier,
                  carbs: carbsPer100g * multiplier,
                  fats: fatsPer100g * multiplier,
                };
              }
              return {
                ...food,
                unit_type: unitType,
                quantity_units: quantityUnits,
                peso_por_unidade: null,
              };
            });

            return {
              ...meal,
              foods: foodsWithNutrition,
              meal_substitutions: meal.meal_substitutions || [],
            };
          });

          setMeals(mealsWithFoods);
        } else {
          setMeals([]);
        }
      }
    } catch (error) {
      console.error('Fetch diet error:', error);
    } finally {
      setLoading(false);
    }
  }

  // Calcular totais por refeição
  const calculateMealTotals = (foods: MealFoodWithNutrition[]): MacroTotals => {
    return foods.reduce(
      (total, food) => ({
        calories: total.calories + (food.calories || 0),
        protein: total.protein + (food.protein || 0),
        carbs: total.carbs + (food.carbs || 0),
        fats: total.fats + (food.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  };

  // Calcular totais diários
  const dailyTotals = useMemo((): MacroTotals => {
    return meals.reduce(
      (total, meal) => {
        const mealTotals = calculateMealTotals(meal.foods);
        return {
          calories: total.calories + mealTotals.calories,
          protein: total.protein + mealTotals.protein,
          carbs: total.carbs + mealTotals.carbs,
          fats: total.fats + mealTotals.fats,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fats: 0 }
    );
  }, [meals]);

  // Sanitiza dados do alimento para salvar no banco
  function sanitizeFoodForSave(food: MealFoodWithNutrition) {
    // Garantir que quantity seja uma string válida
    const quantityStr = String(food.quantity || '').trim();
    return {
      food_name: food.food_name || '',
      quantity: quantityStr,
      order_index: Number(food.order_index) || 0,
      unit_type: food.unit_type || 'gramas',
      quantity_units: food.quantity_units,
    };
  }

  async function handleSave() {
    if (!dietPlan) {
      console.error('dietPlan is null - cannot save');
      alert('Erro: Plano de dieta não carregado. Recarregue a página.');
      return;
    }

    setSaving(true);
    setSaveStatus('idle');

    try {
      const now = new Date().toISOString();

      // Salvar totais calculados no plano
      const planUpdateData = {
        name: dietPlan.name || 'Dieta',
        daily_calories: Math.round(dailyTotals.calories) || 0,
        protein_g: Math.round(dailyTotals.protein) || 0,
        carbs_g: Math.round(dailyTotals.carbs) || 0,
        fat_g: Math.round(dailyTotals.fats) || 0,
        water_goal_liters: dietPlan.water_goal_liters || null,
        notes: dietPlan.notes || null,
        updated_at: now,
      };

      const { error: planError } = await supabase
        .from('diet_plans')
        .update(planUpdateData)
        .eq('id', dietPlan.id);

      if (planError) {
        console.error('Plan error:', planError);
        throw planError;
      }

      for (let mealIdx = 0; mealIdx < meals.length; mealIdx++) {
        const meal = meals[mealIdx];
        let currentMealId = meal.id;

        if (meal.id.startsWith('new-')) {
          const { data: newMeal, error: mealError } = await supabase
            .from('meals')
            .insert({
              diet_plan_id: dietPlan.id,
              name: meal.name || '',
              suggested_time: meal.suggested_time || null,
              order_index: Number(meal.order_index) || 0,
              meal_substitutions: meal.meal_substitutions || [],
            })
            .select()
            .single();

          if (mealError) {
            console.error('Meal insert error:', mealError);
            throw mealError;
          }
          currentMealId = newMeal?.id || meal.id;
        } else {
          const { error: mealUpdateError } = await supabase
            .from('meals')
            .update({
              name: meal.name || '',
              suggested_time: meal.suggested_time || null,
              order_index: Number(meal.order_index) || 0,
              meal_substitutions: meal.meal_substitutions || [],
            })
            .eq('id', meal.id);

          if (mealUpdateError) {
            console.error('Meal update error:', mealUpdateError);
            throw mealUpdateError;
          }
        }

        // Processar alimentos da refeição
        for (let foodIdx = 0; foodIdx < meal.foods.length; foodIdx++) {
          const food = meal.foods[foodIdx];
          const sanitizedFood = sanitizeFoodForSave(food);

          if (food.id.startsWith('new-')) {
            const { error: foodInsertError } = await supabase.from('meal_foods').insert({
              meal_id: currentMealId,
              ...sanitizedFood,
            });
            if (foodInsertError) {
              console.error('Food insert error:', foodInsertError);
              throw foodInsertError;
            }
          } else {
            const { error: foodUpdateError } = await supabase
              .from('meal_foods')
              .update(sanitizedFood)
              .eq('id', food.id);
            if (foodUpdateError) {
              console.error('Food update error:', foodUpdateError);
              throw foodUpdateError;
            }
          }
        }
      }

      // Salvar substituições
      // 1. Deletar substituições marcadas para exclusão
      const toDelete = substitutions.filter((sub) => sub.isDeleted && !sub.isNew);
      for (const sub of toDelete) {
        const { error: deleteError } = await supabase
          .from('food_substitutions')
          .delete()
          .eq('id', sub.id);
        if (deleteError) {
          console.error('Substitution delete error:', deleteError);
          throw deleteError;
        }
      }

      // 2. Inserir novas substituições
      const toInsert = substitutions.filter((sub) => sub.isNew && !sub.isDeleted);
      for (const sub of toInsert) {
        const { error: insertError } = await supabase.from('food_substitutions').insert({
          diet_plan_id: dietPlan.id,
          original_food: sub.original_food,
          substitute_food: sub.substitute_food,
          substitute_quantity: sub.substitute_quantity,
        });
        if (insertError) {
          console.error('Substitution insert error:', insertError);
          throw insertError;
        }
      }

      await fetchDiet();
      setLastSavedAt(now);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 5000);
    } catch (error) {
      console.error('Save error:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    const { data } = await supabase
      .from('diet_templates')
      .select('id, name, description')
      .order('name');
    setTemplates(data || []);
    setLoadingTemplates(false);
    setShowTemplateModal(true);
  }

  async function applyTemplate(templateId: string) {
    if (!dietPlan) return;

    const { data: mealsData } = await supabase
      .from('diet_template_meals')
      .select(`
        *,
        diet_template_meal_foods (*)
      `)
      .eq('template_id', templateId)
      .order('order_index');

    if (!mealsData) return;

    // Deletar meals existentes para este plano (cascade deleta foods)
    const existingIds = meals
      .filter(m => !m.id.startsWith('new-'))
      .map(m => m.id);

    if (existingIds.length > 0) {
      await supabase
        .from('meals')
        .delete()
        .in('id', existingIds);
    }

    // Deletar substituicoes existentes
    await supabase
      .from('food_substitutions')
      .delete()
      .eq('diet_plan_id', dietPlan.id);

    // Coletar IDs dos alimentos do template para buscar substituicoes
    const templateFoodIds: string[] = [];
    const foodIdToNameMap = new Map<string, string>();
    mealsData.forEach(meal => {
      (meal.diet_template_meal_foods || []).forEach((food: { id: string; food_name: string }) => {
        if (food.id) {
          templateFoodIds.push(food.id);
          foodIdToNameMap.set(food.id, food.food_name);
        }
      });
    });

    // Buscar substituicoes do template
    let templateSubstitutionsMap = new Map<string, { substitute_food: string; substitute_quantity: string }[]>();
    if (templateFoodIds.length > 0) {
      const { data: templateSubs } = await supabase
        .from('diet_template_food_substitutions')
        .select('*')
        .in('template_food_id', templateFoodIds);

      if (templateSubs) {
        templateSubs.forEach((sub: { template_food_id: string; substitute_food: string; substitute_quantity: string }) => {
          const foodName = foodIdToNameMap.get(sub.template_food_id);
          if (foodName) {
            const existing = templateSubstitutionsMap.get(foodName) || [];
            existing.push({
              substitute_food: sub.substitute_food,
              substitute_quantity: sub.substitute_quantity,
            });
            templateSubstitutionsMap.set(foodName, existing);
          }
        });
      }
    }

    // Criar substituicoes locais baseadas no template
    const newSubstitutions: LocalSubstitution[] = [];
    templateSubstitutionsMap.forEach((subs, foodName) => {
      subs.forEach((sub, idx) => {
        newSubstitutions.push({
          id: `new-${Date.now()}-sub-${foodName}-${idx}`,
          original_food: foodName,
          substitute_food: sub.substitute_food,
          substitute_quantity: sub.substitute_quantity,
          isNew: true,
        });
      });
    });

    // Coleta nomes de alimentos para buscar nutrição
    const allFoodNames = new Set<string>();
    mealsData.forEach(meal => {
      (meal.diet_template_meal_foods || []).forEach((food: { food_name?: string }) => {
        if (food.food_name) allFoodNames.add(food.food_name);
      });
    });

    // Busca dados nutricionais
    let nutritionMap = new Map<string, TabelaTaco>();
    if (allFoodNames.size > 0) {
      const { data: tacoFoods } = await supabase
        .from('tabela_taco')
        .select('*')
        .in('alimento', Array.from(allFoodNames));
      if (tacoFoods) {
        tacoFoods.forEach(food => nutritionMap.set(food.alimento, food));
      }
    }

    const newMeals: MealWithFoods[] = mealsData.map((meal, mealIdx) => {
      const foods = (meal.diet_template_meal_foods || [])
        .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
        .map((food: { food_name: string; quantity: string; order_index: number; unit_type?: string; quantity_units?: number }, foodIdx: number) => {
          const tacoFood = nutritionMap.get(food.food_name);
          const qty = parseBrazilianNumber(food.quantity);
          const multiplier = qty / 100;

          if (tacoFood) {
            const caloriesPer100g = parseBrazilianNumber(tacoFood.caloria);
            const proteinPer100g = parseBrazilianNumber(tacoFood.proteina);
            const carbsPer100g = parseBrazilianNumber(tacoFood.carboidrato);
            const fatsPer100g = parseBrazilianNumber(tacoFood.gordura);

            return {
              id: `new-${Date.now()}-${mealIdx}-${foodIdx}`,
              meal_id: '',
              food_name: food.food_name,
              quantity: food.quantity,
              order_index: food.order_index,
              unit_type: (food.unit_type || 'gramas') as UnitType,
              quantity_units: food.quantity_units || null,
              peso_por_unidade: null,
              calories_per_100g: caloriesPer100g,
              protein_per_100g: proteinPer100g,
              carbs_per_100g: carbsPer100g,
              fats_per_100g: fatsPer100g,
              calories: caloriesPer100g * multiplier,
              protein: proteinPer100g * multiplier,
              carbs: carbsPer100g * multiplier,
              fats: fatsPer100g * multiplier,
            };
          }

          return {
            id: `new-${Date.now()}-${mealIdx}-${foodIdx}`,
            meal_id: '',
            food_name: food.food_name,
            quantity: food.quantity,
            order_index: food.order_index,
            unit_type: (food.unit_type || 'gramas') as UnitType,
            quantity_units: food.quantity_units || null,
            peso_por_unidade: null,
          };
        });

      return {
        id: `new-${Date.now()}-${mealIdx}`,
        diet_plan_id: dietPlan?.id || '',
        name: meal.name,
        suggested_time: meal.suggested_time,
        order_index: mealIdx,
        foods,
        meal_substitutions: meal.meal_substitutions || [],
      };
    });

    setMeals(newMeals);
    setSubstitutions(newSubstitutions);
    setShowTemplateModal(false);
  }

  function addMeal() {
    const newMeal: MealWithFoods = {
      id: `new-${Date.now()}`,
      diet_plan_id: dietPlan?.id || '',
      name: '',
      suggested_time: null,
      order_index: meals.length,
      foods: [],
      meal_substitutions: [],
    };
    setMeals([...meals, newMeal]);
  }

  function updateMeal(index: number, field: keyof Meal, value: string | number | null) {
    const updated = [...meals];
    updated[index] = { ...updated[index], [field]: value };
    setMeals(updated);
  }

  async function removeMeal(index: number) {
    const meal = meals[index];
    if (!meal.id.startsWith('new-')) {
      await supabase.from('meal_foods').delete().eq('meal_id', meal.id);
      await supabase.from('meals').delete().eq('id', meal.id);
    }
    setMeals(meals.filter((_, i) => i !== index));
  }

  function moveMealUp(index: number) {
    if (index <= 0) return;
    const updated = [...meals];
    // Swap meals
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    // Update order_index
    updated.forEach((meal, i) => {
      meal.order_index = i;
    });
    setMeals(updated);
  }

  function moveMealDown(index: number) {
    if (index >= meals.length - 1) return;
    const updated = [...meals];
    // Swap meals
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    // Update order_index
    updated.forEach((meal, i) => {
      meal.order_index = i;
    });
    setMeals(updated);
  }

  function duplicateMeal(index: number) {
    const mealToDuplicate = meals[index];
    const timestamp = Date.now();

    // Create a deep copy of foods with new IDs
    const duplicatedFoods: MealFoodWithNutrition[] = mealToDuplicate.foods.map((food, foodIdx) => ({
      ...food,
      id: `new-${timestamp}-food-${foodIdx}`,
      meal_id: '',
    }));

    // Create a deep copy of meal substitutions with new IDs
    const duplicatedMealSubs = mealToDuplicate.meal_substitutions.map((sub, subIdx) => ({
      ...sub,
      id: `sub-${timestamp}-${subIdx}`,
    }));

    const duplicatedMeal: MealWithFoods = {
      id: `new-${timestamp}`,
      diet_plan_id: dietPlan?.id || '',
      name: mealToDuplicate.name,
      suggested_time: mealToDuplicate.suggested_time,
      order_index: meals.length,
      foods: duplicatedFoods,
      meal_substitutions: duplicatedMealSubs,
    };

    setMeals([...meals, duplicatedMeal]);
  }

  function addFood(mealIndex: number) {
    const updated = [...meals];
    const newFood: MealFoodWithNutrition = {
      id: `new-${Date.now()}`,
      meal_id: updated[mealIndex].id,
      food_name: '',
      quantity: '',
      order_index: updated[mealIndex].foods.length,
      unit_type: 'gramas',
      quantity_units: null,
      peso_por_unidade: null,
    };
    updated[mealIndex].foods.push(newFood);
    setMeals(updated);
  }

  function updateFood(
    mealIndex: number,
    foodIndex: number,
    field: keyof MealFoodWithNutrition,
    value: string | number
  ) {
    const updated = [...meals];
    updated[mealIndex].foods[foodIndex] = {
      ...updated[mealIndex].foods[foodIndex],
      [field]: value,
    };
    setMeals(updated);
  }

  async function handleFoodSelect(mealIndex: number, foodIndex: number, selectedFood: TabelaTaco) {
    const updated = [...meals];
    const currentFood = updated[mealIndex].foods[foodIndex];
    const currentQty = parseBrazilianNumber(currentFood.quantity) || 100;
    const multiplier = currentQty / 100;

    // Valores base por 100g - usando parseBrazilianNumber para converter vírgula
    const caloriesPer100g = parseBrazilianNumber(selectedFood.caloria);
    const proteinPer100g = parseBrazilianNumber(selectedFood.proteina);
    const carbsPer100g = parseBrazilianNumber(selectedFood.carboidrato);
    const fatsPer100g = parseBrazilianNumber(selectedFood.gordura);

    // Fetch food_metadata to get peso_por_unidade
    let pesoPorUnidade: number | null = null;
    const { data: metadata } = await supabase
      .from('food_metadata')
      .select('peso_por_unidade')
      .eq('taco_id', selectedFood.id)
      .maybeSingle();

    if (metadata) {
      pesoPorUnidade = metadata.peso_por_unidade;
    }

    updated[mealIndex].foods[foodIndex] = {
      ...currentFood,
      food_name: selectedFood.alimento,
      peso_por_unidade: pesoPorUnidade,
      // Reset to gramas when selecting new food
      unit_type: 'gramas',
      quantity_units: null,
      // Valores base por 100g
      calories_per_100g: caloriesPer100g,
      protein_per_100g: proteinPer100g,
      carbs_per_100g: carbsPer100g,
      fats_per_100g: fatsPer100g,
      // Valores calculados
      calories: caloriesPer100g * multiplier,
      protein: proteinPer100g * multiplier,
      carbs: carbsPer100g * multiplier,
      fats: fatsPer100g * multiplier,
    };
    setMeals(updated);
  }

  function handleQuantityChange(mealIndex: number, foodIndex: number, inputValue: string) {
    const updated = [...meals];
    const food = updated[mealIndex].foods[foodIndex];
    const inputNum = parseBrazilianNumber(inputValue);

    let gramsQty: number;
    let quantityUnits: number | null = null;

    // If using units, convert to grams
    if (food.unit_type !== 'gramas' && food.peso_por_unidade && food.peso_por_unidade > 0) {
      quantityUnits = inputNum;
      gramsQty = calculateGramsFromUnits(inputNum, food.peso_por_unidade);
    } else {
      gramsQty = inputNum;
    }

    const multiplier = gramsQty / 100;

    // Se tem valores base por 100g, recalcular
    if (food.calories_per_100g !== undefined) {
      updated[mealIndex].foods[foodIndex] = {
        ...food,
        quantity: String(Math.round(gramsQty)),
        quantity_units: quantityUnits,
        calories: (food.calories_per_100g || 0) * multiplier,
        protein: (food.protein_per_100g || 0) * multiplier,
        carbs: (food.carbs_per_100g || 0) * multiplier,
        fats: (food.fats_per_100g || 0) * multiplier,
      };
    } else {
      updated[mealIndex].foods[foodIndex] = {
        ...food,
        quantity: String(Math.round(gramsQty)),
        quantity_units: quantityUnits,
      };
    }
    setMeals(updated);
  }

  function handleUnitTypeChange(mealIndex: number, foodIndex: number, newUnitType: UnitType) {
    const updated = [...meals];
    const food = updated[mealIndex].foods[foodIndex];

    // When switching unit type, reset quantity
    updated[mealIndex].foods[foodIndex] = {
      ...food,
      unit_type: newUnitType,
      quantity: newUnitType === 'gramas' ? food.quantity : '',
      quantity_units: null,
      // Reset calculated values when switching
      calories: undefined,
      protein: undefined,
      carbs: undefined,
      fats: undefined,
    };
    setMeals(updated);
  }

  // Get display value for quantity input based on unit type
  function getQuantityInputValue(food: MealFoodWithNutrition): string {
    if (food.unit_type === 'gramas') {
      return food.quantity;
    }
    // For units, show quantity_units if available, otherwise empty
    return food.quantity_units !== null ? String(food.quantity_units) : '';
  }

  async function removeFood(mealIndex: number, foodIndex: number) {
    const food = meals[mealIndex].foods[foodIndex];
    if (!food.id.startsWith('new-')) {
      await supabase.from('meal_foods').delete().eq('id', food.id);
    }
    const updated = [...meals];
    updated[mealIndex].foods = updated[mealIndex].foods.filter((_, i) => i !== foodIndex);
    setMeals(updated);
  }

  // Substitution helper functions
  function getSubstitutionsForFood(foodName: string): LocalSubstitution[] {
    return substitutions.filter(
      (sub) => sub.original_food.toLowerCase() === foodName.toLowerCase() && !sub.isDeleted
    );
  }

  function openSubstitutionModal(foodName: string) {
    setEditingFoodName(foodName);
    setNewSubstituteFood('');
    setNewSubstituteQty('');
    setShowSubstitutionModal(true);
  }

  function closeSubstitutionModal() {
    setShowSubstitutionModal(false);
    setEditingFoodName(null);
    setNewSubstituteFood('');
    setNewSubstituteQty('');
  }

  function addSubstitution() {
    if (!editingFoodName || !newSubstituteFood || !newSubstituteQty) return;

    const newSub: LocalSubstitution = {
      id: `new-${Date.now()}`,
      original_food: editingFoodName,
      substitute_food: newSubstituteFood,
      substitute_quantity: newSubstituteQty,
      isNew: true,
    };

    setSubstitutions([...substitutions, newSub]);
    setNewSubstituteFood('');
    setNewSubstituteQty('');
  }

  function removeSubstitution(subId: string) {
    setSubstitutions(
      substitutions.map((sub) =>
        sub.id === subId
          ? sub.isNew
            ? { ...sub, isDeleted: true } // Para novas, apenas marca como deletada (será filtrada)
            : { ...sub, isDeleted: true } // Para existentes, marca para deletar no save
          : sub
      ).filter((sub) => !(sub.isNew && sub.isDeleted)) // Remove novas que foram deletadas
    );
  }

  function handleSubstituteFoodSelect(selectedFood: TabelaTaco) {
    setNewSubstituteFood(selectedFood.alimento);
  }

  // Meal Substitution functions
  function openMealSubModal(mealIndex: number, subIndex: number | null = null) {
    setEditingMealIndex(mealIndex);
    setEditingMealSubIndex(subIndex);

    if (subIndex !== null && meals[mealIndex].meal_substitutions[subIndex]) {
      const sub = meals[mealIndex].meal_substitutions[subIndex];
      setMealSubName(sub.name);
      setMealSubFoods([...sub.items]);
    } else {
      // Nova substituicao
      const existingCount = meals[mealIndex].meal_substitutions.length;
      setMealSubName(`Opcao ${existingCount + 2}`);
      setMealSubFoods([]);
    }
    setShowMealSubModal(true);
  }

  function closeMealSubModal() {
    setShowMealSubModal(false);
    setEditingMealIndex(null);
    setEditingMealSubIndex(null);
    setMealSubName('');
    setMealSubFoods([]);
  }

  function addMealSubFood() {
    setMealSubFoods([
      ...mealSubFoods,
      { food_name: '', quantity: '', unit_type: 'gramas', quantity_units: null }
    ]);
  }

  function updateMealSubFood(index: number, field: keyof MealSubstitutionItem, value: string | number | null) {
    const updated = [...mealSubFoods];
    updated[index] = { ...updated[index], [field]: value };
    setMealSubFoods(updated);
  }

  function removeMealSubFood(index: number) {
    setMealSubFoods(mealSubFoods.filter((_, i) => i !== index));
  }

  function handleMealSubFoodSelect(index: number, selectedFood: TabelaTaco) {
    const updated = [...mealSubFoods];
    updated[index] = { ...updated[index], food_name: selectedFood.alimento };
    setMealSubFoods(updated);
  }

  function saveMealSubstitution() {
    if (editingMealIndex === null || !mealSubName.trim()) return;

    const newSub: MealSubstitution = {
      id: editingMealSubIndex !== null
        ? meals[editingMealIndex].meal_substitutions[editingMealSubIndex].id
        : `sub-${Date.now()}`,
      name: mealSubName.trim(),
      items: mealSubFoods.filter(f => f.food_name.trim() !== ''),
    };

    const updated = [...meals];
    if (editingMealSubIndex !== null) {
      // Editando existente
      updated[editingMealIndex].meal_substitutions[editingMealSubIndex] = newSub;
    } else {
      // Adicionando nova
      updated[editingMealIndex].meal_substitutions.push(newSub);
    }
    setMeals(updated);
    closeMealSubModal();
  }

  function removeMealSubstitution(mealIndex: number, subIndex: number) {
    const updated = [...meals];
    updated[mealIndex].meal_substitutions = updated[mealIndex].meal_substitutions.filter((_, i) => i !== subIndex);
    setMeals(updated);
  }

  if (loading) {
    return (
      <PageContainer hasBottomNav={false}>
        <Header title="Gerenciar Dieta" showBack />
        <div className={styles.loading}>Carregando...</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer hasBottomNav={false}>
      <Header
        title={dietPlan?.name || 'Dieta'}
        subtitle={client?.full_name}
        showBack
        rightAction={
          <Button size="sm" onClick={handleSave} loading={saving}>
            <Save size={18} />
            Salvar
          </Button>
        }
      />

      <main className={styles.content}>
        {/* Diet Name Card */}
        <Card className={styles.dietNameCard}>
          <label className={styles.dietNameLabel}>Nome da Dieta</label>
          <Input
            type="text"
            value={dietPlan?.name || ''}
            onChange={(e) => setDietPlan(prev => prev ? { ...prev, name: e.target.value } : null)}
            placeholder="Ex: High Carb, Low Carb..."
          />
        </Card>

        {/* Comparação com Metas */}
        <Card className={styles.comparisonCard}>
          <div className={styles.comparisonHeader}>
            <h2 className={styles.comparisonTitle}>Comparação com Metas</h2>
          </div>

          {/* Warning if no goals set */}
          {!macroGoals.protein_goal && !macroGoals.carbs_goal && !macroGoals.fats_goal && !macroGoals.calories_goal && (
            <div className={styles.warningBanner}>
              Metas nutricionais não definidas. Configure na aba de Anamnese.
            </div>
          )}

          {/* Comparison Table */}
          <table className={styles.comparisonTable}>
            <thead>
              <tr>
                <th>Nutriente</th>
                <th>Meta</th>
                <th>Atual</th>
                <th>Diferença</th>
                <th>%</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Proteínas', icon: '\uD83E\uDD69', current: dailyTotals.protein, goal: macroGoals.protein_goal, unit: 'g' },
                { name: 'Carboidratos', icon: '\uD83C\uDF5A', current: dailyTotals.carbs, goal: macroGoals.carbs_goal, unit: 'g' },
                { name: 'Gorduras', icon: '\uD83E\uDD51', current: dailyTotals.fats, goal: macroGoals.fats_goal, unit: 'g' },
                { name: 'Calorias', icon: '\uD83D\uDD25', current: dailyTotals.calories, goal: macroGoals.calories_goal, unit: 'kcal' },
              ].map((macro) => {
                const { status, diff, percentage } = getMacroStatus(macro.current, macro.goal);
                return (
                  <tr key={macro.name}>
                    <td>
                      <span className={styles.nutrientName}>
                        <span className={styles.nutrientIcon}>{macro.icon}</span>
                        {macro.name}
                      </span>
                    </td>
                    <td className={styles.goalValue}>
                      {macro.goal ? `${macro.goal}${macro.unit}` : '-'}
                    </td>
                    <td className={styles.currentValue}>
                      {Math.round(macro.current * 10) / 10}{macro.unit}
                    </td>
                    <td>
                      {macro.goal ? (
                        <span className={`${styles.diffValue} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
                          {diff > 0 ? '+' : ''}{Math.round(diff * 10) / 10}{macro.unit}
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      {macro.goal ? (
                        <span className={`${styles.percentBadge} ${styles[`status${status.charAt(0).toUpperCase() + status.slice(1)}`]}`}>
                          {getStatusIcon(status)} {percentage}%
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Progress Bars */}
          <div className={styles.progressBarsSection}>
            {[
              { name: 'Proteínas', icon: '\uD83E\uDD69', current: dailyTotals.protein, goal: macroGoals.protein_goal, unit: 'g' },
              { name: 'Carboidratos', icon: '\uD83C\uDF5A', current: dailyTotals.carbs, goal: macroGoals.carbs_goal, unit: 'g' },
              { name: 'Gorduras', icon: '\uD83E\uDD51', current: dailyTotals.fats, goal: macroGoals.fats_goal, unit: 'g' },
              { name: 'Calorias', icon: '\uD83D\uDD25', current: dailyTotals.calories, goal: macroGoals.calories_goal, unit: 'kcal' },
            ].map((macro) => {
              if (!macro.goal) return null;
              const { status } = getMacroStatus(macro.current, macro.goal);
              const percentage = Math.min(100, Math.round((macro.current / macro.goal) * 100));
              const statusClass = `progressFill${status.charAt(0).toUpperCase() + status.slice(1)}`;

              return (
                <div key={`bar-${macro.name}`} className={styles.progressItem}>
                  <div className={styles.progressLabel}>
                    <span className={styles.progressLabelName}>
                      {macro.icon} {macro.name}
                    </span>
                    <span>{Math.round(macro.current)}/{macro.goal}{macro.unit}</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={`${styles.progressFill} ${styles[statusClass]}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            <span className={styles.legendItem}>{'\u2705'} 95-105% = Ideal</span>
            <span className={styles.legendItem}>{'\uD83D\uDFE1'} 90-95% ou 105-110% = Próximo</span>
            <span className={styles.legendItem}>{'\uD83D\uDD34'} {'<'}90% = Baixo</span>
            <span className={styles.legendItem}>{'\uD83D\uDFE0'} {'>'}110% = Alto</span>
          </div>
        </Card>

        {/* Resumo Diário - Calculado automaticamente */}
        <Card className={styles.dailySummaryCard}>
          <h2 className={styles.sectionTitle}>Resumo Diário</h2>
          <div className={styles.dailySummaryGrid}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{Math.round(dailyTotals.calories)}</span>
              <span className={styles.summaryLabel}>kcal</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{Math.round(dailyTotals.protein)}g</span>
              <span className={styles.summaryLabel}>Proteína</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{Math.round(dailyTotals.carbs)}g</span>
              <span className={styles.summaryLabel}>Carbos</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryValue}>{Math.round(dailyTotals.fats)}g</span>
              <span className={styles.summaryLabel}>Gordura</span>
            </div>
          </div>
        </Card>

        {/* Meta de Água */}
        <Card className={styles.waterCard}>
          <div className={styles.waterField}>
            <label>Meta de água (litros)</label>
            <Input
              type="number"
              step="0.5"
              value={dietPlan?.water_goal_liters || ''}
              onChange={(e) =>
                setDietPlan((prev) =>
                  prev ? { ...prev, water_goal_liters: Number(e.target.value) } : null
                )
              }
            />
          </div>
        </Card>

        <section className={styles.mealsSection}>
          <div className={styles.mealsHeader}>
            <h2 className={styles.sectionTitle}>Refeições</h2>
            <div className={styles.mealsActions}>
              <Button size="sm" variant="outline" onClick={loadTemplates}>
                <FileText size={16} />
                Template
              </Button>
              <Button size="sm" variant="outline" onClick={addMeal}>
                <Plus size={16} />
                Adicionar
              </Button>
            </div>
          </div>

          {meals.map((meal, mealIndex) => {
            const mealTotals = calculateMealTotals(meal.foods);

            return (
              <Card key={meal.id} className={styles.mealCard}>
                <div className={styles.mealHeader}>
                  <div className={styles.mealOrderButtons}>
                    <button
                      className={styles.orderButton}
                      onClick={() => moveMealUp(mealIndex)}
                      disabled={mealIndex === 0}
                      title="Mover para cima"
                    >
                      <ChevronUp size={18} />
                    </button>
                    <button
                      className={styles.orderButton}
                      onClick={() => moveMealDown(mealIndex)}
                      disabled={mealIndex === meals.length - 1}
                      title="Mover para baixo"
                    >
                      <ChevronDown size={18} />
                    </button>
                  </div>
                  <Select
                    value={meal.name}
                    onChange={(e) => updateMeal(mealIndex, 'name', e.target.value)}
                    options={MEAL_OPTIONS}
                    placeholder="Selecione a refeição"
                  />
                  <div className={styles.mealTime}>
                    <Clock size={18} />
                    <Input
                      type="time"
                      value={meal.suggested_time || ''}
                      onChange={(e) => updateMeal(mealIndex, 'suggested_time', e.target.value)}
                    />
                  </div>
                  <button
                    className={styles.duplicateButton}
                    onClick={() => duplicateMeal(mealIndex)}
                    title="Duplicar refeição"
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    className={styles.deleteButton}
                    onClick={() => removeMeal(mealIndex)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className={styles.foodsList}>
                  {meal.foods.map((food, foodIndex) => (
                    <div key={food.id} className={styles.foodItem}>
                      <div className={styles.foodRow}>
                        <div className={styles.foodSelectWrapper}>
                          <FoodSelect
                            value={food.food_name}
                            onChange={(foodName) =>
                              updateFood(mealIndex, foodIndex, 'food_name', foodName)
                            }
                            onFoodSelect={(selectedFood: TabelaTaco) => {
                              handleFoodSelect(mealIndex, foodIndex, selectedFood);
                            }}
                            placeholder="Buscar alimento..."
                          />
                        </div>
                        <div className={styles.unitTypeWrapper}>
                          <Select
                            value={food.unit_type}
                            onChange={(e) => handleUnitTypeChange(mealIndex, foodIndex, e.target.value as UnitType)}
                            options={UNIT_OPTIONS}
                          />
                        </div>
                        <div className={styles.quantityWrapper}>
                          <Input
                            type="number"
                            value={getQuantityInputValue(food)}
                            onChange={(e) =>
                              handleQuantityChange(mealIndex, foodIndex, e.target.value)
                            }
                            placeholder={food.unit_type === 'gramas' ? 'g' : 'qtd'}
                          />
                        </div>
                        {food.food_name && (
                          <button
                            className={styles.substitutionButton}
                            onClick={() => openSubstitutionModal(food.food_name)}
                            title="Gerenciar substituicoes"
                          >
                            <RefreshCw size={16} />
                            {getSubstitutionsForFood(food.food_name).length > 0 && (
                              <span className={styles.substitutionBadge}>
                                {getSubstitutionsForFood(food.food_name).length}
                              </span>
                            )}
                          </button>
                        )}
                        <button
                          className={styles.deleteButton}
                          onClick={() => removeFood(mealIndex, foodIndex)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {/* Show gram equivalent when using units */}
                      {food.unit_type !== 'gramas' && food.quantity_units !== null && food.quantity_units > 0 && (
                        <div className={styles.gramEquivalent}>
                          = {food.quantity}g
                        </div>
                      )}
                      {/* Warning when unit has no peso_por_unidade defined */}
                      {food.unit_type !== 'gramas' && !food.peso_por_unidade && food.food_name && (
                        <div className={styles.unitWarning}>
                          Este alimento nao tem peso por {getUnitLabel(food.unit_type)} definido
                        </div>
                      )}
                      {food.calories !== undefined && food.calories > 0 && (
                        <div className={styles.foodNutrition}>
                          <span>{Math.round(food.calories)} kcal</span>
                          <span>P: {Math.round(food.protein || 0)}g</span>
                          <span>C: {Math.round(food.carbs || 0)}g</span>
                          <span>G: {Math.round(food.fats || 0)}g</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button className={styles.addFoodButton} onClick={() => addFood(mealIndex)}>
                  <Plus size={16} />
                  Adicionar alimento
                </button>

                {meal.foods.length > 0 && (
                  <div className={styles.mealTotal}>
                    <span className={styles.mealTotalLabel}>Total da refeição:</span>
                    <span className={styles.mealTotalValue}>
                      {Math.round(mealTotals.calories)} kcal | P: {Math.round(mealTotals.protein)}g | C: {Math.round(mealTotals.carbs)}g | G: {Math.round(mealTotals.fats)}g
                    </span>
                  </div>
                )}

                {/* Meal Substitutions Section */}
                <div className={styles.mealSubstitutionsSection}>
                  <div className={styles.mealSubHeader}>
                    <span className={styles.mealSubLabel}>
                      <Layers size={16} />
                      Opcoes de Refeicao ({meal.meal_substitutions.length + 1})
                    </span>
                    <button
                      type="button"
                      className={styles.addMealSubBtn}
                      onClick={() => openMealSubModal(mealIndex)}
                    >
                      <Plus size={14} />
                      Adicionar Opcao
                    </button>
                  </div>

                  {meal.meal_substitutions.length > 0 && (
                    <div className={styles.mealSubList}>
                      {meal.meal_substitutions.map((sub, subIndex) => (
                        <div key={sub.id} className={styles.mealSubItem}>
                          <div className={styles.mealSubItemHeader}>
                            <span className={styles.mealSubItemName}>{sub.name}</span>
                            <div className={styles.mealSubItemActions}>
                              <button
                                type="button"
                                onClick={() => openMealSubModal(mealIndex, subIndex)}
                                className={styles.mealSubEditBtn}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => removeMealSubstitution(mealIndex, subIndex)}
                                className={styles.mealSubDeleteBtn}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                          <div className={styles.mealSubItemFoods}>
                            {sub.items.map((item, itemIdx) => (
                              <span key={itemIdx} className={styles.mealSubItemFood}>
                                {item.food_name} - {item.quantity}{item.unit_type === 'ml' ? 'ml' : item.unit_type === 'gramas' ? 'g' : ` ${item.unit_type || 'g'}`}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </section>

        <div className={styles.saveSection}>
          <Button fullWidth onClick={handleSave} loading={saving} variant={saveStatus === 'success' ? 'primary' : saveStatus === 'error' ? 'danger' : 'primary'}>
            {saveStatus === 'success' ? <Check size={18} /> : saveStatus === 'error' ? <AlertCircle size={18} /> : <Save size={18} />}
            {saveStatus === 'success' ? 'Salvo com sucesso!' : saveStatus === 'error' ? 'Erro ao salvar' : 'Salvar Dieta'}
          </Button>
          {saveStatus === 'success' && lastSavedAt && (
            <p className={styles.savedTimestamp}>
              <Clock size={14} />
              Última atualização: {new Date(lastSavedAt).toLocaleString('pt-BR')}
            </p>
          )}
          {dietPlan?.updated_at && saveStatus === 'idle' && (
            <p className={styles.lastUpdated}>
              <Clock size={14} />
              Última atualização: {new Date(dietPlan.updated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </main>

      {showTemplateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTemplateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Selecionar Template de Dieta</h3>
              <button onClick={() => setShowTemplateModal(false)} className={styles.modalCloseBtn}>
                ×
              </button>
            </div>
            <div className={styles.modalContent}>
              {loadingTemplates ? (
                <p className={styles.modalLoading}>Carregando templates...</p>
              ) : templates.length === 0 ? (
                <p className={styles.modalEmpty}>Nenhum template cadastrado. Crie templates na Biblioteca.</p>
              ) : (
                <div className={styles.templateList}>
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      className={styles.templateItem}
                      onClick={() => applyTemplate(template.id)}
                    >
                      <span className={styles.templateItemName}>{template.name}</span>
                      {template.description && (
                        <span className={styles.templateItemDesc}>{template.description}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className={styles.modalWarning}>
              Atenção: Aplicar um template substituirá todas as refeições atuais.
            </p>
          </div>
        </div>
      )}

      {/* Modal de Substituições */}
      {showSubstitutionModal && editingFoodName && (
        <div className={styles.modalOverlay} onClick={closeSubstitutionModal}>
          <div className={styles.substitutionModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Substituicoes para: {editingFoodName}</h3>
              <button onClick={closeSubstitutionModal} className={styles.modalCloseBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalContent}>
              {/* Lista de substituições existentes */}
              <div className={styles.substitutionList}>
                <p className={styles.substitutionListLabel}>Substitutos cadastrados:</p>
                {getSubstitutionsForFood(editingFoodName).length === 0 ? (
                  <p className={styles.noSubstitutions}>Nenhuma substituicao cadastrada.</p>
                ) : (
                  getSubstitutionsForFood(editingFoodName).map((sub) => (
                    <div key={sub.id} className={styles.substitutionItem}>
                      <span className={styles.substitutionItemText}>
                        {sub.substitute_food} ({sub.substitute_quantity}g)
                      </span>
                      <button
                        className={styles.substitutionItemDelete}
                        onClick={() => removeSubstitution(sub.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Adicionar nova substituição */}
              <div className={styles.addSubstitutionSection}>
                <p className={styles.addSubstitutionLabel}>Adicionar substituto:</p>
                <div className={styles.addSubstitutionRow}>
                  <div className={styles.addSubstitutionFood}>
                    <FoodSelect
                      value={newSubstituteFood}
                      onChange={setNewSubstituteFood}
                      onFoodSelect={handleSubstituteFoodSelect}
                      placeholder="Buscar alimento..."
                    />
                  </div>
                  <div className={styles.addSubstitutionQty}>
                    <Input
                      type="number"
                      value={newSubstituteQty}
                      onChange={(e) => setNewSubstituteQty(e.target.value)}
                      placeholder="g"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={addSubstitution}
                    disabled={!newSubstituteFood || !newSubstituteQty}
                  >
                    <Plus size={16} />
                  </Button>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <Button variant="outline" onClick={closeSubstitutionModal}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Substituição de Refeição */}
      {showMealSubModal && editingMealIndex !== null && (
        <div className={styles.modalOverlay} onClick={closeMealSubModal}>
          <div className={styles.mealSubModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>
                {editingMealSubIndex !== null ? 'Editar' : 'Nova'} Opcao de Refeicao
              </h3>
              <button onClick={closeMealSubModal} className={styles.modalCloseBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalContent}>
              <div className={styles.mealSubNameField}>
                <label>Nome da opcao</label>
                <Input
                  type="text"
                  value={mealSubName}
                  onChange={(e) => setMealSubName(e.target.value)}
                  placeholder="Ex: Opcao 2, Alternativa..."
                />
              </div>

              <div className={styles.mealSubFoodsSection}>
                <div className={styles.mealSubFoodsHeader}>
                  <label>Alimentos desta opcao</label>
                  <button
                    type="button"
                    className={styles.addMealSubFoodBtn}
                    onClick={addMealSubFood}
                  >
                    <Plus size={14} />
                    Alimento
                  </button>
                </div>

                {mealSubFoods.length === 0 ? (
                  <p className={styles.noMealSubFoods}>
                    Clique em "Alimento" para adicionar.
                  </p>
                ) : (
                  <div className={styles.mealSubFoodsList}>
                    {mealSubFoods.map((food, idx) => (
                      <div key={idx} className={styles.mealSubFoodItem}>
                        <div className={styles.mealSubFoodSelect}>
                          <FoodSelect
                            value={food.food_name}
                            onChange={(name) => updateMealSubFood(idx, 'food_name', name)}
                            onFoodSelect={(selected) => handleMealSubFoodSelect(idx, selected)}
                            placeholder="Buscar alimento..."
                          />
                        </div>
                        <div className={styles.mealSubFoodUnit}>
                          <Select
                            value={food.unit_type || 'gramas'}
                            onChange={(e) => updateMealSubFood(idx, 'unit_type', e.target.value)}
                            options={UNIT_OPTIONS}
                          />
                        </div>
                        <div className={styles.mealSubFoodQty}>
                          <Input
                            type="number"
                            value={food.quantity}
                            onChange={(e) => updateMealSubFood(idx, 'quantity', e.target.value)}
                            placeholder={food.unit_type === 'gramas' ? 'g' : food.unit_type === 'ml' ? 'ml' : 'qtd'}
                          />
                        </div>
                        <button
                          type="button"
                          className={styles.mealSubFoodDelete}
                          onClick={() => removeMealSubFood(idx)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.modalFooter}>
              <Button variant="outline" onClick={closeMealSubModal}>
                Cancelar
              </Button>
              <Button onClick={saveMealSubstitution} disabled={!mealSubName.trim()}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
