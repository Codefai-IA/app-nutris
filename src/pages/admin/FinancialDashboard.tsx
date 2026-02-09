import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { PageContainer } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import type { Payment, PaymentWithPlan, Profile } from '../../types/database';
import styles from './FinancialDashboard.module.css';

interface RevenueStats {
  today: number;
  week: number;
  month: number;
  total: number;
  pendingCount: number;
  approvedCount: number;
}

export function FinancialDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<RevenueStats>({
    today: 0,
    week: 0,
    month: 0,
    total: 0,
    pendingCount: 0,
    approvedCount: 0,
  });
  const [recentPayments, setRecentPayments] = useState<PaymentWithPlan[]>([]);
  const [expiringClients, setExpiringClients] = useState<Profile[]>([]);

  useEffect(() => {
    if (profile?.id) {
      loadData();
    }
  }, [profile?.id]);

  const loadData = async () => {
    if (!profile?.id) return;

    try {
      const [paymentsResult, clientsResult] = await Promise.all([
        loadPayments(),
        loadExpiringClients(),
      ]);

      if (paymentsResult) {
        calculateStats(paymentsResult);
        setRecentPayments(paymentsResult.slice(0, 10));
      }

      if (clientsResult) {
        setExpiringClients(clientsResult);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPayments = async (): Promise<PaymentWithPlan[] | null> => {
    const { data, error } = await supabase
      .from('payments')
      .select(`
        *,
        plan:subscription_plans(name, duration_days),
        client:profiles!payments_client_id_fkey(full_name, email)
      `)
      .eq('owner_id', profile!.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading payments:', error);
      return null;
    }

    return data as PaymentWithPlan[];
  };

  const loadExpiringClients = async (): Promise<Profile[] | null> => {
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .gte('plan_end_date', today.toISOString().split('T')[0])
      .lte('plan_end_date', in7Days.toISOString().split('T')[0])
      .order('plan_end_date', { ascending: true });

    if (error) {
      console.error('Error loading expiring clients:', error);
      return null;
    }

    return data;
  };

  const calculateStats = (payments: Payment[]) => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const approvedPayments = payments.filter((p) => p.status === 'approved');
    const pendingPayments = payments.filter((p) => p.status === 'pending');

    const stats: RevenueStats = {
      today: 0,
      week: 0,
      month: 0,
      total: 0,
      pendingCount: pendingPayments.length,
      approvedCount: approvedPayments.length,
    };

    for (const payment of approvedPayments) {
      const paidAt = payment.paid_at ? new Date(payment.paid_at) : new Date(payment.created_at);
      const amount = payment.amount_cents;

      stats.total += amount;

      if (paidAt >= monthStart) {
        stats.month += amount;
      }

      if (paidAt >= weekStart) {
        stats.week += amount;
      }

      if (paidAt >= todayStart) {
        stats.today += amount;
      }
    }

    setStats(stats);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const formatCurrency = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'approved':
        return { icon: CheckCircle, label: 'Aprovado', className: styles.statusApproved };
      case 'pending':
        return { icon: Clock, label: 'Pendente', className: styles.statusPending };
      case 'rejected':
        return { icon: XCircle, label: 'Rejeitado', className: styles.statusRejected };
      case 'expired':
        return { icon: XCircle, label: 'Expirado', className: styles.statusExpired };
      default:
        return { icon: Clock, label: status, className: styles.statusPending };
    }
  };

  const getMethodLabel = (method: string | null) => {
    switch (method) {
      case 'pix':
        return 'PIX';
      case 'boleto':
        return 'Boleto';
      case 'credit_card':
        return 'Cartao';
      default:
        return method || '-';
    }
  };

  const getDaysUntilExpiration = (dateStr: string | null) => {
    if (!dateStr) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endDate = new Date(dateStr);
    endDate.setHours(0, 0, 0, 0);
    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  if (loading) {
    return (
      <PageContainer hasBottomNav={false}>
        <div className={styles.loading}>Carregando dados financeiros...</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer hasBottomNav={false}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/admin')}>
          <ArrowLeft size={20} />
        </button>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>Financeiro</h1>
          <p className={styles.subtitle}>Acompanhe sua receita e pagamentos</p>
        </div>
        <button className={styles.refreshButton} onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw size={20} className={refreshing ? styles.spinning : ''} />
        </button>
      </header>

      <main className={styles.content}>
        {/* Revenue Cards */}
        <div className={styles.statsGrid}>
          <Card className={styles.statCard}>
            <div className={styles.statIcon}>
              <DollarSign size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Hoje</span>
              <span className={styles.statValue}>{formatCurrency(stats.today)}</span>
            </div>
          </Card>

          <Card className={styles.statCard}>
            <div className={styles.statIcon}>
              <Calendar size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Ultimos 7 dias</span>
              <span className={styles.statValue}>{formatCurrency(stats.week)}</span>
            </div>
          </Card>

          <Card className={styles.statCard}>
            <div className={styles.statIcon}>
              <TrendingUp size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Este mes</span>
              <span className={styles.statValue}>{formatCurrency(stats.month)}</span>
            </div>
          </Card>

          <Card className={styles.statCard}>
            <div className={styles.statIcon}>
              <Users size={20} />
            </div>
            <div className={styles.statInfo}>
              <span className={styles.statLabel}>Pagamentos</span>
              <span className={styles.statValue}>
                <span className={styles.approvedCount}>{stats.approvedCount}</span>
                {stats.pendingCount > 0 && (
                  <span className={styles.pendingCount}> / {stats.pendingCount} pend.</span>
                )}
              </span>
            </div>
          </Card>
        </div>

        {/* Expiring Clients Alert */}
        {expiringClients.length > 0 && (
          <Card className={styles.alertCard}>
            <div className={styles.alertHeader}>
              <AlertTriangle size={20} className={styles.alertIcon} />
              <span className={styles.alertTitle}>Planos expirando em breve</span>
            </div>
            <div className={styles.expiringList}>
              {expiringClients.map((client) => {
                const days = getDaysUntilExpiration(client.plan_end_date);
                return (
                  <div
                    key={client.id}
                    className={styles.expiringItem}
                    onClick={() => navigate(`/admin/aluno/${client.id}`)}
                  >
                    <div className={styles.expiringInfo}>
                      <span className={styles.expiringName}>{client.full_name}</span>
                      <span className={styles.expiringEmail}>{client.email}</span>
                    </div>
                    <span className={`${styles.expiringDays} ${days === 0 ? styles.expiringToday : ''}`}>
                      {days === 0 ? 'Hoje' : days === 1 ? 'Amanha' : `${days} dias`}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Recent Payments */}
        <Card className={styles.section}>
          <h3 className={styles.sectionTitle}>Pagamentos Recentes</h3>

          {recentPayments.length === 0 ? (
            <p className={styles.emptyText}>Nenhum pagamento registrado ainda.</p>
          ) : (
            <div className={styles.paymentsList}>
              {recentPayments.map((payment) => {
                const statusConfig = getStatusConfig(payment.status);
                const StatusIcon = statusConfig.icon;
                return (
                  <div key={payment.id} className={styles.paymentItem}>
                    <div className={styles.paymentMain}>
                      <div className={styles.paymentInfo}>
                        <span className={styles.paymentName}>{payment.customer_name}</span>
                        <span className={styles.paymentMeta}>
                          {getMethodLabel(payment.payment_method)} • {formatDateTime(payment.created_at)}
                        </span>
                      </div>
                      <div className={styles.paymentRight}>
                        <span className={styles.paymentAmount}>{formatCurrency(payment.amount_cents)}</span>
                        <span className={`${styles.paymentStatus} ${statusConfig.className}`}>
                          <StatusIcon size={12} />
                          {statusConfig.label}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </main>
    </PageContainer>
  );
}
