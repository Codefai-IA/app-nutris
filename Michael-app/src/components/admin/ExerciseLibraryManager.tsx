import { useState, useEffect } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Input, Card } from '../ui';
import styles from './ExerciseLibraryManager.module.css';

interface Exercise {
  id: string;
  name: string;
  muscle_group?: string;
  video_url?: string;
  description?: string;
  created_at?: string;
}

const muscleGroups = [
  'Peito',
  'Costas',
  'Ombros',
  'Biceps',
  'Triceps',
  'Antebraco',
  'Abdomen',
  'Quadriceps',
  'Posterior de Coxa',
  'Gluteos',
  'Panturrilha',
  'Corpo Inteiro',
  'Cardio'
];

export function ExerciseLibraryManager() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    muscle_group: '',
    video_url: '',
    description: ''
  });

  useEffect(() => {
    loadExercises();
  }, []);

  const loadExercises = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('exercise_library')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error loading exercises:', error);
    } else {
      setExercises(data || []);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Nome do exercicio e obrigatorio');
      return;
    }

    setSaving(true);

    try {
      if (editingExercise) {
        const { error } = await supabase
          .from('exercise_library')
          .update({
            name: formData.name.trim(),
            muscle_group: formData.muscle_group || null,
            video_url: formData.video_url || null,
            description: formData.description || null
          })
          .eq('id', editingExercise.id);

        if (error) {
          console.error('Update error:', error);
          alert('Erro ao atualizar: ' + error.message);
          setSaving(false);
          return;
        }
      } else {
        const { error } = await supabase
          .from('exercise_library')
          .insert({
            name: formData.name.trim(),
            muscle_group: formData.muscle_group || null,
            video_url: formData.video_url || null,
            description: formData.description || null
          });

        if (error) {
          console.error('Insert error:', error);
          alert('Erro ao adicionar: ' + error.message);
          setSaving(false);
          return;
        }
      }

      resetForm();
      await loadExercises();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error saving exercise:', err);
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (exercise: Exercise) => {
    setEditingExercise(exercise);
    setFormData({
      name: exercise.name || '',
      muscle_group: exercise.muscle_group || '',
      video_url: exercise.video_url || '',
      description: exercise.description || ''
    });
    setShowModal(true);
  };

  const handleDelete = async (exercise: Exercise) => {
    if (!confirm(`Tem certeza que deseja excluir "${exercise.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('exercise_library')
        .delete()
        .eq('id', exercise.id);

      if (error) throw error;
      loadExercises();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Error deleting exercise:', err);
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', muscle_group: '', video_url: '', description: '' });
    setEditingExercise(null);
    setShowModal(false);
  };

  const filteredExercises = exercises.filter(ex =>
    ex.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    ex.muscle_group?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.actionsBar}>
        <div className={styles.searchWrapper}>
          <Input
            type="text"
            placeholder="Buscar exercicio..."
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
        <p>Total: <strong>{exercises.length}</strong> exercicios cadastrados</p>
      </div>

      {loading ? (
        <div className={styles.loading}>Carregando...</div>
      ) : filteredExercises.length === 0 ? (
        <div className={styles.empty}>
          {searchTerm ? 'Nenhum exercicio encontrado' : 'Nenhum exercicio cadastrado'}
        </div>
      ) : (
        <div className={styles.list}>
          {filteredExercises.map((exercise) => (
            <Card key={exercise.id} className={styles.exerciseCard}>
              <div className={styles.exerciseInfo}>
                <h4 className={styles.exerciseName}>{exercise.name}</h4>
                <div className={styles.exerciseMeta}>
                  {exercise.muscle_group && (
                    <span className={styles.muscleTag}>{exercise.muscle_group}</span>
                  )}
                  {exercise.video_url && (
                    <span className={styles.videoTag}>Video</span>
                  )}
                </div>
              </div>
              <div className={styles.exerciseActions}>
                <button
                  onClick={() => handleEdit(exercise)}
                  className={styles.editBtn}
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(exercise)}
                  className={styles.deleteBtn}
                >
                  Excluir
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className={styles.modalOverlay} onClick={resetForm}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editingExercise ? 'Editar Exercicio' : 'Novo Exercicio'}</h3>
              <button onClick={resetForm} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Nome do Exercicio *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Supino Reto"
                  required
                />
              </div>

              <div className={styles.formGroup}>
                <label>Grupo Muscular</label>
                <select
                  value={formData.muscle_group}
                  onChange={(e) => setFormData({ ...formData, muscle_group: e.target.value })}
                >
                  <option value="">Selecione...</option>
                  {muscleGroups.map((group) => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>URL do Video (YouTube)</label>
                <input
                  type="url"
                  value={formData.video_url}
                  onChange={(e) => setFormData({ ...formData, video_url: e.target.value })}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>

              <div className={styles.formGroup}>
                <label>Descricao (opcional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Instrucoes ou observacoes..."
                  rows={3}
                />
              </div>

              <div className={styles.formActions}>
                <button type="button" onClick={resetForm} className={styles.cancelBtn}>
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className={styles.submitBtn}>
                  {saving ? 'Salvando...' : editingExercise ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
