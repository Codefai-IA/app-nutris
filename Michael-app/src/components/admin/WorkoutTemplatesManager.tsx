import { useState, useEffect } from 'react';
import { Search, Plus, X, Trash2, ChevronDown, ChevronUp, Copy, GripVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input, Card, Button, ExerciseSelect } from '../ui';
import { TRAINING_TECHNIQUES, EFFORT_PARAMETERS } from '../../constants/trainingTechniques';
import styles from './WorkoutTemplatesManager.module.css';

const DAYS = ['Domingo', 'Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado'];

const REST_TIME_OPTIONS = [
  { value: '45s', label: '45 segundos' },
  { value: '1min', label: '1 minuto' },
  { value: '1min30s', label: '1 minuto e meio' },
  { value: '2min', label: '2 minutos' },
  { value: '2min30s', label: '2 minutos e meio' },
  { value: '3min', label: '3 minutos' },
];

interface TemplateExercise {
  id: string;
  template_day_id: string;
  name: string;
  sets: number;
  reps: string;
  rest: string | null;
  weight_kg: number | null;
  video_url: string | null;
  notes: string | null;
  order_index: number;
  technique_id: string | null;
  effort_parameter_id: string | null;
}

interface TemplateDay {
  id: string;
  template_id: string;
  day_of_week: number;
  workout_type: string | null;
  exercises: TemplateExercise[];
}

interface WorkoutTemplate {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  days?: TemplateDay[];
}

export function WorkoutTemplatesManager() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkoutTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  const [templateDays, setTemplateDays] = useState<TemplateDay[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    setLoading(true);
    const { data, error } = await supabase
      .from('workout_templates')
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
    const { data: daysData } = await supabase
      .from('workout_template_days')
      .select(`
        *,
        workout_template_exercises (*)
      `)
      .eq('template_id', templateId);

    if (daysData) {
      const daysWithExercises: TemplateDay[] = daysData.map(day => ({
        ...day,
        exercises: (day.workout_template_exercises || []).sort(
          (a: TemplateExercise, b: TemplateExercise) => a.order_index - b.order_index
        )
      }));
      return daysWithExercises;
    }
    return [];
  }

  async function handleExpandTemplate(templateId: string) {
    if (expandedTemplate === templateId) {
      setExpandedTemplate(null);
      return;
    }

    const days = await loadTemplateDetails(templateId);
    setTemplates(prev => prev.map(t =>
      t.id === templateId ? { ...t, days } : t
    ));
    setExpandedTemplate(templateId);
  }

  function initializeTemplateDays(existingDays?: TemplateDay[]): TemplateDay[] {
    const days: TemplateDay[] = [];
    for (let i = 0; i < 7; i++) {
      const existing = existingDays?.find(d => d.day_of_week === i);
      if (existing) {
        days.push(existing);
      } else {
        days.push({
          id: `new-${i}`,
          template_id: '',
          day_of_week: i,
          workout_type: null,
          exercises: []
        });
      }
    }
    return days;
  }

  function handleEdit(template: WorkoutTemplate) {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || ''
    });

    if (template.days) {
      setTemplateDays(initializeTemplateDays(template.days));
    } else {
      loadTemplateDetails(template.id).then(days => {
        setTemplateDays(initializeTemplateDays(days));
      });
    }

    setSelectedDay(1);
    setShowModal(true);
  }

  function handleNew() {
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: ''
    });
    setTemplateDays(initializeTemplateDays());
    setSelectedDay(1);
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
          .from('workout_templates')
          .update({
            name: formData.name.trim(),
            description: formData.description.trim() || null
          })
          .eq('id', editingTemplate.id);

        if (error) throw error;
        templateId = editingTemplate.id;

        // Delete existing days
        await supabase
          .from('workout_template_days')
          .delete()
          .eq('template_id', templateId);
      } else {
        const { data, error } = await supabase
          .from('workout_templates')
          .insert({
            name: formData.name.trim(),
            description: formData.description.trim() || null
          })
          .select('id')
          .single();

        if (error) throw error;
        templateId = data.id;
      }

      // Insert days and exercises
      for (const day of templateDays) {
        // Skip empty days
        if (!day.workout_type && day.exercises.length === 0) continue;

        const { data: dayData, error: dayError } = await supabase
          .from('workout_template_days')
          .insert({
            template_id: templateId,
            day_of_week: day.day_of_week,
            workout_type: day.workout_type
          })
          .select('id')
          .single();

        if (dayError) throw dayError;

        if (day.exercises.length > 0) {
          const exercisesToInsert = day.exercises
            .filter(ex => ex.name && ex.name.trim())
            .map(ex => ({
              template_day_id: dayData.id,
              name: ex.name,
              sets: ex.sets,
              reps: ex.reps,
              rest: ex.rest,
              weight_kg: ex.weight_kg,
              video_url: ex.video_url,
              notes: ex.notes,
              order_index: ex.order_index,
              technique_id: ex.technique_id,
              effort_parameter_id: ex.effort_parameter_id
            }));

          if (exercisesToInsert.length > 0) {
            const { error: exError } = await supabase
              .from('workout_template_exercises')
              .insert(exercisesToInsert);

            if (exError) throw exError;
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

  async function handleDelete(template: WorkoutTemplate) {
    if (!confirm(`Excluir template "${template.name}"?`)) return;

    const { error } = await supabase
      .from('workout_templates')
      .delete()
      .eq('id', template.id);

    if (error) {
      console.error('Error deleting template:', error);
      alert('Erro ao excluir template');
    } else {
      loadTemplates();
    }
  }

  async function handleDuplicate(template: WorkoutTemplate) {
    const days = template.days || await loadTemplateDetails(template.id);

    const { data, error } = await supabase
      .from('workout_templates')
      .insert({
        name: `${template.name} (Copia)`,
        description: template.description
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error duplicating template:', error);
      alert('Erro ao duplicar template');
      return;
    }

    for (const day of days) {
      if (!day.workout_type && day.exercises.length === 0) continue;

      const { data: dayData, error: dayError } = await supabase
        .from('workout_template_days')
        .insert({
          template_id: data.id,
          day_of_week: day.day_of_week,
          workout_type: day.workout_type
        })
        .select('id')
        .single();

      if (dayError) continue;

      if (day.exercises.length > 0) {
        await supabase
          .from('workout_template_exercises')
          .insert(day.exercises.map(ex => ({
            template_day_id: dayData.id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest,
            weight_kg: ex.weight_kg,
            video_url: ex.video_url,
            notes: ex.notes,
            order_index: ex.order_index,
            technique_id: ex.technique_id,
            effort_parameter_id: ex.effort_parameter_id
          })));
      }
    }

    loadTemplates();
  }

  function resetForm() {
    setFormData({ name: '', description: '' });
    setTemplateDays([]);
    setEditingTemplate(null);
    setShowModal(false);
  }

  function getCurrentDay() {
    return templateDays.find(d => d.day_of_week === selectedDay);
  }

  function updateDayType(type: string) {
    setTemplateDays(prev => prev.map(d =>
      d.day_of_week === selectedDay ? { ...d, workout_type: type } : d
    ));
  }

  function addExercise() {
    const newExercise: TemplateExercise = {
      id: `new-${Date.now()}`,
      template_day_id: getCurrentDay()?.id || '',
      name: '',
      sets: 3,
      reps: '10-12',
      rest: null,
      weight_kg: null,
      video_url: null,
      notes: null,
      order_index: getCurrentDay()?.exercises.length || 0,
      technique_id: null,
      effort_parameter_id: null
    };

    setTemplateDays(prev => prev.map(d =>
      d.day_of_week === selectedDay
        ? { ...d, exercises: [...d.exercises, newExercise] }
        : d
    ));
  }

  function updateExercise(index: number, field: keyof TemplateExercise, value: string | number | null) {
    setTemplateDays(prev => prev.map(d =>
      d.day_of_week === selectedDay
        ? {
            ...d,
            exercises: d.exercises.map((e, i) =>
              i === index ? { ...e, [field]: value } : e
            )
          }
        : d
    ));
  }

  function updateExerciseFromLibrary(index: number, name: string, videoUrl: string | null) {
    setTemplateDays(prev => prev.map(d =>
      d.day_of_week === selectedDay
        ? {
            ...d,
            exercises: d.exercises.map((e, i) =>
              i === index ? { ...e, name, video_url: videoUrl } : e
            )
          }
        : d
    ));
  }

  function removeExercise(index: number) {
    setTemplateDays(prev => prev.map(d =>
      d.day_of_week === selectedDay
        ? { ...d, exercises: d.exercises.filter((_, i) => i !== index) }
        : d
    ));
  }

  const currentDay = getCurrentDay();

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
        <p>Total: <strong>{templates.length}</strong> templates de treino</p>
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

              {expandedTemplate === template.id && template.days && (
                <div className={styles.templateDetails}>
                  {template.days.filter(d => d.workout_type || d.exercises.length > 0).length === 0 ? (
                    <p className={styles.noDays}>Nenhum dia configurado</p>
                  ) : (
                    template.days
                      .filter(d => d.workout_type || d.exercises.length > 0)
                      .map((day) => (
                        <div key={day.id} className={styles.dayPreview}>
                          <div className={styles.dayPreviewHeader}>
                            <span className={styles.dayPreviewName}>{DAYS[day.day_of_week]}</span>
                            {day.workout_type && (
                              <span className={styles.dayPreviewType}>{day.workout_type}</span>
                            )}
                          </div>
                          {day.exercises.length > 0 && (
                            <ul className={styles.exercisePreviewList}>
                              {day.exercises.map((ex) => (
                                <li key={ex.id}>
                                  {ex.name} - {ex.sets}x{ex.reps}
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
              <h3>{editingTemplate ? 'Editar Template' : 'Novo Template de Treino'}</h3>
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
                  placeholder="Ex: Treino ABC"
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

              <div className={styles.daysSection}>
                <div className={styles.daysScroll}>
                  {DAYS.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      className={`${styles.dayTab} ${selectedDay === index ? styles.dayTabActive : ''}`}
                      onClick={() => setSelectedDay(index)}
                    >
                      {day.slice(0, 3)}
                    </button>
                  ))}
                </div>

                <Card className={styles.dayCard}>
                  <div className={styles.dayHeader}>
                    <label>Tipo de treino:</label>
                    <Input
                      value={currentDay?.workout_type || ''}
                      onChange={(e) => updateDayType(e.target.value)}
                      placeholder="Ex: Peito e Triceps"
                    />
                  </div>

                  <div className={styles.exercisesHeader}>
                    <h4>Exercicios</h4>
                    <Button type="button" size="sm" variant="outline" onClick={addExercise}>
                      <Plus size={16} />
                      Exercicio
                    </Button>
                  </div>

                  <div className={styles.exercisesList}>
                    {currentDay?.exercises.map((exercise, index) => (
                      <div key={exercise.id} className={styles.exerciseItem}>
                        <div className={styles.exerciseGrip}>
                          <GripVertical size={16} />
                        </div>

                        <div className={styles.exerciseFields}>
                          <ExerciseSelect
                            value={exercise.name}
                            videoUrl={exercise.video_url}
                            onChange={(name, videoUrl) => updateExerciseFromLibrary(index, name, videoUrl)}
                            placeholder="Buscar exercicio..."
                          />

                          <div className={styles.exerciseRow}>
                            <div className={styles.smallField}>
                              <label>Series</label>
                              <Input
                                type="number"
                                value={exercise.sets || ''}
                                onChange={(e) => updateExercise(index, 'sets', Number(e.target.value))}
                              />
                            </div>
                            <div className={styles.smallField}>
                              <label>Reps</label>
                              <Input
                                value={exercise.reps || ''}
                                onChange={(e) => updateExercise(index, 'reps', e.target.value)}
                                placeholder="10-12"
                              />
                            </div>
                            <div className={styles.smallField}>
                              <label>Descanso</label>
                              <select
                                value={exercise.rest || ''}
                                onChange={(e) => updateExercise(index, 'rest', e.target.value || null)}
                                className={styles.select}
                              >
                                <option value="">-</option>
                                {REST_TIME_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className={styles.exerciseRow}>
                            <div className={styles.selectField}>
                              <label>Tecnica</label>
                              <select
                                value={exercise.technique_id || ''}
                                onChange={(e) => updateExercise(index, 'technique_id', e.target.value || null)}
                                className={styles.select}
                              >
                                <option value="">Nenhuma</option>
                                {TRAINING_TECHNIQUES.map(tech => (
                                  <option key={tech.id} value={tech.id}>
                                    {tech.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className={styles.selectField}>
                              <label>Esforco</label>
                              <select
                                value={exercise.effort_parameter_id || ''}
                                onChange={(e) => updateExercise(index, 'effort_parameter_id', e.target.value || null)}
                                className={styles.select}
                              >
                                <option value="">Nenhum</option>
                                {EFFORT_PARAMETERS.map(param => (
                                  <option key={param.id} value={param.id}>
                                    {param.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <Input
                            value={exercise.notes || ''}
                            onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                            placeholder="Observacoes"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeExercise(index)}
                          className={styles.removeExerciseBtn}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}

                    {(!currentDay?.exercises || currentDay.exercises.length === 0) && (
                      <p className={styles.noExercises}>Clique em "Exercicio" para adicionar</p>
                    )}
                  </div>
                </Card>
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
