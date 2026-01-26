import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header } from '../../components/layout';
import { Card, Input, Button } from '../../components/ui';
import type { Anamnesis as AnamnesisType, Profile } from '../../types/database';
import styles from './Anamnesis.module.css';

const DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

interface MacroGoals {
  protein_goal: number | null;
  carbs_goal: number | null;
  fats_goal: number | null;
  calories_goal: number | null;
  fiber_goal: number | null;
}

export function Anamnesis() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Profile | null>(null);
  const [anamnesis, setAnamnesis] = useState<Partial<AnamnesisType>>({});
  const [macroGoals, setMacroGoals] = useState<MacroGoals>({
    protein_goal: null,
    carbs_goal: null,
    fats_goal: null,
    calories_goal: null,
    fiber_goal: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (id) {
      fetchClient();
      fetchAnamnesis();
    }
  }, [id]);

  async function fetchClient() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();

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

  async function fetchAnamnesis() {
    const { data } = await supabase
      .from('anamnesis')
      .select('*')
      .eq('client_id', id)
      .single();

    if (data) {
      // Corrigir valores antigos do enum se existirem
      if (data.bowel_frequency === 'once_daily') {
        data.bowel_frequency = 'once_a_day';
      }
      if (data.digestion === 'bad') {
        data.digestion = 'poor';
      }
      setAnamnesis(data);
    }
    setLoading(false);
  }

  async function handleSave() {
    if (!id) return;
    setSaving(true);

    // Enviar apenas os campos válidos da tabela
    const anamnesisData = {
      client_id: id,
      meals_per_day: anamnesis.meals_per_day || null,
      water_liters_per_day: anamnesis.water_liters_per_day || null,
      meal_times: anamnesis.meal_times || null,
      meals_prepared_same_day: anamnesis.meals_prepared_same_day ?? null,
      preferred_foods: anamnesis.preferred_foods || null,
      disliked_foods: anamnesis.disliked_foods || null,
      supplements: anamnesis.supplements || null,
      food_allergies: anamnesis.food_allergies || null,
      gluten_intolerance: anamnesis.gluten_intolerance ?? false,
      alcohol_consumption: anamnesis.alcohol_consumption || null,
      current_exercise_type: anamnesis.current_exercise_type || null,
      exercise_duration: anamnesis.exercise_duration || null,
      routine_exercises: anamnesis.routine_exercises || null,
      weekly_routine: anamnesis.weekly_routine || null,
      health_rating: anamnesis.health_rating || null,
      smoker: anamnesis.smoker ?? false,
      cigarettes_per_day: anamnesis.cigarettes_per_day || null,
      digestion: anamnesis.digestion || null,
      bowel_frequency: anamnesis.bowel_frequency || null,
      medications: anamnesis.medications || null,
      bedtime: anamnesis.bedtime || null,
      wakeup_time: anamnesis.wakeup_time || null,
      sleep_quality: anamnesis.sleep_quality || null,
      sleep_hours: anamnesis.sleep_hours || null,
      diseases: anamnesis.diseases || null,
      family_history: anamnesis.family_history || null,
    };

    let error;

    if (anamnesis.id) {
      const result = await supabase
        .from('anamnesis')
        .update(anamnesisData)
        .eq('id', anamnesis.id);
      error = result.error;
    } else {
      const result = await supabase.from('anamnesis').insert(anamnesisData).select().single();
      error = result.error;
      if (result.data) {
        setAnamnesis(result.data);
      }
    }

    // Save macro goals to profiles table
    const { error: goalsError } = await supabase
      .from('profiles')
      .update({
        protein_goal: macroGoals.protein_goal,
        carbs_goal: macroGoals.carbs_goal,
        fats_goal: macroGoals.fats_goal,
        calories_goal: macroGoals.calories_goal,
        fiber_goal: macroGoals.fiber_goal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    setSaving(false);

    if (error || goalsError) {
      console.error('Erro ao salvar:', error || goalsError);
      alert('Erro ao salvar: ' + (error?.message || goalsError?.message));
    } else {
      alert('Anamnese e metas salvas com sucesso!');
    }
  }

  function updateField<K extends keyof AnamnesisType>(field: K, value: AnamnesisType[K]) {
    setAnamnesis((prev) => ({ ...prev, [field]: value }));
  }

  function updateWeeklyRoutine(day: string, value: string) {
    const current = anamnesis.weekly_routine || {};
    setAnamnesis((prev) => ({
      ...prev,
      weekly_routine: { ...current, [day]: value },
    }));
  }

  function updateMacroGoal(field: keyof MacroGoals, value: string) {
    const numValue = value === '' ? null : Number(value);
    setMacroGoals((prev) => ({ ...prev, [field]: numValue }));
  }

  if (loading) {
    return (
      <PageContainer hasBottomNav={false}>
        <Header title="Anamnese" showBack />
        <div className={styles.loading}>Carregando...</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer hasBottomNav={false}>
      <Header
        title="Anamnese"
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
        {/* Metas Nutricionais */}
        <Card className={`${styles.section} ${styles.goalsSection}`}>
          <h2 className={styles.goalsSectionTitle}>
            Metas Nutricionais Diárias
          </h2>
          <p className={styles.goalsDescription}>
            Defina as metas de macronutrientes que o paciente deve atingir diariamente.
          </p>

          <div className={styles.goalsGrid}>
            <div className={styles.goalField}>
              <label>Proteínas (g)</label>
              <Input
                type="number"
                value={macroGoals.protein_goal ?? ''}
                onChange={(e) => updateMacroGoal('protein_goal', e.target.value)}
                placeholder="Ex: 150"
              />
            </div>

            <div className={styles.goalField}>
              <label>Carboidratos (g)</label>
              <Input
                type="number"
                value={macroGoals.carbs_goal ?? ''}
                onChange={(e) => updateMacroGoal('carbs_goal', e.target.value)}
                placeholder="Ex: 200"
              />
            </div>

            <div className={styles.goalField}>
              <label>Gorduras (g)</label>
              <Input
                type="number"
                value={macroGoals.fats_goal ?? ''}
                onChange={(e) => updateMacroGoal('fats_goal', e.target.value)}
                placeholder="Ex: 60"
              />
            </div>

            <div className={styles.goalField}>
              <label>Calorias (kcal)</label>
              <Input
                type="number"
                value={macroGoals.calories_goal ?? ''}
                onChange={(e) => updateMacroGoal('calories_goal', e.target.value)}
                placeholder="Ex: 2000"
              />
            </div>

            <div className={styles.goalField}>
              <label>
                Fibras (g) <span className={styles.optionalLabel}>(opcional)</span>
              </label>
              <Input
                type="number"
                value={macroGoals.fiber_goal ?? ''}
                onChange={(e) => updateMacroGoal('fiber_goal', e.target.value)}
                placeholder="Ex: 25"
              />
            </div>
          </div>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Dieta</h2>

          <div className={styles.field}>
            <label>Quantas refeições consome por dia?</label>
            <Input
              type="number"
              value={anamnesis.meals_per_day || ''}
              onChange={(e) => updateField('meals_per_day', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <label>Quantos litros de água consome por dia?</label>
            <Input
              type="number"
              step="0.5"
              value={anamnesis.water_liters_per_day || ''}
              onChange={(e) => updateField('water_liters_per_day', Number(e.target.value))}
            />
          </div>

          <div className={styles.field}>
            <label>Alimentos que gosta / tem preferência?</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.preferred_foods || ''}
              onChange={(e) => updateField('preferred_foods', e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label>Quais alimentos não gosta?</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.disliked_foods || ''}
              onChange={(e) => updateField('disliked_foods', e.target.value)}
              rows={3}
            />
          </div>

          <div className={styles.field}>
            <label>Utiliza suplementação? Quais?</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.supplements || ''}
              onChange={(e) => updateField('supplements', e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <label>Possui alergia alimentar? Quais?</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.food_allergies || ''}
              onChange={(e) => updateField('food_allergies', e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <label>Consome bebida alcoólica? Com que frequência?</label>
            <Input
              value={anamnesis.alcohol_consumption || ''}
              onChange={(e) => updateField('alcohol_consumption', e.target.value)}
            />
          </div>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Treino</h2>

          <div className={styles.field}>
            <label>Qual tipo de exercício pratica atualmente?</label>
            <Input
              value={anamnesis.current_exercise_type || ''}
              onChange={(e) => updateField('current_exercise_type', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Quanto tempo de prática?</label>
            <Input
              value={anamnesis.exercise_duration || ''}
              onChange={(e) => updateField('exercise_duration', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Faz exercícios de rotina (passeio, caminhada)?</label>
            <Input
              value={anamnesis.routine_exercises || ''}
              onChange={(e) => updateField('routine_exercises', e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label>Rotina de atividade física semanal:</label>
            <div className={styles.weeklyGrid}>
              {DAYS.map((day) => (
                <div key={day} className={styles.dayField}>
                  <span className={styles.dayLabel}>{day}</span>
                  <Input
                    value={(anamnesis.weekly_routine as Record<string, string>)?.[day] || ''}
                    onChange={(e) => updateWeeklyRoutine(day, e.target.value)}
                    placeholder="Ex: Treino A"
                  />
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className={styles.section}>
          <h2 className={styles.sectionTitle}>Saúde</h2>

          <div className={styles.field}>
            <label>Como classifica sua saúde?</label>
            <select
              className={styles.select}
              value={anamnesis.health_rating || ''}
              onChange={(e) => updateField('health_rating', e.target.value as any)}
            >
              <option value="">Selecione</option>
              <option value="excellent">Excelente</option>
              <option value="good">Boa</option>
              <option value="regular">Regular</option>
              <option value="poor">Ruim</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Fumante?</label>
            <div className={styles.radioGroup}>
              <label className={styles.radio}>
                <input
                  type="radio"
                  checked={anamnesis.smoker === true}
                  onChange={() => updateField('smoker', true)}
                />
                <span>Sim</span>
              </label>
              <label className={styles.radio}>
                <input
                  type="radio"
                  checked={anamnesis.smoker === false}
                  onChange={() => updateField('smoker', false)}
                />
                <span>Não</span>
              </label>
            </div>
          </div>

          <div className={styles.field}>
            <label>Como está sua digestão?</label>
            <select
              className={styles.select}
              value={anamnesis.digestion || ''}
              onChange={(e) => updateField('digestion', e.target.value as any)}
            >
              <option value="">Selecione</option>
              <option value="good">Boa</option>
              <option value="poor">Ruim</option>
              <option value="terrible">Péssima</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Frequência de evacuação:</label>
            <select
              className={styles.select}
              value={anamnesis.bowel_frequency || ''}
              onChange={(e) => updateField('bowel_frequency', e.target.value as any)}
            >
              <option value="">Selecione</option>
              <option value="once_a_day">1x ao dia</option>
              <option value="every_other_day">Dia sim, dia não</option>
              <option value="constipated">Constipado</option>
              <option value="more_than_once">Mais de 1x ao dia</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Medicamentos em uso:</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.medications || ''}
              onChange={(e) => updateField('medications', e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.row}>
            <div className={styles.field}>
              <label>Horário que dorme:</label>
              <Input
                type="time"
                value={anamnesis.bedtime || ''}
                onChange={(e) => updateField('bedtime', e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label>Horário que acorda:</label>
              <Input
                type="time"
                value={anamnesis.wakeup_time || ''}
                onChange={(e) => updateField('wakeup_time', e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label>Qualidade do sono:</label>
            <select
              className={styles.select}
              value={anamnesis.sleep_quality || ''}
              onChange={(e) => updateField('sleep_quality', e.target.value as any)}
            >
              <option value="">Selecione</option>
              <option value="excellent">Excelente</option>
              <option value="good">Boa</option>
              <option value="regular">Regular</option>
              <option value="poor">Ruim</option>
              <option value="terrible">Péssima</option>
            </select>
          </div>

          <div className={styles.field}>
            <label>Doenças pré-existentes ou diagnosticadas:</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.diseases || ''}
              onChange={(e) => updateField('diseases', e.target.value)}
              rows={2}
            />
          </div>

          <div className={styles.field}>
            <label>Histórico médico familiar:</label>
            <textarea
              className={styles.textarea}
              value={anamnesis.family_history || ''}
              onChange={(e) => updateField('family_history', e.target.value)}
              rows={2}
            />
          </div>
        </Card>

        <Button fullWidth onClick={handleSave} loading={saving}>
          <Save size={18} />
          Salvar Anamnese
        </Button>
      </main>
    </PageContainer>
  );
}
