import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Pill, FlaskConical, Utensils, FileText, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import type { Profile } from '../../types/database';
import styles from './GuidelinesManagement.module.css';

export function GuidelinesManagement() {
  const { id } = useParams<{ id: string }>();
  const [client, setClient] = useState<Profile | null>(null);
  const [formData, setFormData] = useState({
    recommended_supplements: '',
    manipulated_supplements: '',
    free_meal_video_url: '',
    general_notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;

    setLoading(true);

    const [clientResult, guidelinesResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('patient_guidelines')
        .select('*')
        .eq('client_id', id)
        .maybeSingle()
    ]);

    if (clientResult.data) {
      setClient(clientResult.data);
    }

    if (guidelinesResult.data) {
      setFormData({
        recommended_supplements: guidelinesResult.data.recommended_supplements || '',
        manipulated_supplements: guidelinesResult.data.manipulated_supplements || '',
        free_meal_video_url: guidelinesResult.data.free_meal_video_url || '',
        general_notes: guidelinesResult.data.general_notes || ''
      });
    }

    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = async () => {
    if (!id) return;

    setSaving(true);

    try {
      // Check if record exists
      const { data: existing } = await supabase
        .from('patient_guidelines')
        .select('id')
        .eq('client_id', id)
        .maybeSingle();

      const guidelinesData = {
        client_id: id,
        recommended_supplements: formData.recommended_supplements || null,
        manipulated_supplements: formData.manipulated_supplements || null,
        free_meal_video_url: formData.free_meal_video_url || null,
        general_notes: formData.general_notes || null,
        updated_at: new Date().toISOString()
      };

      let error;

      if (existing) {
        // Update
        const result = await supabase
          .from('patient_guidelines')
          .update(guidelinesData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert
        const result = await supabase
          .from('patient_guidelines')
          .insert(guidelinesData);
        error = result.error;
      }

      if (error) throw error;

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);

    } catch (error: any) {
      console.error('Error saving guidelines:', error);
      alert('Erro ao salvar: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Extract YouTube video ID for preview
  const getVideoId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
      /(?:youtu\.be\/)([^?\s]+)/,
      /(?:youtube\.com\/embed\/)([^?\s]+)/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return '';
  };

  const videoId = getVideoId(formData.free_meal_video_url);

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
        <Header title="Aluno nao encontrado" showBack />
        <div className={styles.loading}>Aluno nao encontrado</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer hasBottomNav={false}>
      <Header title="Orientacoes" subtitle={client.full_name} showBack />

      <main className={styles.content}>
        <p className={styles.description}>
          Essas informacoes aparecerao na aba "Orientacoes" do app do paciente.
        </p>

        {/* Suplementos Recomendados */}
        <Card className={styles.fieldCard}>
          <div className={styles.fieldHeader}>
            <div className={`${styles.fieldIcon} ${styles.supplements}`}>
              <Pill size={20} />
            </div>
            <label className={styles.fieldLabel}>Suplementos Recomendados</label>
          </div>
          <textarea
            value={formData.recommended_supplements}
            onChange={(e) => handleChange('recommended_supplements', e.target.value)}
            className={styles.textarea}
            placeholder="Ex:&#10;- Whey Protein Isolado - 30g apos treino&#10;- Creatina - 5g por dia&#10;- Omega 3 - 2 capsulas no almoco"
            rows={5}
          />
        </Card>

        {/* Manipulados */}
        <Card className={styles.fieldCard}>
          <div className={styles.fieldHeader}>
            <div className={`${styles.fieldIcon} ${styles.manipulated}`}>
              <FlaskConical size={20} />
            </div>
            <label className={styles.fieldLabel}>Manipulados</label>
          </div>
          <textarea
            value={formData.manipulated_supplements}
            onChange={(e) => handleChange('manipulated_supplements', e.target.value)}
            className={styles.textarea}
            placeholder="Ex:&#10;- Vitamina D3 10.000UI - 1x ao dia pela manha&#10;- Magnesio Quelato 400mg - 1x a noite"
            rows={5}
          />
        </Card>

        {/* Video Refeicao Livre */}
        <Card className={styles.fieldCard}>
          <div className={styles.fieldHeader}>
            <div className={`${styles.fieldIcon} ${styles.freeMeal}`}>
              <Utensils size={20} />
            </div>
            <label className={styles.fieldLabel}>Video da Refeicao Livre</label>
          </div>
          <input
            type="url"
            value={formData.free_meal_video_url}
            onChange={(e) => handleChange('free_meal_video_url', e.target.value)}
            className={styles.input}
            placeholder="https://youtube.com/watch?v=..."
          />
          <p className={styles.fieldHint}>
            Cole o link do YouTube com o video explicativo sobre refeicao livre
          </p>

          {/* Video Preview */}
          {videoId && (
            <div className={styles.videoPreview}>
              <p className={styles.previewLabel}>Previa:</p>
              <div className={styles.videoWrapper}>
                <iframe
                  className={styles.videoFrame}
                  src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                  title="Preview"
                  frameBorder="0"
                  allowFullScreen
                />
              </div>
            </div>
          )}
        </Card>

        {/* Observacoes Gerais */}
        <Card className={styles.fieldCard}>
          <div className={styles.fieldHeader}>
            <div className={`${styles.fieldIcon} ${styles.notes}`}>
              <FileText size={20} />
            </div>
            <label className={styles.fieldLabel}>Observacoes Gerais</label>
          </div>
          <textarea
            value={formData.general_notes}
            onChange={(e) => handleChange('general_notes', e.target.value)}
            className={styles.textarea}
            placeholder="Outras orientacoes, lembretes ou informacoes importantes..."
            rows={5}
          />
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          fullWidth
          className={saved ? styles.savedBtn : ''}
        >
          {saving ? 'Salvando...' : saved ? (
            <>
              <Check size={18} />
              Salvo!
            </>
          ) : 'Salvar Orientacoes'}
        </Button>
      </main>
    </PageContainer>
  );
}
