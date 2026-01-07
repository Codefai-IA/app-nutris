import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Save, Plus, Trash2, GripVertical, Check, AlertCircle, Clock, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header } from '../../components/layout';
import { Card, Input, Button, ExerciseSelect } from '../../components/ui';
import type { Profile, WorkoutPlan, DailyWorkout, Exercise } from '../../types/database';
import { TRAINING_TECHNIQUES, EFFORT_PARAMETERS, getTechniqueById } from '../../constants/trainingTechniques';
import styles from './WorkoutManagement.module.css';

const DAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const REST_TIME_OPTIONS = [
  { value: '45s', label: '45 segundos' },
  { value: '1min', label: '1 minuto' },
  { value: '1min30s', label: '1 minuto e meio' },
  { value: '2min', label: '2 minutos' },
  { value: '2min30s', label: '2 minutos e meio' },
  { value: '3min', label: '3 minutos' },
];

interface DailyWorkoutWithExercises extends DailyWorkout {
  exercises: Exercise[];
}

export function WorkoutManagement() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Profile | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [dailyWorkouts, setDailyWorkouts] = useState<DailyWorkoutWithExercises[]>([]);
  const [selectedDay, setSelectedDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; description: string | null }[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  useEffect(() => {
    if (id) {
      fetchAllData();
    }
  }, [id]);

  async function fetchAllData() {
    setLoading(true);

    // Buscar cliente e plano em paralelo
    const [clientResult, plansResult] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase
        .from('workout_plans')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
    ]);

    if (clientResult.data) {
      setClient(clientResult.data);
    }

    let plan = plansResult.data?.[0] || null;

    // Criar plano se nao existir
    if (!plan) {
      const { data: newPlan } = await supabase
        .from('workout_plans')
        .insert({ client_id: id })
        .select()
        .single();
      plan = newPlan;
    }

    if (plan) {
      setWorkoutPlan(plan);

      // Buscar daily workouts e todos os exercicios em paralelo
      const [dailyResult, exercisesResult] = await Promise.all([
        supabase
          .from('daily_workouts')
          .select('*')
          .eq('workout_plan_id', plan.id),
        supabase
          .from('exercises')
          .select('*')
          .order('order_index')
      ]);

      const dailyData = dailyResult.data || [];
      const allExercises = exercisesResult.data || [];

      // Criar mapa de exercicios por daily_workout_id para lookup rapido
      const exercisesByWorkout = new Map<string, typeof allExercises>();
      allExercises.forEach(ex => {
        const existing = exercisesByWorkout.get(ex.daily_workout_id) || [];
        existing.push(ex);
        exercisesByWorkout.set(ex.daily_workout_id, existing);
      });

      const workoutsWithExercises: DailyWorkoutWithExercises[] = [];

      for (let day = 0; day < 7; day++) {
        const existing = dailyData.find((d) => d.day_of_week === day);
        if (existing) {
          const exercises = exercisesByWorkout.get(existing.id) || [];
          workoutsWithExercises.push({ ...existing, exercises });
        } else {
          workoutsWithExercises.push({
            id: `new-${day}`,
            workout_plan_id: plan.id,
            day_of_week: day,
            workout_type: null,
            exercises: [],
          });
        }
      }

      setDailyWorkouts(workoutsWithExercises);
    }

    setLoading(false);
  }

  async function handleSave() {
    if (!workoutPlan) return;
    setSaving(true);
    setSaveStatus('idle');

    try {
      const now = new Date().toISOString();

      // Atualizar timestamp do workout_plan
      const { error: planUpdateError } = await supabase
        .from('workout_plans')
        .update({ updated_at: now })
        .eq('id', workoutPlan.id);

      if (planUpdateError) throw planUpdateError;

      for (const workout of dailyWorkouts) {
        // Skip days with no exercises and no workout type
        if (!workout.workout_type && workout.exercises.length === 0) {
          continue;
        }

        let workoutId = workout.id;

        if (workout.id.startsWith('new-')) {
          const { data: newWorkout, error: workoutError } = await supabase
            .from('daily_workouts')
            .insert({
              workout_plan_id: workoutPlan.id,
              day_of_week: workout.day_of_week,
              workout_type: workout.workout_type,
            })
            .select()
            .single();

          if (workoutError) throw workoutError;
          if (newWorkout) {
            workoutId = newWorkout.id;
          }
        } else {
          const { error: updateError } = await supabase
            .from('daily_workouts')
            .update({ workout_type: workout.workout_type })
            .eq('id', workout.id);

          if (updateError) throw updateError;
        }

        for (const exercise of workout.exercises) {
          // Skip exercises without a name
          if (!exercise.name || exercise.name.trim() === '') {
            continue;
          }

          if (exercise.id.startsWith('new-')) {
            const { error: insertError } = await supabase
              .from('exercises')
              .insert({
                daily_workout_id: workoutId,
                name: exercise.name,
                sets: exercise.sets,
                reps: exercise.reps,
                rest: exercise.rest,
                weight_kg: exercise.weight_kg,
                video_url: exercise.video_url,
                notes: exercise.notes,
                order_index: exercise.order_index,
                technique_id: exercise.technique_id,
                effort_parameter_id: exercise.effort_parameter_id,
              });

            if (insertError) throw insertError;
          } else {
            const { error: updateExerciseError } = await supabase
              .from('exercises')
              .update({
                name: exercise.name,
                sets: exercise.sets,
                reps: exercise.reps,
                rest: exercise.rest,
                weight_kg: exercise.weight_kg,
                video_url: exercise.video_url,
                notes: exercise.notes,
                order_index: exercise.order_index,
                technique_id: exercise.technique_id,
                effort_parameter_id: exercise.effort_parameter_id,
              })
              .eq('id', exercise.id);

            if (updateExerciseError) throw updateExerciseError;
          }
        }
      }

      await fetchAllData();
      setLastSavedAt(now);
      setSaveStatus('success');
      setTimeout(() => setSaveStatus('idle'), 5000);
    } catch (error) {
      console.error('Erro ao salvar treino:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function loadTemplates() {
    setLoadingTemplates(true);
    const { data } = await supabase
      .from('workout_templates')
      .select('id, name, description')
      .order('name');
    setTemplates(data || []);
    setLoadingTemplates(false);
    setShowTemplateModal(true);
  }

  async function applyTemplate(templateId: string) {
    if (!workoutPlan) return;

    const { data: daysData } = await supabase
      .from('workout_template_days')
      .select(`
        *,
        workout_template_exercises (*)
      `)
      .eq('template_id', templateId);

    if (!daysData) return;

    // Deletar daily_workouts existentes para este plano (cascade deleta exercises)
    const existingIds = dailyWorkouts
      .filter(w => !w.id.startsWith('new-'))
      .map(w => w.id);

    if (existingIds.length > 0) {
      await supabase
        .from('daily_workouts')
        .delete()
        .in('id', existingIds);
    }

    const newWorkouts: DailyWorkoutWithExercises[] = [];

    for (let day = 0; day < 7; day++) {
      const templateDay = daysData.find(d => d.day_of_week === day);

      if (templateDay) {
        const exercises: Exercise[] = (templateDay.workout_template_exercises || [])
          .sort((a: { order_index: number }, b: { order_index: number }) => a.order_index - b.order_index)
          .map((ex: {
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
          }, idx: number) => ({
            id: `new-${Date.now()}-${day}-${idx}`,
            daily_workout_id: '',
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest,
            weight_kg: ex.weight_kg,
            video_url: ex.video_url,
            notes: ex.notes,
            order_index: ex.order_index,
            technique_id: ex.technique_id,
            effort_parameter_id: ex.effort_parameter_id,
          }));

        newWorkouts.push({
          id: `new-${day}`,
          workout_plan_id: workoutPlan?.id || '',
          day_of_week: day,
          workout_type: templateDay.workout_type,
          exercises,
        });
      } else {
        newWorkouts.push({
          id: `new-${day}`,
          workout_plan_id: workoutPlan?.id || '',
          day_of_week: day,
          workout_type: null,
          exercises: [],
        });
      }
    }

    setDailyWorkouts(newWorkouts);
    setShowTemplateModal(false);
  }

  function getCurrentWorkout() {
    return dailyWorkouts.find((w) => w.day_of_week === selectedDay);
  }

  function updateWorkoutType(type: string) {
    setDailyWorkouts((prev) =>
      prev.map((w) =>
        w.day_of_week === selectedDay ? { ...w, workout_type: type } : w
      )
    );
  }

  function addExercise() {
    const newExercise: Exercise = {
      id: `new-${Date.now()}`,
      daily_workout_id: getCurrentWorkout()?.id || '',
      name: '',
      sets: 3,
      reps: '10-12',
      rest: null,
      weight_kg: null,
      video_url: null,
      notes: null,
      order_index: getCurrentWorkout()?.exercises.length || 0,
      technique_id: null,
      effort_parameter_id: null,
    };

    setDailyWorkouts((prev) =>
      prev.map((w) =>
        w.day_of_week === selectedDay
          ? { ...w, exercises: [...w.exercises, newExercise] }
          : w
      )
    );
  }

  function updateExercise(index: number, field: keyof Exercise, value: string | number | null) {
    setDailyWorkouts((prev) =>
      prev.map((w) =>
        w.day_of_week === selectedDay
          ? {
              ...w,
              exercises: w.exercises.map((e, i) =>
                i === index ? { ...e, [field]: value } : e
              ),
            }
          : w
      )
    );
  }

  function updateExerciseFromLibrary(index: number, name: string, videoUrl: string | null) {
    setDailyWorkouts((prev) =>
      prev.map((w) =>
        w.day_of_week === selectedDay
          ? {
              ...w,
              exercises: w.exercises.map((e, i) =>
                i === index ? { ...e, name, video_url: videoUrl } : e
              ),
            }
          : w
      )
    );
  }

  async function removeExercise(index: number) {
    const exercise = getCurrentWorkout()?.exercises[index];
    if (exercise && !exercise.id.startsWith('new-')) {
      await supabase.from('exercises').delete().eq('id', exercise.id);
    }

    setDailyWorkouts((prev) =>
      prev.map((w) =>
        w.day_of_week === selectedDay
          ? { ...w, exercises: w.exercises.filter((_, i) => i !== index) }
          : w
      )
    );
  }

  const currentWorkout = getCurrentWorkout();

  if (loading) {
    return (
      <PageContainer hasBottomNav={false}>
        <Header title="Gerenciar Treino" showBack />
        <div className={styles.loading}>Carregando...</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer hasBottomNav={false}>
      <Header
        title="Gerenciar Treino"
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
        <div className={styles.templateSection}>
          <Button size="sm" variant="outline" onClick={loadTemplates}>
            <FileText size={16} />
            Carregar Template
          </Button>
        </div>

        <div className={styles.daysScroll}>
          {DAYS.map((day, index) => (
            <button
              key={index}
              className={`${styles.dayTab} ${selectedDay === index ? styles.active : ''}`}
              onClick={() => setSelectedDay(index)}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>

        <Card className={styles.workoutCard}>
          <div className={styles.workoutHeader}>
            <label>Tipo de treino:</label>
            <Input
              value={currentWorkout?.workout_type || ''}
              onChange={(e) => updateWorkoutType(e.target.value)}
              placeholder="Ex: Peito e Triceps"
            />
          </div>

          <div className={styles.exercisesHeader}>
            <h3 className={styles.exercisesTitle}>Exercícios</h3>
            <Button size="sm" variant="outline" onClick={addExercise}>
              <Plus size={16} />
              Adicionar
            </Button>
          </div>

          <div className={styles.exercisesList}>
            {currentWorkout?.exercises.map((exercise, index) => (
              <div key={exercise.id} className={styles.exerciseItem}>
                <div className={styles.exerciseGrip}>
                  <GripVertical size={18} />
                </div>

                <div className={styles.exerciseFields}>
                  <ExerciseSelect
                    value={exercise.name}
                    videoUrl={exercise.video_url}
                    onChange={(name, videoUrl) => updateExerciseFromLibrary(index, name, videoUrl)}
                    placeholder="Buscar exercício..."
                  />

                  <div className={styles.exerciseRowFour}>
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
                        <option value="">Selecione...</option>
                        {REST_TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className={styles.smallField}>
                      <label>Peso (kg)</label>
                      <Input
                        type="number"
                        value={exercise.weight_kg || ''}
                        onChange={(e) => updateExercise(index, 'weight_kg', Number(e.target.value) || null)}
                      />
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

                  {(exercise.technique_id || exercise.effort_parameter_id) && (
                    <div className={styles.techniquePreview}>
                      {exercise.technique_id && (
                        <span className={styles.techBadge}>
                          {getTechniqueById(exercise.technique_id)?.name}
                        </span>
                      )}
                      {exercise.effort_parameter_id && (
                        <span className={styles.effortBadge}>
                          {getTechniqueById(exercise.effort_parameter_id)?.name}
                        </span>
                      )}
                    </div>
                  )}

                  <Input
                    value={exercise.notes || ''}
                    onChange={(e) => updateExercise(index, 'notes', e.target.value)}
                    placeholder="Observações"
                  />
                </div>

                <button
                  className={styles.deleteButton}
                  onClick={() => removeExercise(index)}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}

            {(!currentWorkout?.exercises || currentWorkout.exercises.length === 0) && (
              <div className={styles.emptyState}>
                <p>Nenhum exercício cadastrado</p>
                <Button size="sm" variant="outline" onClick={addExercise}>
                  <Plus size={16} />
                  Adicionar exercício
                </Button>
              </div>
            )}
          </div>
        </Card>

        <div className={styles.saveSection}>
          <Button fullWidth onClick={handleSave} loading={saving} variant={saveStatus === 'success' ? 'primary' : saveStatus === 'error' ? 'danger' : 'primary'}>
            {saveStatus === 'success' ? <Check size={18} /> : saveStatus === 'error' ? <AlertCircle size={18} /> : <Save size={18} />}
            {saveStatus === 'success' ? 'Salvo com sucesso!' : saveStatus === 'error' ? 'Erro ao salvar' : 'Salvar Treino'}
          </Button>
          {saveStatus === 'success' && lastSavedAt && (
            <p className={styles.savedTimestamp}>
              <Clock size={14} />
              Última atualização: {new Date(lastSavedAt).toLocaleString('pt-BR')}
            </p>
          )}
          {workoutPlan?.updated_at && saveStatus === 'idle' && (
            <p className={styles.lastUpdated}>
              <Clock size={14} />
              Última atualização: {new Date(workoutPlan.updated_at).toLocaleString('pt-BR')}
            </p>
          )}
        </div>
      </main>

      {showTemplateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowTemplateModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>Selecionar Template de Treino</h3>
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
              Atenção: Aplicar um template substituirá todos os treinos atuais.
            </p>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
