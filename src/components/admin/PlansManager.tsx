import { useState, useEffect } from 'react';
import { Plus, X, Star, Edit2, Trash2, GripVertical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card, Button, Input } from '../ui';
import type { SubscriptionPlan } from '../../types/database';
import styles from './PlansManager.module.css';

interface PlansManagerProps {
  ownerId: string;
}

interface PlanFormData {
  name: string;
  description: string;
  duration_days: number;
  price_cents: number;
  features: string[];
  is_active: boolean;
  is_featured: boolean;
}

const defaultFormData: PlanFormData = {
  name: '',
  description: '',
  duration_days: 30,
  price_cents: 0,
  features: [],
  is_active: true,
  is_featured: false,
};

export function PlansManager({ ownerId }: PlansManagerProps) {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<PlanFormData>(defaultFormData);
  const [newFeature, setNewFeature] = useState('');

  useEffect(() => {
    if (ownerId) {
      loadPlans();
    }
  }, [ownerId]);

  const loadPlans = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('owner_id', ownerId)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error loading plans:', error);
      } else {
        setPlans(data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Nome do plano e obrigatorio');
      return;
    }

    if (formData.price_cents <= 0) {
      alert('Valor deve ser maior que zero');
      return;
    }

    setSaving(true);

    try {
      const planData = {
        owner_id: ownerId,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        duration_days: formData.duration_days,
        price_cents: formData.price_cents,
        features: formData.features,
        is_active: formData.is_active,
        is_featured: formData.is_featured,
        display_order: editingPlan?.display_order ?? plans.length,
      };

      if (editingPlan) {
        const { error } = await supabase
          .from('subscription_plans')
          .update(planData)
          .eq('id', editingPlan.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('subscription_plans')
          .insert(planData);

        if (error) throw error;
      }

      resetForm();
      await loadPlans();
    } catch (error) {
      console.error('Error saving plan:', error);
      alert('Erro ao salvar plano');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setFormData({
      name: plan.name,
      description: plan.description || '',
      duration_days: plan.duration_days,
      price_cents: plan.price_cents,
      features: plan.features || [],
      is_active: plan.is_active,
      is_featured: plan.is_featured,
    });
    setShowModal(true);
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    if (!confirm(`Tem certeza que deseja excluir o plano "${plan.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('subscription_plans')
        .delete()
        .eq('id', plan.id);

      if (error) throw error;
      loadPlans();
    } catch (error) {
      console.error('Error deleting plan:', error);
      alert('Erro ao excluir plano');
    }
  };

  const handleToggleActive = async (plan: SubscriptionPlan) => {
    try {
      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', plan.id);

      if (error) throw error;
      loadPlans();
    } catch (error) {
      console.error('Error toggling plan:', error);
    }
  };

  const handleToggleFeatured = async (plan: SubscriptionPlan) => {
    try {
      // First, unfeature all other plans if we're featuring this one
      if (!plan.is_featured) {
        await supabase
          .from('subscription_plans')
          .update({ is_featured: false })
          .eq('owner_id', ownerId);
      }

      const { error } = await supabase
        .from('subscription_plans')
        .update({ is_featured: !plan.is_featured })
        .eq('id', plan.id);

      if (error) throw error;
      loadPlans();
    } catch (error) {
      console.error('Error toggling featured:', error);
    }
  };

  const resetForm = () => {
    setShowModal(false);
    setEditingPlan(null);
    setFormData(defaultFormData);
    setNewFeature('');
  };

  const addFeature = () => {
    if (newFeature.trim()) {
      setFormData((prev) => ({
        ...prev,
        features: [...prev.features, newFeature.trim()],
      }));
      setNewFeature('');
    }
  };

  const removeFeature = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const handlePriceChange = (value: string) => {
    // Remove non-numeric characters
    const numericValue = value.replace(/\D/g, '');
    setFormData((prev) => ({ ...prev, price_cents: parseInt(numericValue) || 0 }));
  };

  if (loading) {
    return <div className={styles.loading}>Carregando planos...</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Planos de Assinatura</h3>
          <p className={styles.subtitle}>Gerencie os planos disponiveis para seus clientes</p>
        </div>
        <button className={styles.addButton} onClick={() => setShowModal(true)}>
          <Plus size={18} />
          Novo Plano
        </button>
      </div>

      {plans.length === 0 ? (
        <Card className={styles.emptyCard}>
          <p className={styles.emptyText}>
            Nenhum plano cadastrado ainda. Crie seu primeiro plano para comecar a receber pagamentos.
          </p>
        </Card>
      ) : (
        <div className={styles.plansList}>
          {plans.map((plan) => (
            <Card key={plan.id} className={`${styles.planCard} ${!plan.is_active ? styles.planInactive : ''}`}>
              <div className={styles.planHeader}>
                <div className={styles.planGrip}>
                  <GripVertical size={16} />
                </div>
                <div className={styles.planInfo}>
                  <div className={styles.planTitleRow}>
                    <h4 className={styles.planName}>{plan.name}</h4>
                    {plan.is_featured && (
                      <span className={styles.featuredBadge}>
                        <Star size={12} />
                        Destaque
                      </span>
                    )}
                    {!plan.is_active && (
                      <span className={styles.inactiveBadge}>Inativo</span>
                    )}
                  </div>
                  <div className={styles.planMeta}>
                    <span className={styles.planPrice}>{formatPrice(plan.price_cents)}</span>
                    <span className={styles.planDuration}>
                      {plan.duration_days} {plan.duration_days === 1 ? 'dia' : 'dias'}
                    </span>
                  </div>
                  {plan.description && (
                    <p className={styles.planDescription}>{plan.description}</p>
                  )}
                  {plan.features && plan.features.length > 0 && (
                    <ul className={styles.planFeatures}>
                      {plan.features.slice(0, 3).map((feature, idx) => (
                        <li key={idx}>{feature}</li>
                      ))}
                      {plan.features.length > 3 && (
                        <li className={styles.moreFeatures}>+{plan.features.length - 3} mais</li>
                      )}
                    </ul>
                  )}
                </div>
                <div className={styles.planActions}>
                  <button
                    className={`${styles.actionBtn} ${plan.is_featured ? styles.featured : ''}`}
                    onClick={() => handleToggleFeatured(plan)}
                    title={plan.is_featured ? 'Remover destaque' : 'Destacar plano'}
                  >
                    <Star size={16} />
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleEdit(plan)}
                    title="Editar plano"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => handleDelete(plan)}
                    title="Excluir plano"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => resetForm()}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingPlan ? 'Editar Plano' : 'Novo Plano'}</h3>
              <button className={styles.closeBtn} onClick={resetForm}>
                <X size={20} />
              </button>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <Input
                label="Nome do Plano"
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Plano Mensal"
              />

              <div className={styles.formGroup}>
                <label>Descricao (opcional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva o que esta incluso no plano..."
                  rows={2}
                />
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Valor (R$)</label>
                  <input
                    type="text"
                    value={formData.price_cents ? formatPrice(formData.price_cents).replace('R$', '').trim() : ''}
                    onChange={(e) => handlePriceChange(e.target.value)}
                    placeholder="0,00"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Duracao (dias)</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.duration_days}
                    onChange={(e) => setFormData((prev) => ({ ...prev, duration_days: parseInt(e.target.value) || 30 }))}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label>Beneficios do Plano</label>
                <div className={styles.featureInput}>
                  <input
                    type="text"
                    value={newFeature}
                    onChange={(e) => setNewFeature(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                    placeholder="Ex: Dieta personalizada"
                  />
                  <button type="button" className={styles.addFeatureBtn} onClick={addFeature}>
                    <Plus size={18} />
                  </button>
                </div>
                {formData.features.length > 0 && (
                  <ul className={styles.featuresList}>
                    {formData.features.map((feature, idx) => (
                      <li key={idx}>
                        <span>{feature}</span>
                        <button type="button" onClick={() => removeFeature(idx)}>
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={styles.togglesRow}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
                  />
                  <span>Plano ativo</span>
                </label>

                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={formData.is_featured}
                    onChange={(e) => setFormData((prev) => ({ ...prev, is_featured: e.target.checked }))}
                  />
                  <span>Destacar plano</span>
                </label>
              </div>

              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={resetForm}>
                  Cancelar
                </button>
                <Button type="submit" loading={saving}>
                  {editingPlan ? 'Salvar Alteracoes' : 'Criar Plano'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
