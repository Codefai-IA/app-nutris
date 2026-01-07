import { useState, useEffect } from 'react';
import { Search, Plus, X, Trash2, Clock, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input, Card, Button, FoodSelect, Select } from '../ui';
import type { TabelaTaco } from '../../types/database';
import styles from './DietTemplatesManager.module.css';

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

interface TemplateFood {
  id: string;
  template_meal_id: string;
  food_name: string;
  quantity: string;
  order_index: number;
}

interface TemplateMeal {
  id: string;
  template_id: string;
  name: string;
  suggested_time: string | null;
  order_index: number;
  foods: TemplateFood[];
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
      const mealsWithFoods: TemplateMeal[] = mealsData.map(meal => ({
        ...meal,
        foods: (meal.diet_template_meal_foods || []).sort(
          (a: TemplateFood, b: TemplateFood) => a.order_index - b.order_index
        )
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

      // Insert meals and foods
      for (const meal of templateMeals) {
        const { data: mealData, error: mealError } = await supabase
          .from('diet_template_meals')
          .insert({
            template_id: templateId,
            name: meal.name,
            suggested_time: meal.suggested_time,
            order_index: meal.order_index
          })
          .select('id')
          .single();

        if (mealError) throw mealError;

        if (meal.foods.length > 0) {
          const foodsToInsert = meal.foods.map(food => ({
            template_meal_id: mealData.id,
            food_name: food.food_name,
            quantity: food.quantity,
            order_index: food.order_index
          }));

          const { error: foodsError } = await supabase
            .from('diet_template_meal_foods')
            .insert(foodsToInsert);

          if (foodsError) throw foodsError;
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
      foods: []
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

  function addFood(mealIndex: number) {
    const updated = [...templateMeals];
    const newFood: TemplateFood = {
      id: `new-${Date.now()}`,
      template_meal_id: updated[mealIndex].id,
      food_name: '',
      quantity: '',
      order_index: updated[mealIndex].foods.length
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

  function handleFoodSelect(mealIndex: number, foodIndex: number, selectedFood: TabelaTaco) {
    const updated = [...templateMeals];
    updated[mealIndex].foods[foodIndex] = {
      ...updated[mealIndex].foods[foodIndex],
      food_name: selectedFood.alimento
    };
    setTemplateMeals(updated);
  }

  function removeFood(mealIndex: number, foodIndex: number) {
    const updated = [...templateMeals];
    updated[mealIndex].foods = updated[mealIndex].foods.filter((_, i) => i !== foodIndex);
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
                          <div className={styles.quantityWrapper}>
                            <Input
                              type="number"
                              value={food.quantity}
                              onChange={(e) => updateFood(mealIndex, foodIndex, 'quantity', e.target.value)}
                              placeholder="g"
                            />
                          </div>
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
    </div>
  );
}
