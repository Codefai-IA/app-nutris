import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Utensils, Dumbbell, Trash2, ChevronRight, Clock, AlertCircle, CalendarDays, Check, FileText } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header } from '../../components/layout';
import { Card, Button, Modal } from '../../components/ui';
import type { Profile, DietPlan, WorkoutPlan } from '../../types/database';
import styles from './ClientProfile.module.css';

export function ClientProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<Profile | null>(null);
  const [dietPlan, setDietPlan] = useState<DietPlan | null>(null);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Plan dates state
  const [planStartDate, setPlanStartDate] = useState('');
  const [planEndDate, setPlanEndDate] = useState('');
  const [savingDates, setSavingDates] = useState(false);
  const [datesSaved, setDatesSaved] = useState(false);

  // Fetch all data in parallel for better performance
  const fetchAllData = useCallback(async () => {
    if (!id) return;

    setLoading(true);

    // Reset state to avoid showing stale data
    setClient(null);
    setDietPlan(null);
    setWorkoutPlan(null);

    const [clientResult, dietResult, workoutResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('diet_plans')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('workout_plans')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
    ]);

    if (clientResult.data) {
      setClient(clientResult.data);
      setPlanStartDate(clientResult.data.plan_start_date || '');
      setPlanEndDate(clientResult.data.plan_end_date || '');
    }

    if (dietResult.data?.[0]) {
      setDietPlan(dietResult.data[0]);
    }

    if (workoutResult.data?.[0]) {
      setWorkoutPlan(workoutResult.data[0]);
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  async function handleSavePlanDates() {
    if (!id) return;

    if (planStartDate && planEndDate && new Date(planEndDate) <= new Date(planStartDate)) {
      alert('A data final deve ser posterior a data inicial');
      return;
    }

    setSavingDates(true);

    try {
      await supabase
        .from('profiles')
        .update({
          plan_start_date: planStartDate || null,
          plan_end_date: planEndDate || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      setDatesSaved(true);
      setTimeout(() => setDatesSaved(false), 2000);
    } catch (error) {
      console.error('Error saving plan dates:', error);
    } finally {
      setSavingDates(false);
    }
  }

  // Calculate plan duration for preview
  const planDuration = planStartDate && planEndDate
    ? Math.ceil((new Date(planEndDate).getTime() - new Date(planStartDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  function formatLastUpdated(dateStr: string | null): string {
    if (!dateStr) return 'Não configurado';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getUpdateStatus(dateStr: string | null): 'ok' | 'warning' | 'notset' {
    if (!dateStr) return 'notset';
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) return 'ok';
    return 'warning';
  }

  async function handleDelete() {
    if (!id) return;

    await supabase.from('profiles').update({ is_active: false }).eq('id', id);

    navigate('/admin', { replace: true });
  }

  if (loading) {
    return (
      <PageContainer hasBottomNav={false}>
        <Header title="Carregando..." showBack />
        <div className={styles.loading}>Carregando dados...</div>
      </PageContainer>
    );
  }

  if (!client) {
    return (
      <PageContainer hasBottomNav={false}>
        <Header title="Aluno não encontrado" showBack />
        <div className={styles.loading}>Aluno não encontrado</div>
      </PageContainer>
    );
  }

  const height = client.height_cm ? client.height_cm / 100 : 0;
  const bmi = height > 0 && client.current_weight_kg
    ? client.current_weight_kg / (height * height)
    : 0;

  return (
    <PageContainer hasBottomNav={false}>
      <Header title={client.full_name} showBack />

      <main className={styles.content}>
        <Card className={styles.profileCard}>
          <div className={styles.avatar}>
            {client.photo_url ? (
              <img src={client.photo_url} alt="" />
            ) : (
              <span>{client.full_name.charAt(0)}</span>
            )}
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Altura</span>
              <span className={styles.statValue}>{height.toFixed(2)}m</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Peso</span>
              <span className={styles.statValue}>{client.current_weight_kg?.toFixed(1) || '-'}kg</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Idade</span>
              <span className={styles.statValue}>{client.age || '-'} anos</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>IMC</span>
              <span className={styles.statValue}>{bmi > 0 ? bmi.toFixed(1) : '-'}</span>
            </div>
          </div>
        </Card>

        {/* Plan Dates Section */}
        <Card className={styles.planDatesCard}>
          <h3 className={styles.planDatesTitle}>
            <CalendarDays size={20} />
            Periodo do Plano
          </h3>

          <div className={styles.planDatesGrid}>
            <div className={styles.dateField}>
              <label className={styles.dateLabel}>Data de Inicio</label>
              <input
                type="date"
                value={planStartDate}
                onChange={(e) => setPlanStartDate(e.target.value)}
                className={styles.dateInput}
              />
            </div>
            <div className={styles.dateField}>
              <label className={styles.dateLabel}>Data de Termino</label>
              <input
                type="date"
                value={planEndDate}
                onChange={(e) => setPlanEndDate(e.target.value)}
                className={styles.dateInput}
              />
            </div>
          </div>

          {planDuration > 0 && (
            <div className={styles.planDurationPreview}>
              <span>Duracao do plano: <strong>{planDuration} dias</strong> ({Math.round(planDuration / 7)} semanas)</span>
            </div>
          )}

          <button
            onClick={handleSavePlanDates}
            disabled={savingDates}
            className={`${styles.saveDatesBtn} ${datesSaved ? styles.saved : ''}`}
          >
            {savingDates ? (
              'Salvando...'
            ) : datesSaved ? (
              <>
                <Check size={16} />
                Salvo!
              </>
            ) : (
              'Salvar Datas'
            )}
          </button>
        </Card>

        <div className={styles.menuList}>
          <Link to={`/admin/aluno/${id}/anamnese`} className={styles.menuLink}>
            <Card hoverable className={styles.menuItem}>
              <div className={styles.menuIcon}>
                <ClipboardList size={22} />
              </div>
              <div className={styles.menuContent}>
                <span className={styles.menuText}>Ver Anamnese</span>
              </div>
              <ChevronRight size={20} className={styles.menuArrow} />
            </Card>
          </Link>

          <Link to={`/admin/aluno/${id}/dieta`} className={styles.menuLink}>
            <Card hoverable className={styles.menuItem}>
              <div className={`${styles.menuIcon} ${styles[getUpdateStatus(dietPlan?.updated_at || null)]}`}>
                <Utensils size={22} />
              </div>
              <div className={styles.menuContent}>
                <span className={styles.menuText}>Gerenciar Dieta</span>
                <span className={`${styles.menuStatus} ${styles[getUpdateStatus(dietPlan?.updated_at || null)]}`}>
                  {dietPlan?.updated_at ? (
                    <>
                      <Clock size={12} />
                      Atualizado em {formatLastUpdated(dietPlan.updated_at)}
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} />
                      Não configurado
                    </>
                  )}
                </span>
              </div>
              <ChevronRight size={20} className={styles.menuArrow} />
            </Card>
          </Link>

          <Link to={`/admin/aluno/${id}/treino`} className={styles.menuLink}>
            <Card hoverable className={styles.menuItem}>
              <div className={`${styles.menuIcon} ${styles[getUpdateStatus(workoutPlan?.updated_at || null)]}`}>
                <Dumbbell size={22} />
              </div>
              <div className={styles.menuContent}>
                <span className={styles.menuText}>Gerenciar Treino</span>
                <span className={`${styles.menuStatus} ${styles[getUpdateStatus(workoutPlan?.updated_at || null)]}`}>
                  {workoutPlan?.updated_at ? (
                    <>
                      <Clock size={12} />
                      Atualizado em {formatLastUpdated(workoutPlan.updated_at)}
                    </>
                  ) : (
                    <>
                      <AlertCircle size={12} />
                      Não configurado
                    </>
                  )}
                </span>
              </div>
              <ChevronRight size={20} className={styles.menuArrow} />
            </Card>
          </Link>

          <Link to={`/admin/aluno/${id}/orientacoes`} className={styles.menuLink}>
            <Card hoverable className={styles.menuItem}>
              <div className={styles.menuIcon}>
                <FileText size={22} />
              </div>
              <div className={styles.menuContent}>
                <span className={styles.menuText}>Orientações Gerais</span>
                <span className={styles.menuStatus}>
                  Suplementos, manipulados e mais
                </span>
              </div>
              <ChevronRight size={20} className={styles.menuArrow} />
            </Card>
          </Link>
        </div>

        <Button
          variant="danger"
          fullWidth
          onClick={() => setShowDeleteModal(true)}
        >
          <Trash2 size={18} />
          Excluir Aluno
        </Button>
      </main>

      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Excluir Aluno"
      >
        <div className={styles.deleteModal}>
          <p>Tem certeza que deseja excluir {client.full_name}?</p>
          <p className={styles.deleteWarning}>
            Esta ação irá desativar o aluno e ele não terá mais acesso ao app.
          </p>
          <div className={styles.deleteButtons}>
            <Button variant="ghost" onClick={() => setShowDeleteModal(false)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              Excluir
            </Button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
