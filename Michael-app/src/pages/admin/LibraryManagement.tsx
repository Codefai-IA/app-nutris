import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageContainer } from '../../components/layout';
import { ExerciseLibraryManager } from '../../components/admin/ExerciseLibraryManager';
import { FoodLibraryManager } from '../../components/admin/FoodLibraryManager';
import { DietTemplatesManager } from '../../components/admin/DietTemplatesManager';
import { WorkoutTemplatesManager } from '../../components/admin/WorkoutTemplatesManager';
import styles from './LibraryManagement.module.css';

type TabType = 'exercises' | 'foods' | 'dietTemplates' | 'workoutTemplates';

export function LibraryManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('exercises');

  return (
    <PageContainer hasBottomNav={false}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/admin')}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Biblioteca</h1>
          <p className={styles.subtitle}>Gerencie exercicios, alimentos e templates</p>
        </div>
      </header>

      <div className={styles.tabs}>
        <button
          onClick={() => setActiveTab('exercises')}
          className={`${styles.tab} ${activeTab === 'exercises' ? styles.tabActive : ''}`}
        >
          Exercicios
        </button>
        <button
          onClick={() => setActiveTab('foods')}
          className={`${styles.tab} ${activeTab === 'foods' ? styles.tabActive : ''}`}
        >
          Alimentos
        </button>
        <button
          onClick={() => setActiveTab('dietTemplates')}
          className={`${styles.tab} ${activeTab === 'dietTemplates' ? styles.tabActive : ''}`}
        >
          Templates Dieta
        </button>
        <button
          onClick={() => setActiveTab('workoutTemplates')}
          className={`${styles.tab} ${activeTab === 'workoutTemplates' ? styles.tabActive : ''}`}
        >
          Templates Treino
        </button>
      </div>

      <main className={styles.content}>
        <div style={{ display: activeTab === 'exercises' ? 'block' : 'none' }}>
          <ExerciseLibraryManager />
        </div>
        <div style={{ display: activeTab === 'foods' ? 'block' : 'none' }}>
          <FoodLibraryManager />
        </div>
        <div style={{ display: activeTab === 'dietTemplates' ? 'block' : 'none' }}>
          <DietTemplatesManager />
        </div>
        <div style={{ display: activeTab === 'workoutTemplates' ? 'block' : 'none' }}>
          <WorkoutTemplatesManager />
        </div>
      </main>
    </PageContainer>
  );
}
