import { useState, useCallback, useEffect, useRef } from 'react';
import { Plus, Minus, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePageData } from '../../hooks';
import { PageContainer, Header, BottomNav } from '../../components/layout';
import { Card, Checkbox, YouTubeEmbed, TechniqueBadge } from '../../components/ui';
import type { DailyWorkout, Exercise } from '../../types/database';
import styles from './Workout.module.css';

// Retorna a data atual no fuso horário de Brasília
function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

// Dias da semana
const WEEKDAYS = [
  { index: 0, short: 'Dom', full: 'Domingo' },
  { index: 1, short: 'Seg', full: 'Segunda' },
  { index: 2, short: 'Ter', full: 'Terca' },
  { index: 3, short: 'Qua', full: 'Quarta' },
  { index: 4, short: 'Qui', full: 'Quinta' },
  { index: 5, short: 'Sex', full: 'Sexta' },
  { index: 6, short: 'Sab', full: 'Sabado' },
];

// Formatar tempo de descanso para exibição
const formatRestTime = (rest: string | null): string => {
  if (!rest) return '';
  const restLabels: Record<string, string> = {
    '45s': '45s',
    '1min': '1min',
    '1min30s': '1:30',
    '2min': '2min',
    '2min30s': '2:30',
    '3min': '3min',
  };
  return restLabels[rest] || rest;
};

interface SetLog {
  set: number;
  weight: string;
  reps: string;
}

interface ExerciseLog {
  [exerciseId: string]: {
    sets: SetLog[];
    saved: boolean;
    expanded: boolean;
  };
}

export function Workout() {
  const { profile } = useAuth();
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [workout, setWorkout] = useState<DailyWorkout | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [completedExercises, setCompletedExercises] = useState<string[]>([]);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog>({});
  const [savingExercise, setSavingExercise] = useState<string | null>(null);
  const [autoSaving, setAutoSaving] = useState<Set<string>>(new Set());
  const autoSaveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const exerciseLogsRef = useRef<ExerciseLog>({});
  const today = getBrasiliaDate();

  // Manter ref sincronizado com o estado
  useEffect(() => {
    exerciseLogsRef.current = exerciseLogs;
  }, [exerciseLogs]);

  const fetchAllData = useCallback(async () => {
    if (!profile?.id) return;

    // Buscar workout plan e progresso em paralelo
    const [planResult, progressResult] = await Promise.all([
      supabase
        .from('workout_plans')
        .select('id')
        .eq('client_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('daily_progress')
        .select('exercises_completed')
        .eq('client_id', profile.id)
        .eq('date', today)
        .maybeSingle()
    ]);

    if (progressResult.data) {
      setCompletedExercises(progressResult.data.exercises_completed || []);
    }

    const workoutPlan = planResult.data?.[0];
    if (!workoutPlan) {
      setWorkout(null);
      setExercises([]);
      setExerciseLogs({});
      return;
    }

    // Buscar daily workout
    const { data: dailyWorkout } = await supabase
      .from('daily_workouts')
      .select('*')
      .eq('workout_plan_id', workoutPlan.id)
      .eq('day_of_week', selectedDay)
      .maybeSingle();

    if (!dailyWorkout) {
      setWorkout(null);
      setExercises([]);
      setExerciseLogs({});
      return;
    }

    setWorkout(dailyWorkout);

    // Buscar exercicios e logs em paralelo
    const [exercisesResult, logsResult] = await Promise.all([
      supabase
        .from('exercises')
        .select('*')
        .eq('daily_workout_id', dailyWorkout.id)
        .order('order_index'),
      supabase
        .from('exercise_logs')
        .select('*')
        .eq('client_id', profile.id)
        .eq('date', today)
    ]);

    const exercisesData = exercisesResult.data || [];
    const logs = logsResult.data || [];

    setExercises(exercisesData);

    // Processar logs
    const newLogs: ExerciseLog = {};
    exercisesData.forEach(exercise => {
      const existingLog = logs.find(l => l.exercise_id === exercise.id);
      const plannedSets = parseInt(exercise.sets?.toString() || '3');

      if (existingLog && existingLog.sets_completed) {
        newLogs[exercise.id] = {
          sets: existingLog.sets_completed,
          saved: true,
          expanded: false,
        };
      } else {
        newLogs[exercise.id] = {
          sets: Array.from({ length: plannedSets }, (_, i) => ({
            set: i + 1,
            weight: exercise.weight_kg?.toString() || '',
            reps: '',
          })),
          saved: false,
          expanded: false,
        };
      }
    });

    setExerciseLogs(newLogs);
  }, [profile?.id, selectedDay, today]);

  // Hook que gerencia loading e refetch automático
  const { isInitialLoading: loading } = usePageData({
    userId: profile?.id,
    fetchData: fetchAllData,
    dependencies: [selectedDay],
  });

  async function toggleExercise(exerciseId: string) {
    const isCompleted = completedExercises.includes(exerciseId);
    const newCompleted = isCompleted
      ? completedExercises.filter(id => id !== exerciseId)
      : [...completedExercises, exerciseId];

    setCompletedExercises(newCompleted);

    const { data: existing } = await supabase
      .from('daily_progress')
      .select('id')
      .eq('client_id', profile!.id)
      .eq('date', today)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('daily_progress')
        .update({ exercises_completed: newCompleted })
        .eq('id', existing.id);
    } else {
      await supabase.from('daily_progress').insert({
        client_id: profile!.id,
        date: today,
        exercises_completed: newCompleted,
        meals_completed: [],
        water_consumed_ml: 0,
      });
    }
  }

  // Toggle expandir/colapsar exercício
  function toggleExpand(exerciseId: string) {
    setExerciseLogs(prev => ({
      ...prev,
      [exerciseId]: {
        ...prev[exerciseId],
        expanded: !prev[exerciseId]?.expanded,
      },
    }));
  }

  // Atualizar set específico
  function updateSet(exerciseId: string, setIndex: number, field: 'weight' | 'reps', value: string) {
    setExerciseLogs(prev => {
      const exerciseLog = prev[exerciseId];
      const newSets = [...exerciseLog.sets];
      newSets[setIndex] = {
        ...newSets[setIndex],
        [field]: value,
      };
      return {
        ...prev,
        [exerciseId]: {
          ...exerciseLog,
          sets: newSets,
          saved: false,
        },
      };
    });
    // Agendar auto-save
    scheduleAutoSave(exerciseId);
  }

  // Adicionar série
  function addSet(exerciseId: string) {
    setExerciseLogs(prev => {
      const exerciseLog = prev[exerciseId];
      const lastSet = exerciseLog.sets[exerciseLog.sets.length - 1];
      return {
        ...prev,
        [exerciseId]: {
          ...exerciseLog,
          sets: [
            ...exerciseLog.sets,
            {
              set: exerciseLog.sets.length + 1,
              weight: lastSet?.weight || '',
              reps: '',
            },
          ],
          saved: false,
        },
      };
    });
    // Agendar auto-save
    scheduleAutoSave(exerciseId);
  }

  // Remover última série
  function removeSet(exerciseId: string) {
    setExerciseLogs(prev => {
      const exerciseLog = prev[exerciseId];
      if (exerciseLog.sets.length <= 1) return prev;
      return {
        ...prev,
        [exerciseId]: {
          ...exerciseLog,
          sets: exerciseLog.sets.slice(0, -1),
          saved: false,
        },
      };
    });
    // Agendar auto-save
    scheduleAutoSave(exerciseId);
  }

  // Salvar log do exercício
  async function saveExerciseLog(exerciseId: string, exercise: Exercise, isAutoSave = false) {
    if (!isAutoSave) {
      setSavingExercise(exerciseId);
    }
    // Usar ref para evitar stale closure no auto-save
    const exerciseLog = exerciseLogsRef.current[exerciseId];

    try {
      const setsToSave = exerciseLog.sets.map(s => ({
        set: s.set,
        weight: parseFloat(s.weight) || 0,
        reps: parseFloat(s.reps) || 0,
      }));

      const { data: existing } = await supabase
        .from('exercise_logs')
        .select('id')
        .eq('client_id', profile!.id)
        .eq('exercise_id', exerciseId)
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        const { error: updateError } = await supabase
          .from('exercise_logs')
          .update({ sets_completed: setsToSave })
          .eq('id', existing.id);

        if (updateError) {
          console.error('Erro ao atualizar log:', updateError);
          throw updateError;
        }
      } else {
        const { error: insertError } = await supabase.from('exercise_logs').insert({
          client_id: profile!.id,
          exercise_id: exerciseId,
          daily_workout_id: exercise.daily_workout_id,
          date: today,
          sets_completed: setsToSave,
        });

        if (insertError) {
          console.error('Erro ao inserir log:', insertError);
          throw insertError;
        }
      }

      setExerciseLogs(prev => ({
        ...prev,
        [exerciseId]: {
          ...prev[exerciseId],
          saved: true,
        },
      }));

      // Remover do estado de auto-saving
      if (isAutoSave) {
        setAutoSaving(prev => {
          const newSet = new Set(prev);
          newSet.delete(exerciseId);
          return newSet;
        });
      }

      // Marcar como completo automaticamente se tiver dados
      const hasData = setsToSave.some(s => s.weight > 0 || s.reps > 0);
      if (hasData && !completedExercises.includes(exerciseId)) {
        toggleExercise(exerciseId);
      }
    } catch (error) {
      console.error('Erro ao salvar log:', error);
      // Remover do estado de auto-saving mesmo em caso de erro
      if (isAutoSave) {
        setAutoSaving(prev => {
          const newSet = new Set(prev);
          newSet.delete(exerciseId);
          return newSet;
        });
      }
    } finally {
      if (!isAutoSave) {
        setSavingExercise(null);
      }
    }
  }

  // Agendar auto-save com debounce
  function scheduleAutoSave(exerciseId: string) {
    // Cancelar timeout anterior se existir
    const existingTimeout = autoSaveTimeouts.current.get(exerciseId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Marcar como pendente de auto-save
    setAutoSaving(prev => new Set(prev).add(exerciseId));

    // Agendar novo auto-save em 2 segundos
    const timeout = setTimeout(() => {
      const exercise = exercises.find(e => e.id === exerciseId);
      // Usar ref para evitar stale closure
      if (exercise && exerciseLogsRef.current[exerciseId] && !exerciseLogsRef.current[exerciseId].saved) {
        saveExerciseLog(exerciseId, exercise, true);
      }
      autoSaveTimeouts.current.delete(exerciseId);
    }, 2000);

    autoSaveTimeouts.current.set(exerciseId, timeout);
  }

  // Limpar timeouts ao desmontar
  useEffect(() => {
    return () => {
      autoSaveTimeouts.current.forEach(timeout => clearTimeout(timeout));
      autoSaveTimeouts.current.clear();
    };
  }, []);

  const selectedWeekday = WEEKDAYS[selectedDay];

  return (
    <PageContainer>
      <Header
        title="Meus Treinos"
        subtitle={selectedWeekday.full}
        showBack
      >
        <div className={styles.daysNav}>
          <div className={styles.days}>
            {WEEKDAYS.map((day) => (
              <button
                key={day.index}
                className={`${styles.dayButton} ${selectedDay === day.index ? styles.active : ''}`}
                onClick={() => setSelectedDay(day.index)}
              >
                <span className={styles.dayName}>{day.short}</span>
                {selectedDay === day.index && <span className={styles.dayIndicator} />}
              </button>
            ))}
          </div>
        </div>
      </Header>

      <main className={styles.content}>
        {loading ? (
          <div className={styles.loading}>Carregando treino...</div>
        ) : workout ? (
          <>
            <Card className={styles.workoutInfo}>
              <div className={styles.workoutIcon}>
                <span>💪</span>
              </div>
              <div className={styles.workoutDetails}>
                <h2 className={styles.workoutTitle}>Treino de {selectedWeekday.full}</h2>
                <p className={styles.workoutSubtitle}>
                  {workout.workout_type || 'Treino'} • {completedExercises.length}/{exercises.length} exercicios
                </p>
              </div>
            </Card>

            <div className={styles.exerciseList}>
              {exercises.map((exercise, index) => {
                const isCompleted = completedExercises.includes(exercise.id);
                const log = exerciseLogs[exercise.id];
                const isExpanded = log?.expanded;

                return (
                  <Card key={exercise.id} className={styles.exerciseCard}>
                    <div className={styles.exerciseMain}>
                      <div className={styles.exerciseLeft}>
                        <div className={`${styles.line} ${index === exercises.length - 1 ? styles.lastLine : ''}`} />
                        <Checkbox
                          checked={isCompleted}
                          onChange={() => toggleExercise(exercise.id)}
                        />
                      </div>
                      <div className={styles.exerciseContent} onClick={() => toggleExpand(exercise.id)}>
                        <h3 className={`${styles.exerciseName} ${isCompleted ? styles.completed : ''}`}>
                          {exercise.name}
                        </h3>
                        <p className={styles.exerciseDetails}>
                          {exercise.sets} series • {exercise.reps} reps
                          {exercise.rest && ` • ${formatRestTime(exercise.rest)} desc`}
                          {exercise.weight_kg && ` • ${exercise.weight_kg}kg`}
                        </p>
                        {exercise.notes && (
                          <p className={styles.exerciseNotes}>{exercise.notes}</p>
                        )}
                        <TechniqueBadge
                          techniqueId={exercise.technique_id}
                          effortParameterId={exercise.effort_parameter_id}
                        />
                      </div>
                      {exercise.video_url ? (
                        <YouTubeEmbed
                          url={exercise.video_url}
                          title={exercise.name}
                        />
                      ) : (
                        <button
                          className={styles.expandButton}
                          onClick={() => toggleExpand(exercise.id)}
                        >
                          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                        </button>
                      )}
                    </div>

                    {/* Seção de Log Expandida */}
                    {isExpanded && log && (
                      <div className={styles.logSection}>
                        <div className={styles.logHeader}>
                          <span>Serie</span>
                          <span>Peso (kg)</span>
                          <span>Reps</span>
                        </div>

                        {log.sets.map((set, setIndex) => (
                          <div key={setIndex} className={styles.logRow}>
                            <span className={styles.setNumber}>{set.set}</span>
                            <input
                              type="number"
                              step="0.5"
                              placeholder="kg"
                              value={set.weight}
                              onChange={(e) => updateSet(exercise.id, setIndex, 'weight', e.target.value)}
                              className={styles.logInput}
                            />
                            <input
                              type="number"
                              placeholder="reps"
                              value={set.reps}
                              onChange={(e) => updateSet(exercise.id, setIndex, 'reps', e.target.value)}
                              className={styles.logInput}
                            />
                          </div>
                        ))}

                        <div className={styles.logActions}>
                          <div className={styles.setButtons}>
                            <button
                              className={styles.setBtn}
                              onClick={() => removeSet(exercise.id)}
                              disabled={log.sets.length <= 1}
                            >
                              <Minus size={16} />
                            </button>
                            <button
                              className={styles.setBtn}
                              onClick={() => addSet(exercise.id)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>

                          <button
                            className={`${styles.saveBtn} ${log.saved ? styles.saved : ''} ${autoSaving.has(exercise.id) ? styles.autoSaving : ''}`}
                            onClick={() => saveExerciseLog(exercise.id, exercise)}
                            disabled={savingExercise === exercise.id || autoSaving.has(exercise.id)}
                          >
                            {savingExercise === exercise.id || autoSaving.has(exercise.id) ? (
                              'Salvando...'
                            ) : log.saved ? (
                              <>
                                <Check size={16} />
                                Salvo
                              </>
                            ) : (
                              'Salvar'
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            <p>Nenhum treino para este dia</p>
          </div>
        )}
      </main>

      <BottomNav />
    </PageContainer>
  );
}
