import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Dumbbell, Utensils, ChevronRight, Flame } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { usePageData } from '../../hooks';
import { PageContainer, BottomNav } from '../../components/layout';
import { Card, ProgressBar } from '../../components/ui';
import type { DailyProgress } from '../../types/database';
import styles from './Home.module.css';

// Retorna a data atual no fuso horario de Brasilia
function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function Home() {
  const { profile } = useAuth();
  const [progress, setProgress] = useState<DailyProgress | null>(null);
  const [weeklyStats, setWeeklyStats] = useState({ workouts: 0, meals: 0, totalWorkouts: 7, totalMeals: 7 });

  const fetchAllData = useCallback(async () => {
    if (!profile?.id) return;

    const today = getBrasiliaDate();
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());

    // Buscar progresso de hoje e semanal em paralelo
    const [todayResult, weekResult] = await Promise.all([
      supabase
        .from('daily_progress')
        .select('*')
        .eq('client_id', profile.id)
        .eq('date', today)
        .maybeSingle(),
      supabase
        .from('daily_progress')
        .select('*')
        .eq('client_id', profile.id)
        .gte('date', weekStart.toISOString().split('T')[0])
        .lte('date', today)
    ]);

    if (todayResult.data) {
      setProgress(todayResult.data);
    } else {
      setProgress(null);
    }

    if (weekResult.data) {
      const workouts = weekResult.data.filter(d => d.exercises_completed?.length > 0).length;
      const meals = weekResult.data.filter(d => d.meals_completed?.length > 0).length;
      setWeeklyStats({ workouts, meals, totalWorkouts: 7, totalMeals: 7 });
    }
  }, [profile?.id]);

  usePageData({
    userId: profile?.id,
    fetchData: fetchAllData,
  });

  const firstName = profile?.full_name?.split(' ')[0] || 'Aluno';
  const weeklyPercentage = Math.round(
    ((weeklyStats.workouts + weeklyStats.meals) / (weeklyStats.totalWorkouts + weeklyStats.totalMeals)) * 100
  );

  return (
    <PageContainer>
      <header className={styles.header}>
        <div className={styles.greeting}>
          <h1 className={styles.title}>Olá, {firstName}!</h1>
          <p className={styles.subtitle}>Vamos treinar hoje?</p>
        </div>
        <img
          src="/logo-icon.png"
          alt="App Logo"
          className={styles.logo}
        />
      </header>

      <main className={styles.content}>
        <Card variant="gradient" className={styles.progressCard}>
          <div className={styles.progressHeader}>
            <Flame size={20} />
            <span>Progresso Semanal</span>
          </div>
          <div className={styles.progressBarWrapper}>
            <ProgressBar value={weeklyPercentage} showLabel />
          </div>
          <p className={styles.progressStats}>
            {weeklyStats.workouts}/{weeklyStats.totalWorkouts} treinos • {weeklyStats.meals}/{weeklyStats.totalMeals} dieta
          </p>
        </Card>

        <a href="https://www.instagram.com/michael.nutri/" target="_blank" rel="noopener noreferrer">
          <img
            src="/card4.png"
            alt="Promocional"
            className={styles.bannerImage}
          />
        </a>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Hoje</h2>

          <Link to="/app/treino" className={styles.cardLink}>
            <Card hoverable className={styles.todayCard}>
              <div className={styles.cardIcon}>
                <Dumbbell size={24} />
              </div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>Treino do Dia</h3>
                <p className={styles.cardSubtitle}>
                  {progress?.exercises_completed.length || 0} exercícios concluídos
                </p>
                <div className={styles.cardProgress}>
                  <ProgressBar
                    value={progress?.exercises_completed.length || 0}
                    max={8}
                    size="sm"
                  />
                </div>
              </div>
              <ChevronRight size={20} className={styles.cardArrow} />
            </Card>
          </Link>

          <Link to="/app/dieta" className={styles.cardLink}>
            <Card hoverable className={styles.todayCard}>
              <div className={styles.cardIcon}>
                <Utensils size={24} />
              </div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardTitle}>Dieta do Dia</h3>
                <p className={styles.cardSubtitle}>
                  {progress?.meals_completed.length || 0} refeições concluídas
                </p>
                <div className={styles.cardProgress}>
                  <ProgressBar
                    value={progress?.meals_completed.length || 0}
                    max={6}
                    size="sm"
                  />
                </div>
              </div>
              <ChevronRight size={20} className={styles.cardArrow} />
            </Card>
          </Link>
        </section>

      </main>

      <BottomNav />
    </PageContainer>
  );
}
