import { useState, useEffect } from 'react';
import { Search, Plus, X, Trash2, Clock, ChevronDown, ChevronUp, Copy, RefreshCw, Layers } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input, Card, Button, FoodSelect, Select } from '../ui';
import type { TabelaTaco, TemplateFoodSubstitution, UnitType, MealSubstitution, MealSubstitutionItem } from '../../types/database';
import styles from './DietTemplatesManager.module.css';

const UNIT_OPTIONS = [
  { value: 'gramas', label: 'Gramas (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'fatia', label: 'Fatia' },
];

const MEAL_OPTIONS = [
  { value: 'Cafe da Manha', label: 'Cafe da Manha' },
  { value: 'Lanche da Manha', label: 'Lanche da Manha' },
  { value: 'Almoco', label: 'Almoco' },
  { value: 'Lanche da Tarde', label: 'Lanche da Tarde' },
  { value: 'Jantar', label: 'Jantar' },
  { value: 'Ceia', label: 'Ceia' },
  { value: 'Pre-Treino', label: 'Pre-Treino' },
  { value: 'Pos-Treino', label: 'Pos-Treino' },
];

interface LocalSubstitution {
  id: string;
  template_food_id: string;
  substitute_food: string;
  substitute_quantity: string;
  isNew?: boolean;
  isDeleted?: boolean;
}

interface TemplateFood {
  id: string;
  template_meal_id: string;
  food_name: string;
  quantity: string;
  order_index: number;
  substitutions?: LocalSubstitution[];
  unit_type: UnitType;
  quantity_units: number | null;
  peso_por_unidade?: number; // Nao salvo no banco, usado para calculo
}

interface TemplateMeal {
  id: string;
  template_id: string;
  name: string;
  suggested_time: string | null;
  order_index: number;
  foods: TemplateFood[];
  meal_substitutions: MealSubstitution[];
}

interface DietTemplate {
  id: string;
  name: string;
  description: string | null;
  daily_calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  water_goal_liters: number;
  created_at: string;
  updated_at: string;
  meals?: TemplateMeal[];
}

export function DietTemplatesManager() {
  const [templates, setTemplates] = useState<DietTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<DietTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    water_goal_liters: '2.0'
  });

  const [templateMeals, setTemplateMeals] = useState<TemplateMeal[]>([]);

  // Substituicoes
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [editingFood, setEditingFood] = useState<{ mealIndex: number; foodIndex: number; foodId: string; foodName: string } | null>(null);
  const [newSubstituteFood, setNewSubstituteFood] = useState('');
  const [newSubstituteQty, setNewSubstituteQty] = useState('');

  // Meal Substitutions state
  const [showMealSubModal, setShowMealSubModal] = useState(false);
  const [editingMealIndex, setEditingMealIndex] = useState<number | null>(null);
  const [editingMealSubIndex, setEditingMealSubIndex] = useState<number | null>(null);
  const [mealSubName, setMealSubName] = useState('');
  const [mealSubFoods, setMealSubFoods] = useState<MealSubstitutionItem[]>([]);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const { data, error } = await supabase
      .from('diet_templates')
      .select('*')
      .order('name');

    if (error) {
      console.error('Error loading templates:', error);
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }

  async function loadTemplateDetails(templateId: string) {
    const { data: mealsData } = await supabase
      .from('diet_template_meals')
      .select(`
        *,
        diet_template_meal_foods (*)
      `)
      .eq('template_id', templateId)
      .order('order_index');

    if (mealsData) {
      // Coletar todos os IDs de alimentos para buscar substituicoes
      const allFoodIds: string[] = [];
      mealsData.forEach(meal => {
        (meal.diet_template_meal_foods || []).forEach((food: TemplateFood) => {
          if (food.id && !food.id.startsWith('new-')) {
            allFoodIds.push(food.id);
          }
        });
      });

      // Buscar substituicoes se houver alimentos
      let substitutionsMap = new Map<string, LocalSubstitution[]>();
      if (allFoodIds.length > 0) {
        const { data: subsData } = await supabase
          .from('diet_template_food_substitutions')
          .select('*')
          .in('template_food_id', allFoodIds);

        if (subsData) {
          subsData.forEach((sub: TemplateFoodSubstitution) => {
            const existing = substitutionsMap.get(sub.template_food_id) || [];
            existing.push({
              id: sub.id,
              template_food_id: sub.template_food_id,
              substitute_food: sub.substitute_food,
              substitute_quantity: sub.substitute_quantity,
            });
            substitutionsMap.set(sub.template_food_id, existing);
          });
        }
      }

      // Coletar nomes de alimentos para buscar peso_por_unidade
      const allFoodNames = new Set<string>();
      mealsData.forEach(meal => {
        (meal.diet_template_meal_foods || []).forEach((food: TemplateFood) => {
          if (food.food_name) allFoodNames.add(food.food_name);
        });
      });

      // Buscar peso_por_unidade de food_metadata via tabela_taco
      let pesoMap = new Map<string, number>();
      if (allFoodNames.size > 0) {
        const { data: tacoData } = await supabase
          .from('tabela_taco')
          .select('alimento, food_metadata(peso_por_unidade)')
          .in('alimento', Array.from(allFoodNames));

        if (tacoData) {
          tacoData.forEach((item: any) => {
            if (item.food_metadata?.peso_por_unidade) {
              pesoMap.set(item.alimento, item.food_metadata.peso_por_unidade);
            }
          });
        }
      }

      const mealsWithFoods: TemplateMeal[] = mealsData.map(meal => ({
        ...meal,
        meal_substitutions: meal.meal_substitutions || [],
        foods: (meal.diet_template_meal_foods || [])
          .sort((a: TemplateFood, b: TemplateFood) => a.order_index - b.order_index)
          .map((food: TemplateFood) => ({
            ...food,
            substitutions: substitutionsMap.get(food.id) || [],
            unit_type: food.unit_type || 'gramas',
            quantity_units: food.quantity_units || null,
            peso_por_unidade: pesoMap.get(food.food_name) || undefined,
          }))
      }));
      return mealsWithFoods;
    }
    return [];
  }

  async function handleExpandTemplate(templateId: string) {
    if (expandedTemplate === templateId) {
      setExpandedTemplate(null);
      return;
    }

    const meals = await loadTemplateDetails(templateId);
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, meals } : t
    ));
    setExpandedTemplate(templateId);
  }

  function handleEdit(template: DietTemplate) {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      water_goal_liters: template.water_goal_liters?.toString() || '2.0'
    });

    if (template.meals) {
      setTemplateMeals(template.meals);
    } else {
      loadTemplateDetails(template.id).then(meals => {
        setTemplateMeals(meals);
      });
    }

    setShowModal(true);
  }

  function handleNew() {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      water_goal_liters: '2.0'
    });
    setTemplateMeals([]);
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert('Nome do template e obrigatorio');
      return;
    }

    setSaving(true);

    try {
      let templateId: string;

      if (editingTemplate) {
        const { error } = await supabase
          .from('diet_templates')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            water_goal_liters: parseFloat(formData.water_goal_liters) || 2.0
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        templateId = editingTemplate.id;

        // Delete existing meals and foods
        await supabase
          .from('diet_template_meals')
          .delete()
          .eq('template_id', templateId);
      } else {
        const { data, error } = await supabase
          .from('diet_templates')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null,
            water_goal_liters: parseFloat(formData.water_goal_liters) || 2.0
          })
          .select('id')
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Insert meals, foods and substitutions
      for (const meal of templateMeals) {
        const { data: mealData, error: mealError } = await supabase
          .from('diet_template_meals')
          .insert({
            template_id: templateId,
            name: meal.name,
            suggested_time: meal.suggested_time,
            order_index: meal.order_index,
            meal_substitutions: meal.meal_substitutions || [],
          })
          .select('id')
          .single();

        if (mealError) throw mealError;

        // Inserir cada alimento individualmente para obter o ID e salvar substituicoes
        for (const food of meal.foods) {
          const { data: foodData, error: foodError } = await supabase
            .from('diet_template_meal_foods')
            .insert({
              template_meal_id: mealData.id,
              food_name: food.food_name,
              quantity: food.quantity,
              order_index: food.order_index,
              unit_type: food.unit_type || 'gramas',
              quantity_units: food.quantity_units,
            })
            .select('id')
            .single();

          if (foodError) throw foodError;

          // Salvar substituicoes do alimento (apenas as nao deletadas)
          const subsToSave = (food.substitutions || []).filter(sub => !sub.isDeleted);
          if (subsToSave.length > 0) {
            const subsToInsert = subsToSave.map(sub => ({
              template_food_id: foodData.id,
              substitute_food: sub.substitute_food,
              substitute_quantity: sub.substitute_quantity
            }));

            const { error: subsError } = await supabase
              .from('diet_template_food_substitutions')
              .insert(subsToInsert);

            if (subsError) throw subsError;
          }
        }
      }

      resetForm();
      await loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(template: DietTemplate) {
    if (!confirm(`Excluir template "${template.name}"?`)) return;

    const { error } = await supabase
      .from('diet_templates')
      .delete()
      .eq('id', template.id);

    if (error) {
      console.error('Error deleting template:', error);
      alert('Erro ao excluir template');
    } else {
      loadTemplates();
    }
  }

  async function handleDuplicate(template: DietTemplate) {
    const meals = template.meals || await loadTemplateDetails(template.id);

    const { data, error } = await supabase
      .from('diet_templates')
      .insert({
        name: `${template.name} (Copia)`,
        description: template.description,
        water_goal_liters: template.water_goal_liters
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error duplicating template:', error);
      alert('Erro ao duplicar template');
      return;
    }

    for (const meal of meals) {
      const { data: mealData, error: mealError } = await supabase
        .from('diet_template_meals')
        .insert({
          template_id: data.id,
          name: meal.name,
          suggested_time: meal.suggested_time,
          order_index: meal.order_index
        })
        .select('id')
        .single();

      if (mealError) continue;

      if (meal.foods.length > 0) {
        await supabase
          .from('diet_template_meal_foods')
          .insert(meal.foods.map(food => ({
            template_meal_id: mealData.id,
            food_name: food.food_name,
            quantity: food.quantity,
            order_index: food.order_index
          })));
      }
    }

    loadTemplates();
  }

  function resetForm() {
    setFormData({ name: '', description: '', water_goal_liters: '2.0' });
    setTemplateMeals([]);
    setEditingTemplate(null);
    setShowModal(false);
  }

  function addMeal() {
    const newMeal: TemplateMeal = {
      id: `new-${Date.now()}`,
      template_id: editingTemplate?.id || '',
      name: '',
      suggested_time: null,
      order_index: templateMeals.length,
      foods: [],
      meal_substitutions: [],
    };
    setTemplateMeals([...templateMeals, newMeal]);
  }

  function updateMeal(index: number, field: keyof TemplateMeal, value: string | null) {
    const updated = [...templateMeals];
    updated[index] = { ...updated[index], [field]: value };
    setTemplateMeals(updated);
  }

  function removeMeal(index: number) {
    setTemplateMeals(templateMeals.filter((_, i) => i !== index));
  }

  function duplicateMeal(index: number) {
    const mealToDuplicate = templateMeals[index];
    const timestamp = Date.now();

    // Deep copy foods with new IDs
    const duplicatedFoods: TemplateFood[] = mealToDuplicate.foods.map((food, foodIdx) => ({
      ...food,
      id: `new-${timestamp}-food-${foodIdx}`,
      template_meal_id: '',
      substitutions: (food.substitutions || []).map((sub, subIdx) => ({
        ...sub,
        id: `new-${timestamp}-sub-${foodIdx}-${subIdx}`,
        template_food_id: '',
        isNew: true,
      })),
    }));

    // Deep copy meal substitutions with new IDs
    const duplicatedMealSubs = mealToDuplicate.meal_substitutions.map((sub, subIdx) => ({
      ...sub,
      id: `sub-${timestamp}-${subIdx}`,
    }));

    const duplicatedMeal: TemplateMeal = {
      id: `new-${timestamp}`,
      template_id: editingTemplate?.id || '',
      name: mealToDuplicate.name,
      suggested_time: mealToDuplicate.suggested_time,
      order_index: templateMeals.length,
      foods: duplicatedFoods,
      meal_substitutions: duplicatedMealSubs,
    };

    setTemplateMeals([...templateMeals, duplicatedMeal]);
  }

  function addFood(mealIndex: number) {
    const updated = [...templateMeals];
    const newFood: TemplateFood = {
      id: `new-${Date.now()}`,
      template_meal_id: updated[mealIndex].id,
      food_name: '',
      quantity: '',
      order_index: updated[mealIndex].foods.length,
      substitutions: [],
      unit_type: 'gramas',
      quantity_units: null,
    };
    updated[mealIndex].foods.push(newFood);
    setTemplateMeals(updated);
  }

  function updateFood(mealIndex: number, foodIndex: number, field: keyof TemplateFood, value: string) {
    const updated = [...templateMeals];
    updated[mealIndex].foods[foodIndex] = {
      ...updated[mealIndex].foods[foodIndex],
      [field]: value
    };
    setTemplateMeals(updated);
  }

  async function handleFoodSelect(mealIndex: number, foodIndex: number, selectedFood: TabelaTaco) {
    // Buscar peso_por_unidade do food_metadata
    const { data: metadata } = await supabase
      .from('food_metadata')
      .select('peso_por_unidade')
      .eq('taco_id', selectedFood.id)
      .maybeSingle();

    const updated = [...templateMeals];
    updated[mealIndex].foods[foodIndex] = {
      ...updated[mealIndex].foods[foodIndex],
      food_name: selectedFood.alimento,
      unit_type: 'gramas',
      quantity_units: null,
      peso_por_unidade: metadata?.peso_por_unidade || undefined,
    };
    setTemplateMeals(updated);
  }

  function removeFood(mealIndex: number, foodIndex: number) {
    const updated = [...templateMeals];
    updated[mealIndex].foods = updated[mealIndex].foods.filter((_, i) => i !== foodIndex);
    setTemplateMeals(updated);
  }

  function handleUnitTypeChange(mealIndex: number, foodIndex: number, unitType: UnitType) {
    const updated = [...templateMeals];
    const food = updated[mealIndex].foods[foodIndex];

    if (unitType === 'gramas') {
      // Voltando para gramas
      food.unit_type = 'gramas';
      food.quantity_units = null;
    } else {
      // Mudando para unidade/fatia
      food.unit_type = unitType;
      food.quantity_units = null;
      food.quantity = '';
    }

    setTemplateMeals(updated);
  }

  function handleQuantityChange(mealIndex: number, foodIndex: number, value: string) {
    const updated = [...templateMeals];
    const food = updated[mealIndex].foods[foodIndex];

    if (food.unit_type === 'gramas') {
      // Entrada em gramas
      food.quantity = value;
      food.quantity_units = null;
    } else {
      // Entrada em unidades - calcular gramas
      const units = parseFloat(value) || 0;
      food.quantity_units = units;
      if (food.peso_por_unidade && units > 0) {
        food.quantity = String(Math.round(units * food.peso_por_unidade));
      } else {
        food.quantity = '';
      }
    }

    setTemplateMeals(updated);
  }

  // Funcoes de substituicao
  function getSubstitutionsForFood(mealIndex: number, foodIndex: number): LocalSubstitution[] {
    const food = templateMeals[mealIndex]?.foods[foodIndex];
    if (!food) return [];
    return (food.substitutions || []).filter(sub => !sub.isDeleted);
  }

  function openSubstitutionModal(mealIndex: number, foodIndex: number) {
    const food = templateMeals[mealIndex]?.foods[foodIndex];
    if (!food || !food.food_name) return;

    setEditingFood({
      mealIndex,
      foodIndex,
      foodId: food.id,
      foodName: food.food_name
    });
    setNewSubstituteFood('');
    setNewSubstituteQty('');
    setShowSubstitutionModal(true);
  }

  function closeSubstitutionModal() {
    setShowSubstitutionModal(false);
    setEditingFood(null);
    setNewSubstituteFood('');
    setNewSubstituteQty('');
  }

  function addSubstitution() {
    if (!editingFood || !newSubstituteFood || !newSubstituteQty) return;

    const { mealIndex, foodIndex, foodId } = editingFood;
    const updated = [...templateMeals];
    const food = updated[mealIndex].foods[foodIndex];

    const newSub: LocalSubstitution = {
      id: `new-${Date.now()}`,
      template_food_id: foodId,
      substitute_food: newSubstituteFood,
      substitute_quantity: newSubstituteQty,
      isNew: true
    };

    food.substitutions = [...(food.substitutions || []), newSub];
    setTemplateMeals(updated);
    setNewSubstituteFood('');
    setNewSubstituteQty('');
  }

  function removeSubstitution(subId: string) {
    if (!editingFood) return;

    const { mealIndex, foodIndex } = editingFood;
    const updated = [...templateMeals];
    const food = updated[mealIndex].foods[foodIndex];

    food.substitutions = (food.substitutions || []).map(sub =>
      sub.id === subId
        ? sub.isNew
          ? { ...sub, isDeleted: true }
          : { ...sub, isDeleted: true }
        : sub
    ).filter(sub => !(sub.isNew && sub.isDeleted));

    setTemplateMeals(updated);
  }

  function handleSubstituteFoodSelect(selectedFood: TabelaTaco) {
    setNewSubstituteFood(selectedFood.alimento);
  }

  // Meal Substitution functions
  function openMealSubModal(mealIndex: number, subIndex: number | null = null) {
    setEditingMealIndex(mealIndex);
    setEditingMealSubIndex(subIndex);

    if (subIndex !== null && templateMeals[mealIndex].meal_substitutions[subIndex]) {
      const sub = templateMeals[mealIndex].meal_substitutions[subIndex];
      setMealSubName(sub.name);
      setMealSubFoods([...sub.items]);
    } else {
      const existingCount = templateMeals[mealIndex].meal_substitutions.length;
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
        ? templateMeals[editingMealIndex].meal_substitutions[editingMealSubIndex].id
        : `sub-${Date.now()}`,
      name: mealSubName.trim(),
      items: mealSubFoods.filter(f => f.food_name.trim() !== ''),
    };

    const updated = [...templateMeals];
    if (editingMealSubIndex !== null) {
      updated[editingMealIndex].meal_substitutions[editingMealSubIndex] = newSub;
    } else {
      updated[editingMealIndex].meal_substitutions.push(newSub);
    }
    setTemplateMeals(updated);
    closeMealSubModal();
  }

  function removeMealSubstitution(mealIndex: number, subIndex: number) {
    const updated = [...templateMeals];
    updated[mealIndex].meal_substitutions = updated[mealIndex].meal_substitutions.filter((_, i) => i !== subIndex);
    setTemplateMeals(updated);
  }

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.actionsBar}>
        <div className={styles.searchWrapper}>
          <Input
            type="text"
            placeholder="Buscar template..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search size={18} />}
          />
        </div>
        <button onClick={handleNew} className={styles.addButton}>
          <Plus size={18} />
          <span>Novo Template</span>
        </button>
      </div>

      <div className={styles.stats}>
        <p>Total: <strong>{templates.length}</strong> templates de dieta</p>
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando...</div>
      ) : filteredTemplates.length === 0 ? (
        <div className={styles.empty}>
          {searchTerm ? 'Nenhum template encontrado' : 'Nenhum template cadastrado'}
        </div>
      ) : (
        <div className={styles.list}>
          {filteredTemplates.map((template) => (
            <Card key={template.id} className={styles.templateCard}>
              <div className={styles.templateHeader} onClick={() => handleExpandTemplate(template.id)}>
                <div className={styles.templateInfo}>
                  <h4 className={styles.templateName}>{template.name}</h4>
                  {template.description && (
                    <p className={styles.templateDesc}>{template.description}</p>
                  )}
                </div>
                <button className={styles.expandBtn}>
                  {expandedTemplate === template.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </button>
              </div>

              {expandedTemplate === template.id && template.meals && (
                <div className={styles.templateDetails}>
                  {template.meals.length === 0 ? (
                    <p className={styles.noMeals}>Nenhuma refeicao cadastrada</p>
                  ) : (
                    template.meals.map((meal) => (
                      <div key={meal.id} className={styles.mealPreview}>
                        <div className={styles.mealPreviewHeader}>
                          <span className={styles.mealPreviewName}>{meal.name}</span>
                          {meal.suggested_time && (
                            <span className={styles.mealPreviewTime}>
                              <Clock size={14} /> {meal.suggested_time}
                            </span>
                          )}
                        </div>
                        {meal.foods.length > 0 && (
                          <ul className={styles.foodPreviewList}>
                            {meal.foods.map((food) => (
                              <li key={food.id}>
                                {food.food_name} - {food.quantity}g
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              <div className={styles.templateActions}>
                <button onClick={() => handleEdit(template)} className={styles.editBtn}>
                  Editar
                </button>
                <button onClick={() => handleDuplicate(template)} className={styles.duplicateBtn}>
                  <Copy size={16} />
                </button>
                <button onClick={() => handleDelete(template)} className={styles.deleteBtn}>
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={resetForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingTemplate ? 'Editar Template' : 'Novo Template de Dieta'}</h3>
              <button onClick={resetForm} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Nome do Template *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Dieta Low Carb"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Descricao</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descricao do template..."
                  rows={2}
                />
              </div>

              <div className={styles.formGroup}>
                <label>Meta de Agua (litros)</label>
                <input
                  type="number"
                  step="0.5"
                  value={formData.water_goal_liters}
                  onChange={(e) => setFormData({ ...formData, water_goal_liters: e.target.value })}
                />
              </div>

              <div className={styles.mealsSection}>
                <div className={styles.mealsSectionHeader}>
                  <h4>Refeicoes</h4>
                  <Button type="button" size="sm" variant="outline" onClick={addMeal}>
                    <Plus size={16} />
                    Refeicao
                  </Button>
                </div>

                {templateMeals.map((meal, mealIndex) => (
                  <Card key={meal.id} className={styles.mealCard}>
                    <div className={styles.mealHeader}>
                      <Select
                        value={meal.name}
                        onChange={(e) => updateMeal(mealIndex, 'name', e.target.value)}
                        options={MEAL_OPTIONS}
                        placeholder="Selecione..."
                      />
                      <div className={styles.mealTime}>
                        <Clock size={16} />
                        <Input
                          type="time"
                          value={meal.suggested_time || ''}
                          onChange={(e) => updateMeal(mealIndex, 'suggested_time', e.target.value || null)}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => duplicateMeal(mealIndex)}
                        className={styles.duplicateMealBtn}
                        title="Duplicar refeição"
                      >
                        <Copy size={16} />
                      </button>
                      <button type="button" onClick={() => removeMeal(mealIndex)} className={styles.removeMealBtn}>
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className={styles.foodsList}>
                      {meal.foods.map((food, foodIndex) => (
                        <div key={food.id} className={styles.foodItem}>
                          <div className={styles.foodSelectWrapper}>
                            <FoodSelect
                              value={food.food_name}
                              onChange={(name) => updateFood(mealIndex, foodIndex, 'food_name', name)}
                              onFoodSelect={(selected) => handleFoodSelect(mealIndex, foodIndex, selected)}
                              placeholder="Buscar alimento..."
                            />
                          </div>
                          <div className={styles.unitWrapper}>
                            <Select
                              value={food.unit_type || 'gramas'}
                              onChange={(e) => handleUnitTypeChange(mealIndex, foodIndex, e.target.value as UnitType)}
                              options={UNIT_OPTIONS}
                            />
                          </div>
                          <div className={styles.quantityWrapper}>
                            <Input
                              type="number"
                              value={food.unit_type === 'gramas' ? food.quantity : (food.quantity_units?.toString() || '')}
                              onChange={(e) => handleQuantityChange(mealIndex, foodIndex, e.target.value)}
                              placeholder={food.unit_type === 'gramas' ? 'g' : 'qtd'}
                            />
                          </div>
                          {/* Mostrar equivalente em gramas quando usar unidades */}
                          {food.unit_type !== 'gramas' && food.quantity && (
                            <span className={styles.gramEquivalent}>= {food.quantity}g</span>
                          )}
                          {food.food_name && (
                            <button
                              type="button"
                              onClick={() => openSubstitutionModal(mealIndex, foodIndex)}
                              className={styles.substitutionButton}
                              title="Gerenciar substituicoes"
                            >
                              <RefreshCw size={14} />
                              {getSubstitutionsForFood(mealIndex, foodIndex).length > 0 && (
                                <span className={styles.substitutionBadge}>
                                  {getSubstitutionsForFood(mealIndex, foodIndex).length}
                                </span>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeFood(mealIndex, foodIndex)}
                            className={styles.removeFoodBtn}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button type="button" onClick={() => addFood(mealIndex)} className={styles.addFoodBtn}>
                      <Plus size={14} />
                      Alimento
                    </button>

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
                ))}

                {templateMeals.length === 0 && (
                  <p className={styles.noMealsMsg}>Clique em "Refeicao" para adicionar</p>
                )}
              </div>

              <div className={styles.formActions}>
                <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={styles.submitBtn}>
                  {saving ? 'Salvando...' : editingTemplate ? 'Atualizar' : 'Criar Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Substituicoes */}
      {showSubstitutionModal && editingFood && (
        <div className={styles.modalOverlay} onClick={closeSubstitutionModal}>
          <div className={styles.substitutionModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Substituicoes: {editingFood.foodName}</h3>
              <button onClick={closeSubstitutionModal} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalContent}>
              {/* Lista de substituicoes existentes */}
              <div className={styles.substitutionList}>
                <p className={styles.substitutionListLabel}>Substitutos cadastrados:</p>
                {getSubstitutionsForFood(editingFood.mealIndex, editingFood.foodIndex).length === 0 ? (
                  <p className={styles.noSubstitutions}>Nenhuma substituicao cadastrada.</p>
                ) : (
                  getSubstitutionsForFood(editingFood.mealIndex, editingFood.foodIndex).map((sub) => (
                    <div key={sub.id} className={styles.substitutionItem}>
                      <span className={styles.substitutionItemText}>
                        {sub.substitute_food} ({sub.substitute_quantity}g)
                      </span>
                      <button
                        type="button"
                        className={styles.substitutionItemDelete}
                        onClick={() => removeSubstitution(sub.id)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Adicionar nova substituicao */}
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
                    type="button"
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
              <Button type="button" variant="outline" onClick={closeSubstitutionModal}>
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
              <button onClick={closeMealSubModal} className={styles.closeBtn}>
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
              <Button type="button" variant="outline" onClick={closeMealSubModal}>
                Cancelar
              </Button>
              <Button type="button" onClick={saveMealSubstitution} disabled={!mealSubName.trim()}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
