import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Plus, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input, Card } from '../ui';
import { UNIT_OPTIONS, UNIT_TYPES } from '../../constants/foodUnits';
import type { UnitType, FoodMetadata } from '../../types/database';
import styles from './FoodLibraryManager.module.css';

interface Food {
  id: number;
  alimento: string;
  caloria: string;
  proteina: string;
  carboidrato: string;
  fibra: string;
  gordura?: string;
  created_at?: string;
  food_metadata?: FoodMetadata | null;
}

const ITEMS_PER_PAGE = 50;

export function FoodLibraryManager() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [saving, setSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [formData, setFormData] = useState({
    alimento: '',
    caloria: '',
    proteina: '',
    carboidrato: '',
    fibra: '',
    gordura: '',
    // Metadata fields
    nome_simplificado: '',
    unidade_tipo: 'gramas' as UnitType,
    peso_por_unidade: ''
  });

  // Debounce da busca para evitar queries excessivas
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset para primeira página ao buscar
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    loadFoods();
  }, [currentPage, debouncedSearch]);

  const loadFoods = async () => {
    setLoading(true);

    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;

    // Monta a query base
    let query = supabase
      .from('tabela_taco')
      .select(`
        *,
        food_metadata (
          id,
          taco_id,
          nome_simplificado,
          unidade_tipo,
          peso_por_unidade,
          created_at,
          updated_at
        )
      `, { count: 'exact' });

    // Aplica filtro de busca no servidor se houver termo
    if (debouncedSearch.trim()) {
      query = query.ilike('alimento', `%${debouncedSearch.trim()}%`);
    }

    // Aplica ordenação e paginação
    const { data, error, count } = await query
      .order('alimento', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error loading foods:', error);
    } else {
      setFoods(data || []);
      setTotalCount(count || 0);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.alimento.trim()) {
      alert('Nome do alimento e obrigatorio');
      return;
    }

    setSaving(true);

    try {
      const foodData = {
        alimento: formData.alimento.trim(),
        caloria: formData.caloria || '0',
        proteina: formData.proteina || '0',
        carboidrato: formData.carboidrato || '0',
        fibra: formData.fibra || '0',
        gordura: formData.gordura || '0'
      };

      let foodId: number;

      if (editingFood) {
        const { error } = await supabase
          .from('tabela_taco')
          .update(foodData)
          .eq('id', editingFood.id);

        if (error) {
          console.error('Update error:', error);
          alert('Erro ao atualizar: ' + error.message);
          setSaving(false);
          return;
        }
        foodId = editingFood.id;
      } else {
        const { data, error } = await supabase
          .from('tabela_taco')
          .insert(foodData)
          .select('id')
          .single();

        if (error) {
          console.error('Insert error:', error);
          alert('Erro ao adicionar: ' + error.message);
          setSaving(false);
          return;
        }
        foodId = data.id;
      }

      // Save metadata if simplified name is provided
      if (formData.nome_simplificado.trim()) {
        const metadataData = {
          taco_id: foodId,
          nome_simplificado: formData.nome_simplificado.trim(),
          unidade_tipo: formData.unidade_tipo,
          peso_por_unidade: formData.peso_por_unidade
            ? parseFloat(formData.peso_por_unidade.replace(',', '.'))
            : null
        };

        // Check if metadata exists
        const existingMetadata = editingFood?.food_metadata;

        if (existingMetadata) {
          // Update existing metadata
          const { error: metaError } = await supabase
            .from('food_metadata')
            .update(metadataData)
            .eq('taco_id', foodId);

          if (metaError) {
            console.error('Metadata update error:', metaError);
          }
        } else {
          // Insert new metadata
          const { error: metaError } = await supabase
            .from('food_metadata')
            .insert(metadataData);

          if (metaError) {
            console.error('Metadata insert error:', metaError);
          }
        }
      } else if (editingFood?.food_metadata) {
        // Remove metadata if simplified name was cleared
        await supabase
          .from('food_metadata')
          .delete()
          .eq('taco_id', foodId);
      }

      resetForm();
      await loadFoods();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error saving food:', err);
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (food: Food) => {
    setEditingFood(food);
    setFormData({
      alimento: food.alimento || '',
      caloria: food.caloria || '',
      proteina: food.proteina || '',
      carboidrato: food.carboidrato || '',
      fibra: food.fibra || '',
      gordura: food.gordura || '',
      // Metadata fields
      nome_simplificado: food.food_metadata?.nome_simplificado || '',
      unidade_tipo: food.food_metadata?.unidade_tipo || 'gramas',
      peso_por_unidade: food.food_metadata?.peso_por_unidade?.toString() || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (food: Food) => {
    if (!confirm(`Tem certeza que deseja excluir "${food.alimento}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('tabela_taco')
        .delete()
        .eq('id', food.id);

      if (error) throw error;
      loadFoods();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error deleting food:', err);
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({
      alimento: '',
      caloria: '',
      proteina: '',
      carboidrato: '',
      fibra: '',
      gordura: '',
      nome_simplificado: '',
      unidade_tipo: 'gramas',
      peso_por_unidade: ''
    });
    setEditingFood(null);
    setShowModal(false);
  };

  // Cálculos de paginação
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const canGoPrev = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  const formatValue = (value: string) => {
    if (!value || value === '0') return '-';
    return value;
  };

  return (
    <div className={styles.container}>
      <div className={styles.actionsBar}>
        <div className={styles.searchWrapper}>
          <Input
            type="text"
            placeholder="Buscar alimento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            icon={<Search size={18} />}
          />
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className={styles.addButton}
        >
          <Plus size={18} />
          <span>Adicionar</span>
        </button>
      </div>

      <div className={styles.stats}>
        <p>Total: <strong>{totalCount}</strong> alimentos cadastrados</p>
      </div>

      <div className={styles.infoBox}>
        <p>Os valores nutricionais sao por <strong>100g</strong> do alimento. Use virgula para decimais (ex: 2,5).</p>
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando...</div>
      ) : foods.length === 0 ? (
        <div className={styles.empty}>
          {searchTerm ? 'Nenhum alimento encontrado' : 'Nenhum alimento cadastrado'}
        </div>
      ) : (
        <div className={styles.list}>
          {foods.map((food) => {
            const hasMetadata = !!food.food_metadata?.nome_simplificado;
            const hasUnit = food.food_metadata?.unidade_tipo && food.food_metadata.unidade_tipo !== 'gramas';

            return (
              <Card key={food.id} className={styles.foodCard}>
                <div className={styles.foodInfo}>
                  <h4 className={styles.foodName}>
                    {food.food_metadata?.nome_simplificado || food.alimento}
                  </h4>
                  {hasMetadata && (
                    <p className={styles.foodOriginalName}>{food.alimento}</p>
                  )}
                  <div className={styles.foodMacros}>
                    <span className={styles.macroKcal}>{formatValue(food.caloria)} kcal</span>
                    <span className={styles.macroP}>P: {formatValue(food.proteina)}g</span>
                    <span className={styles.macroC}>C: {formatValue(food.carboidrato)}g</span>
                    <span className={styles.macroG}>G: {formatValue(food.gordura || '0')}g</span>
                    <span className={styles.macroF}>F: {formatValue(food.fibra)}g</span>
                  </div>
                  {hasUnit && food.food_metadata && UNIT_TYPES[food.food_metadata.unidade_tipo] && (
                    <div className={styles.unitInfo}>
                      {food.food_metadata.peso_por_unidade}g / {UNIT_TYPES[food.food_metadata.unidade_tipo].singular}
                    </div>
                  )}
                </div>
                <div className={styles.foodActions}>
                  <button
                    onClick={() => handleEdit(food)}
                    className={styles.editBtn}
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => handleDelete(food)}
                    className={styles.deleteBtn}
                  >
                    Excluir
                  </button>
                </div>
              </Card>
            );
          })}

          {/* Controles de Paginação */}
          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={!canGoPrev}
                className={styles.paginationBtn}
              >
                <ChevronLeft size={18} />
                Anterior
              </button>
              <span className={styles.paginationInfo}>
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={!canGoNext}
                className={styles.paginationBtn}
              >
                Próxima
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={resetForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingFood ? 'Editar Alimento' : 'Novo Alimento'}</h3>
              <button onClick={resetForm} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Nome do Alimento *</label>
                <input
                  type="text"
                  value={formData.alimento}
                  onChange={(e) => setFormData({ ...formData, alimento: e.target.value })}
                  placeholder="Ex: Arroz integral cozido"
                  required
                />
              </div>

              <p className={styles.formNote}>Valores nutricionais por 100g:</p>

              <div className={styles.formGroup}>
                <label>Calorias (kcal)</label>
                <input
                  type="text"
                  value={formData.caloria}
                  onChange={(e) => setFormData({ ...formData, caloria: e.target.value })}
                  placeholder="Ex: 124"
                />
              </div>

              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label>Proteina (g)</label>
                  <input
                    type="text"
                    value={formData.proteina}
                    onChange={(e) => setFormData({ ...formData, proteina: e.target.value })}
                    placeholder="Ex: 2,5"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Carboidrato (g)</label>
                  <input
                    type="text"
                    value={formData.carboidrato}
                    onChange={(e) => setFormData({ ...formData, carboidrato: e.target.value })}
                    placeholder="Ex: 25,8"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Gordura (g)</label>
                  <input
                    type="text"
                    value={formData.gordura}
                    onChange={(e) => setFormData({ ...formData, gordura: e.target.value })}
                    placeholder="Ex: 1,0"
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Fibra (g)</label>
                  <input
                    type="text"
                    value={formData.fibra}
                    onChange={(e) => setFormData({ ...formData, fibra: e.target.value })}
                    placeholder="Ex: 2,7"
                  />
                </div>
              </div>

              <div className={styles.metadataSection}>
                <p className={styles.formNote}>Nome simplificado e unidades (opcional):</p>

                <div className={styles.formGroup}>
                  <label>Nome Simplificado</label>
                  <input
                    type="text"
                    value={formData.nome_simplificado}
                    onChange={(e) => setFormData({ ...formData, nome_simplificado: e.target.value })}
                    placeholder="Ex: Peito de Frango"
                  />
                  <span className={styles.fieldHint}>Nome curto para facilitar a busca</span>
                </div>

                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label>Tipo de Unidade</label>
                    <select
                      value={formData.unidade_tipo}
                      onChange={(e) => setFormData({ ...formData, unidade_tipo: e.target.value as UnitType })}
                      className={styles.select}
                    >
                      {UNIT_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {formData.unidade_tipo !== 'gramas' && (
                    <div className={styles.formGroup}>
                      <label>Peso por Unidade (g)</label>
                      <input
                        type="text"
                        value={formData.peso_por_unidade}
                        onChange={(e) => setFormData({ ...formData, peso_por_unidade: e.target.value })}
                        placeholder="Ex: 30"
                      />
                      <span className={styles.fieldHint}>Quantas gramas tem 1 {UNIT_TYPES[formData.unidade_tipo].singular}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.formActions}>
                <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={styles.submitBtn}>
                  {saving ? 'Salvando...' : editingFood ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
