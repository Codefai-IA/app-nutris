import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Scale, Ruler, Target, Calendar, Edit3, Check, X, TrendingDown, TrendingUp, Camera, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { PageContainer, Header, BottomNav } from '../../components/layout';
import { Card, Button } from '../../components/ui';
import type { WeightHistory } from '../../types/database';
import styles from './Profile.module.css';

// Retorna a data atual no fuso horário de Brasília
function getBrasiliaDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function Profile() {
  const navigate = useNavigate();
  const { profile, signOut, refreshProfile } = useAuth();
  const [weightHistory, setWeightHistory] = useState<WeightHistory[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isEditingWeight, setIsEditingWeight] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (profile?.id) {
      fetchWeightHistory();
    }
  }, [profile?.id]);

  async function fetchWeightHistory() {
    const { data } = await supabase
      .from('weight_history')
      .select('*')
      .eq('client_id', profile!.id)
      .order('recorded_at', { ascending: false })
      .limit(10);

    if (data) setWeightHistory(data);
  }

  async function handleSaveWeight() {
    if (!newWeight || isNaN(parseFloat(newWeight))) {
      return;
    }

    setSavingWeight(true);
    const today = getBrasiliaDate();
    const weightValue = parseFloat(newWeight);

    try {
      // Update current weight in profile
      await supabase
        .from('profiles')
        .update({
          current_weight_kg: weightValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile!.id);

      // Check if there's already a weight log for today
      const { data: existingLog } = await supabase
        .from('weight_history')
        .select('id')
        .eq('client_id', profile!.id)
        .gte('recorded_at', today)
        .lt('recorded_at', today + 'T23:59:59')
        .maybeSingle();

      if (existingLog) {
        // Update today's entry
        await supabase
          .from('weight_history')
          .update({ weight_kg: weightValue })
          .eq('id', existingLog.id);
      } else {
        // Create new entry
        await supabase
          .from('weight_history')
          .insert({
            client_id: profile!.id,
            weight_kg: weightValue,
          });
      }

      setWeightSaved(true);
      setIsEditingWeight(false);

      // Refresh profile and history
      if (refreshProfile) {
        await refreshProfile();
      }
      await fetchWeightHistory();

      // Reset saved indicator after 2 seconds
      setTimeout(() => setWeightSaved(false), 2000);

    } catch (error) {
      console.error('Error saving weight:', error);
    } finally {
      setSavingWeight(false);
    }
  }

  function startEditingWeight() {
    setNewWeight(currentWeight.toString());
    setIsEditingWeight(true);
  }

  function cancelEditingWeight() {
    setIsEditingWeight(false);
    setNewWeight('');
  }

  function handlePhotoClick() {
    fileInputRef.current?.click();
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 5MB.');
      return;
    }

    setUploadingPhoto(true);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Delete old photo if exists
      if (profile.photo_url) {
        const oldPath = profile.photo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('avatars').remove([`avatars/${oldPath}`]);
        }
      }

      // Upload new photo
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        alert('Erro ao fazer upload da foto. Tente novamente.');
        return;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // Update profile with new photo URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          photo_url: publicUrl,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (updateError) {
        console.error('Update error:', updateError);
        alert('Erro ao atualizar perfil. Tente novamente.');
        return;
      }

      // Refresh profile to show new photo
      if (refreshProfile) {
        await refreshProfile();
      }

    } catch (error) {
      console.error('Error uploading photo:', error);
      alert('Erro ao fazer upload da foto. Tente novamente.');
    } finally {
      setUploadingPhoto(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  const currentWeight = profile?.current_weight_kg || 0;
  const startingWeight = profile?.starting_weight_kg || currentWeight;
  const goalWeight = profile?.goal_weight_kg || 0;
  const weightDiff = startingWeight - currentWeight;
  const remainingToGoal = goalWeight > 0 ? currentWeight - goalWeight : 0;
  const height = profile?.height_cm ? profile.height_cm / 100 : 0;
  const bmi = height > 0 ? currentWeight / (height * height) : 0;

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR', {
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <PageContainer>
      <header className={styles.header}>
        <img
          src="/logo-icon.png"
          alt="Logo"
          className={styles.logo}
        />
        <div className={styles.avatarSection}>
          <div className={styles.avatarWrapper}>
            <div className={styles.avatar}>
              {profile?.photo_url ? (
                <img src={profile.photo_url} alt="" />
              ) : (
                <span>{profile?.full_name?.charAt(0) || 'U'}</span>
              )}
            </div>
            <button
              className={styles.avatarEditBtn}
              onClick={handlePhotoClick}
              disabled={uploadingPhoto}
              aria-label="Alterar foto de perfil"
            >
              {uploadingPhoto ? (
                <Loader2 size={16} className={styles.spinning} />
              ) : (
                <Camera size={16} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className={styles.hiddenInput}
            />
          </div>
          <h1 className={styles.name}>{profile?.full_name}</h1>
          <p className={styles.since}>
            Aluno desde {formatDate(profile?.coaching_start_date || profile?.created_at || null)}
          </p>
        </div>
      </header>

      <main className={styles.content}>
        {/* Weight Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Peso</h2>

          <Card className={styles.weightCard}>
            <div className={styles.currentWeightSection}>
              <span className={styles.weightLabel}>Peso Atual</span>

              {isEditingWeight ? (
                <div className={styles.weightEditRow}>
                  <div className={styles.weightInputWrapper}>
                    <input
                      type="number"
                      step="0.1"
                      value={newWeight}
                      onChange={(e) => setNewWeight(e.target.value)}
                      className={styles.weightInput}
                      placeholder="kg"
                      autoFocus
                    />
                    <span className={styles.weightInputUnit}>kg</span>
                  </div>
                  <div className={styles.weightEditButtons}>
                    <button
                      onClick={handleSaveWeight}
                      disabled={savingWeight}
                      className={styles.weightSaveBtn}
                    >
                      {savingWeight ? '...' : <Check size={18} />}
                    </button>
                    <button
                      onClick={cancelEditingWeight}
                      className={styles.weightCancelBtn}
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.weightDisplayRow}>
                  <div className={styles.weightValue}>
                    <span className={styles.weightNumber}>{currentWeight.toFixed(1)}</span>
                    <span className={styles.weightUnit}>kg</span>
                  </div>
                  <button onClick={startEditingWeight} className={styles.updateWeightBtn}>
                    <Edit3 size={16} />
                    Atualizar
                  </button>
                </div>
              )}

              {weightSaved && (
                <p className={styles.weightSavedMsg}>Peso atualizado!</p>
              )}
            </div>

            {/* Weight Stats Grid */}
            <div className={styles.weightStatsGrid}>
              <div className={styles.weightStatBox}>
                <span className={styles.weightStatLabel}>Peso Inicial</span>
                <span className={styles.weightStatValue}>
                  {startingWeight > 0 ? `${startingWeight.toFixed(1)} kg` : '--'}
                </span>
              </div>
              <div className={styles.weightStatBox}>
                <span className={styles.weightStatLabel}>Meta</span>
                <span className={styles.weightStatValue}>
                  {goalWeight > 0 ? `${goalWeight.toFixed(1)} kg` : '--'}
                </span>
              </div>
            </div>

            {/* Progress Badges */}
            {weightDiff !== 0 && (
              <div className={`${styles.progressBadge} ${weightDiff > 0 ? styles.progressPositive : styles.progressNegative}`}>
                {weightDiff > 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />}
                <span>
                  {weightDiff > 0
                    ? `Voce ja perdeu ${weightDiff.toFixed(1)} kg!`
                    : `Voce ganhou ${Math.abs(weightDiff).toFixed(1)} kg`
                  }
                </span>
              </div>
            )}

            {remainingToGoal > 0 && (
              <div className={styles.goalBadge}>
                <Target size={16} />
                <span>Faltam {remainingToGoal.toFixed(1)} kg para sua meta</span>
              </div>
            )}
          </Card>
        </section>

        {/* Stats Section */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Minhas Medidas</h2>

          <Card className={styles.statsCard}>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <div className={styles.statIcon}>
                  <Ruler size={18} />
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>Altura</span>
                  <span className={styles.statValue}>{height.toFixed(2)}m</span>
                </div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statIcon}>
                  <Target size={18} />
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>IMC</span>
                  <span className={styles.statValue}>{bmi.toFixed(1)}</span>
                </div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statIcon}>
                  <Calendar size={18} />
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>Idade</span>
                  <span className={styles.statValue}>{profile?.age || '-'} anos</span>
                </div>
              </div>

              <div className={styles.stat}>
                <div className={styles.statIcon}>
                  <Scale size={18} />
                </div>
                <div className={styles.statInfo}>
                  <span className={styles.statLabel}>Variacao</span>
                  <span className={styles.statValue}>
                    {weightDiff !== 0 ? `${weightDiff > 0 ? '-' : '+'}${Math.abs(weightDiff).toFixed(1)}kg` : '0kg'}
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </section>

        {profile?.goals && (
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Meu Objetivo</h2>
            <Card>
              <p className={styles.goalText}>{profile.goals}</p>
            </Card>
          </section>
        )}

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Historico de Peso</h2>

          {weightHistory.length > 0 ? (
            <div className={styles.historyList}>
              {weightHistory.slice(0, 5).map((record, index) => {
                const prevRecord = weightHistory[index + 1];
                const diff = prevRecord ? Number(record.weight_kg) - Number(prevRecord.weight_kg) : 0;

                return (
                  <Card key={record.id} className={styles.historyItem}>
                    <span className={styles.historyDate}>
                      {new Date(record.recorded_at).toLocaleDateString('pt-BR')}
                    </span>
                    <div className={styles.historyWeightRow}>
                      <span className={styles.historyWeight}>{Number(record.weight_kg).toFixed(1)}kg</span>
                      {diff !== 0 && (
                        <span className={`${styles.historyTrend} ${diff < 0 ? styles.trendDown : styles.trendUp}`}>
                          {diff < 0 ? '↓' : '↑'}
                        </span>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className={styles.emptyState}>
              <p>Nenhum registro de peso</p>
            </Card>
          )}
        </section>

        <Button
          variant="danger"
          fullWidth
          loading={loggingOut}
          onClick={() => {
            setLoggingOut(true);
            // signOut limpa estado imediatamente, navegação acontece logo após
            signOut().finally(() => {
              navigate('/login', { replace: true });
            });
          }}
        >
          <LogOut size={18} />
          Sair da Conta
        </Button>
      </main>

      <BottomNav />
    </PageContainer>
  );
}
