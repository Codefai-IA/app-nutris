import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { TrendingDown, TrendingUp, Droplets, Plus, Minus, CalendarDays, CheckCircle2, Clock, Scale } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePageData } from '../../hooks';
import { PageContainer, Header, BottomNav } from '../../components/layout';
import { Card, ProgressBar, Button, Input } from '../../components/ui';
import type { WeightHistory, DailyProgress } from '../../types/database';
import styles from './Progress.module.css';

// Componente separado para o gráfico de peso com linhas conectoras precisas
function WeightChart({ weightHistory, styles }: { weightHistory: WeightHistory[]; styles: Record<string, string> }) {
  const chartRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<(HTMLDivElement | null)[]>([]);
  const [lines, setLines] = useState<{ x1: number; y1: number; x2: number; y2: number }[]>([]);

  const chartData = weightHistory.slice(0, 7).reverse();
  const maxWeight = Math.max(...chartData.map(w => Number(w.weight_kg)));
  const minWeight = Math.min(...chartData.map(w => Number(w.weight_kg)));
  const range = maxWeight - minWeight || 1;

  const heights = chartData.map(record =>
    Math.round(((Number(record.weight_kg) - minWeight) / range) * 40 + 60)
  );

  // Calcular posições das linhas após renderização
  useLayoutEffect(() => {
    const updateLines = () => {
      if (!chartRef.current) return;

      const chartRect = chartRef.current.getBoundingClientRect();
      const newLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

      for (let i = 0; i < dotsRef.current.length - 1; i++) {
        const dot1 = dotsRef.current[i];
        const dot2 = dotsRef.current[i + 1];

        if (dot1 && dot2) {
          const rect1 = dot1.getBoundingClientRect();
          const rect2 = dot2.getBoundingClientRect();

          // Posição relativa ao container do chart
          const x1 = rect1.left - chartRect.left + rect1.width / 2;
          const y1 = rect1.top - chartRect.top + rect1.height / 2;
          const x2 = rect2.left - chartRect.left + rect2.width / 2;
          const y2 = rect2.top - chartRect.top + rect2.height / 2;

          newLines.push({ x1, y1, x2, y2 });
        }
      }

      setLines(newLines);
    };

    // Pequeno delay para garantir que o layout está pronto
    const timer = setTimeout(updateLines, 50);
    window.addEventListener('resize', updateLines);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateLines);
    };
  }, [chartData.length, heights]);

  return (
    <div className={styles.weightChart} ref={chartRef}>
      {/* SVG para as linhas conectoras */}
      <svg className={styles.chartLines}>
        {lines.map((line, index) => (
          <line
            key={index}
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            className={styles.svgConnectorLine}
          />
        ))}
      </svg>

      {chartData.map((record, index) => {
        const currentHeight = heights[index];

        return (
          <div key={record.id} className={styles.chartBar}>
            <span className={styles.barValue}>{record.weight_kg}kg</span>
            <div className={styles.barContainer} style={{ height: `${currentHeight}px` }}>
              <div
                className={styles.barDot}
                ref={el => { dotsRef.current[index] = el; }}
              />
              <div className={styles.bar} />
            </div>
            <span className={styles.barLabel}>
              {new Date(record.recorded_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Retorna a data atual no fuso horário de Brasília
function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function Progress() {
  const { profile, user } = useAuth();

  const clientId = profile?.id || user?.id;
  const [weightHistory, setWeightHistory] = useState<WeightHistory[]>([]);
  const [weeklyProgress, setWeeklyProgress] = useState<DailyProgress[]>([]);
  const [todayWater, setTodayWater] = useState(0);
  const [profileReady, setProfileReady] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const waterGoal = 3000; // 3L meta diária

  // Garantir que profile existe no banco
  useEffect(() => {
    async function ensureProfile() {
      if (!user?.id) return;

      // Verificar se existe
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (!data) {
        // Criar profile
        await supabase.from('profiles').insert({
          id: user.id,
          role: 'client',
          full_name: user.email?.split('@')[0] || 'Usuário',
          email: user.email,
          is_active: true,
        });
      }

      setProfileReady(true);
    }

    ensureProfile();
  }, [user?.id, user?.email]);

  const fetchAllData = useCallback(async () => {
    if (!clientId || !profileReady) return;

    const today = getBrasiliaDate();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 6);

    // Buscar todos os dados em paralelo
    const [weightResult, weeklyResult, waterResult] = await Promise.all([
      supabase
        .from('weight_history')
        .select('*')
        .eq('client_id', clientId)
        .order('recorded_at', { ascending: false })
        .limit(10),
      supabase
        .from('daily_progress')
        .select('*')
        .eq('client_id', clientId)
        .gte('date', weekStart.toISOString().split('T')[0])
        .lte('date', today)
        .order('date'),
      supabase
        .from('daily_progress')
        .select('water_consumed_ml')
        .eq('client_id', clientId)
        .eq('date', today)
        .maybeSingle()
    ]);

    if (weightResult.data) setWeightHistory(weightResult.data);
    if (weeklyResult.data) setWeeklyProgress(weeklyResult.data);
    if (waterResult.data) setTodayWater(waterResult.data.water_consumed_ml || 0);
  }, [clientId, profileReady]);

  // Hook que gerencia refetch automático
  usePageData({
    userId: clientId,
    fetchData: fetchAllData,
  });

  // Garantir que dados sejam carregados quando profileReady mudar para true
  useEffect(() => {
    if (clientId && profileReady) {
      fetchAllData();
    }
  }, [clientId, profileReady, fetchAllData]);

  // Refs para permitir múltiplos cliques rápidos
  const pendingWaterRef = useRef<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleAddWeight() {
    if (!clientId || !profileReady || !newWeight) return;

    const weightValue = parseFloat(newWeight.replace(',', '.'));
    if (isNaN(weightValue) || weightValue <= 0 || weightValue > 500) {
      alert('Por favor, insira um peso válido');
      return;
    }

    setSavingWeight(true);

    try {
      const today = getBrasiliaDate();

      // Verificar se já existe registro para hoje
      const { data: existing } = await supabase
        .from('weight_history')
        .select('id')
        .eq('client_id', clientId)
        .gte('recorded_at', `${today}T00:00:00`)
        .lt('recorded_at', `${today}T23:59:59`)
        .maybeSingle();

      if (existing) {
        // Atualizar registro existente
        const { error: updateError } = await supabase
          .from('weight_history')
          .update({ weight_kg: weightValue })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Inserir novo registro
        const { error: insertError } = await supabase
          .from('weight_history')
          .insert({
            client_id: clientId,
            weight_kg: weightValue,
            recorded_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      // Atualizar peso atual no perfil
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ current_weight_kg: weightValue })
        .eq('id', clientId);

      if (profileError) throw profileError;

      setNewWeight('');
      await fetchAllData();
    } catch (error) {
      console.error('Erro ao salvar peso:', error);
      alert('Erro ao salvar peso. Tente novamente.');
    }

    setSavingWeight(false);
  }

  function addWater(amount: number) {
    if (!clientId || !profileReady) return;

    // Atualização otimista imediata usando functional update
    setTodayWater(prev => {
      const newAmount = Math.max(0, prev + amount);
      pendingWaterRef.current = newAmount;
      return newAmount;
    });

    // Debounce database save - aguarda 300ms após última interação
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    const today = getBrasiliaDate();

    saveTimeoutRef.current = setTimeout(async () => {
      const valueToSave = pendingWaterRef.current;
      if (valueToSave === null) return;

      try {
        // Tentar atualizar primeiro (mais comum após primeiro clique)
        const { data: updated, error: updateError } = await supabase
          .from('daily_progress')
          .update({ water_consumed_ml: valueToSave })
          .eq('client_id', clientId)
          .eq('date', today)
          .select('id')
          .maybeSingle();

        // Se não atualizou nenhum registro, inserir novo
        if (!updated && !updateError) {
          const { error: insertError } = await supabase.from('daily_progress').insert({
            client_id: clientId,
            date: today,
            water_consumed_ml: valueToSave,
            exercises_completed: [],
            meals_completed: [],
          });

          if (insertError && insertError.code !== '23505') {
            throw insertError;
          }
        }

        if (updateError) throw updateError;
      } catch (error) {
        console.error('Erro ao atualizar água:', error);
      }
    }, 300);
  }

  // Cálculos de água
  const waterPercentage = Math.min(100, Math.round((todayWater / waterGoal) * 100));
  const glassesConsumed = Math.floor(todayWater / 250);
  const totalGlasses = Math.ceil(waterGoal / 250); // 12 copos para 3L

  const currentWeight = profile?.current_weight_kg || weightHistory[0]?.weight_kg || 0;
  const startingWeight = profile?.starting_weight_kg || weightHistory[weightHistory.length - 1]?.weight_kg || currentWeight;
  const goalWeight = profile?.goal_weight_kg || currentWeight;
  const weightDiff = startingWeight - currentWeight;
  const isLosingWeight = weightDiff > 0;
  const progressToGoal = Math.abs(startingWeight - currentWeight) / Math.abs(startingWeight - goalWeight) * 100;

  // Plan progress calculations
  const planProgress = useMemo(() => {
    const planStartDate = profile?.plan_start_date;
    const planEndDate = profile?.plan_end_date;

    if (!planStartDate || !planEndDate) {
      return null;
    }

    const today = new Date(getBrasiliaDate());
    const startDate = new Date(planStartDate);
    const endDate = new Date(planEndDate);

    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysElapsed = Math.max(0, Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
    const percentComplete = totalDays > 0 ? Math.min(100, Math.round((daysElapsed / totalDays) * 100)) : 0;

    let status: 'pending' | 'active' | 'completed' = 'active';
    if (today < startDate) status = 'pending';
    else if (today > endDate) status = 'completed';

    return {
      startDate: planStartDate,
      endDate: planEndDate,
      daysElapsed,
      daysRemaining,
      totalDays,
      percentComplete,
      status
    };
  }, [profile?.plan_start_date, profile?.plan_end_date]);


  return (
    <PageContainer>
      <Header title="Meu Progresso" subtitle="Acompanhe sua evolução" showBack />

      <main className={styles.content}>
        <Card variant="gradient" className={styles.mainCard}>
          <div className={styles.weightSection}>
            <div className={styles.weightMain}>
              <span className={styles.weightValue}>{currentWeight.toFixed(1)}</span>
              <span className={styles.weightUnit}>kg</span>
            </div>
            <div className={`${styles.weightChange} ${isLosingWeight ? styles.positive : styles.negative}`}>
              {isLosingWeight ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
              <span>{Math.abs(weightDiff).toFixed(1)}kg</span>
            </div>
          </div>
          <div className={styles.goalProgress}>
            <div className={styles.goalLabels}>
              <span>Início: {startingWeight.toFixed(1)}kg</span>
              <span>Meta: {goalWeight.toFixed(1)}kg</span>
            </div>
            <ProgressBar value={Math.min(progressToGoal, 100)} variant="accent" />
          </div>
        </Card>

        {/* Plan Progress Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Seu Plano</h2>

          <Card className={styles.planCard}>
            {planProgress ? (
              <>
                {/* Status Badge */}
                <div className={`${styles.planStatusBadge} ${styles[planProgress.status]}`}>
                  {planProgress.status === 'active' && (
                    <>
                      <span className={styles.statusDot} />
                      Plano Ativo
                    </>
                  )}
                  {planProgress.status === 'completed' && (
                    <>
                      <CheckCircle2 size={14} />
                      Plano Concluido
                    </>
                  )}
                  {planProgress.status === 'pending' && (
                    <>
                      <Clock size={14} />
                      Plano Nao Iniciado
                    </>
                  )}
                </div>

                {/* Dates Display */}
                <div className={styles.planDatesDisplay}>
                  <div className={styles.planDateBox}>
                    <span className={styles.planDateLabel}>Inicio</span>
                    <span className={styles.planDateValue}>
                      {new Date(planProgress.startDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <div className={styles.planDateBox}>
                    <span className={styles.planDateLabel}>Termino</span>
                    <span className={styles.planDateValue}>
                      {new Date(planProgress.endDate).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className={styles.planProgressBar}>
                  <div className={styles.planProgressLabels}>
                    <span>Progresso</span>
                    <span>{planProgress.percentComplete}%</span>
                  </div>
                  <ProgressBar
                    value={planProgress.percentComplete}
                    variant={planProgress.status === 'completed' ? 'accent' : 'success'}
                  />
                </div>

                {/* Days Counter */}
                <div className={styles.daysCounter}>
                  <div className={`${styles.dayBox} ${styles.elapsed}`}>
                    <span className={styles.dayNumber}>{planProgress.daysElapsed}</span>
                    <span className={styles.dayLabel}>{planProgress.daysElapsed === 1 ? 'dia' : 'dias'}</span>
                    <span className={styles.daySubLabel}>completados</span>
                  </div>
                  <div className={`${styles.dayBox} ${styles.total}`}>
                    <span className={styles.dayNumber}>{planProgress.totalDays}</span>
                    <span className={styles.dayLabel}>{planProgress.totalDays === 1 ? 'dia' : 'dias'}</span>
                    <span className={styles.daySubLabel}>total</span>
                  </div>
                  <div className={`${styles.dayBox} ${planProgress.daysRemaining <= 7 ? styles.urgent : styles.remaining}`}>
                    <span className={styles.dayNumber}>{planProgress.daysRemaining}</span>
                    <span className={styles.dayLabel}>{planProgress.daysRemaining === 1 ? 'dia' : 'dias'}</span>
                    <span className={styles.daySubLabel}>restantes</span>
                  </div>
                </div>

                {/* Motivational Message */}
                {planProgress.status === 'active' && (
                  <div className={styles.motivationalMessage}>
                    {planProgress.daysRemaining <= 7 ? (
                      <p>Reta final! Voce esta quase la, continue firme!</p>
                    ) : planProgress.percentComplete >= 50 ? (
                      <p>Mais da metade concluida! Continue assim!</p>
                    ) : (
                      <p>Voce esta no caminho certo! Mantenha o foco!</p>
                    )}
                  </div>
                )}

                {planProgress.status === 'completed' && (
                  <div className={`${styles.motivationalMessage} ${styles.completed}`}>
                    <p>Parabens! Voce completou seu plano! Fale com seu nutricionista sobre os proximos passos.</p>
                  </div>
                )}
              </>
            ) : (
              <div className={styles.planNotSet}>
                <CalendarDays size={32} className={styles.planNotSetIcon} />
                <p>Periodo do plano ainda nao definido pelo nutricionista.</p>
              </div>
            )}
          </Card>
        </section>

        {/* Seção de Água */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Agua de Hoje</h2>

          <Card className={styles.waterCard}>
            <div className={styles.waterHeader}>
              <Droplets size={24} className={styles.waterIcon} />
              <div className={styles.waterAmount}>
                <span className={styles.waterValue}>{(todayWater / 1000).toFixed(1)}L</span>
                <span className={styles.waterGoal}>/ {(waterGoal / 1000).toFixed(1)}L</span>
              </div>
            </div>

            <div className={styles.waterProgressWrapper}>
              <ProgressBar value={waterPercentage} variant="accent" />
              <span className={styles.waterPercent}>{waterPercentage}% da meta</span>
            </div>

            <div className={styles.glassesGrid}>
              {Array.from({ length: totalGlasses }).map((_, index) => (
                <span
                  key={index}
                  className={`${styles.glass} ${index < glassesConsumed ? styles.filled : ''}`}
                >
                  🥛
                </span>
              ))}
            </div>
            <p className={styles.glassesLabel}>
              {glassesConsumed} de {totalGlasses} copos
            </p>

            <div className={styles.waterButtons}>
              <button
                className={styles.waterBtnSmall}
                onClick={() => addWater(-250)}
                disabled={todayWater <= 0}
              >
                <Minus size={16} />
              </button>
              <button
                className={styles.waterBtnAdd}
                onClick={() => addWater(250)}
              >
                <Plus size={18} />
                250ml
              </button>
              <button
                className={styles.waterBtnAdd}
                onClick={() => addWater(500)}
              >
                <Plus size={18} />
                500ml
              </button>
              <button
                className={styles.waterBtnAdd}
                onClick={() => addWater(1000)}
              >
                <Plus size={18} />
                1L
              </button>
            </div>
          </Card>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Histórico de Peso</h2>

          <Card className={styles.addWeightCard}>
            <div className={styles.addWeightForm}>
              <Scale size={20} className={styles.scaleIcon} />
              <input
                type="number"
                step="0.1"
                min="0"
                max="500"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                placeholder="Seu peso hoje (kg)"
                className={styles.weightInput}
              />
              <button
                onClick={handleAddWeight}
                disabled={savingWeight || !newWeight}
                className={styles.addWeightBtn}
              >
                {savingWeight ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </Card>

          {weightHistory.length > 0 ? (
            <WeightChart weightHistory={weightHistory} styles={styles} />
          ) : (
            <Card className={styles.emptyState}>
              <p>Nenhum registro de peso ainda</p>
            </Card>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Últimos 7 dias</h2>

          <div className={styles.weekGrid}>
            {Array.from({ length: 7 }, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (6 - i));
              const dateStr = date.toISOString().split('T')[0];
              const dayProgress = weeklyProgress.find(p => p.date === dateStr);
              const hasActivity = dayProgress && (
                dayProgress.exercises_completed.length > 0 ||
                dayProgress.meals_completed.length > 0
              );

              return (
                <div
                  key={i}
                  className={`${styles.dayCell} ${hasActivity ? styles.active : ''}`}
                >
                  <span className={styles.dayName}>
                    {date.toLocaleDateString('pt-BR', { weekday: 'short' }).slice(0, 3)}
                  </span>
                  <span className={styles.dayNumber}>{date.getDate()}</span>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <BottomNav />
    </PageContainer>
  );
}
