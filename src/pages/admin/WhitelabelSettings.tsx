import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, RotateCcw, Save, Check, X, Palette, Image, Type } from 'lucide-react';
import { PageContainer } from '../../components/layout';
import { Card, Button, Input } from '../../components/ui';
import { useTheme } from '../../contexts/ThemeContext';
import { DEFAULT_APP_SETTINGS } from '../../types/database';
import type { AppSettings } from '../../types/database';
import styles from './WhitelabelSettings.module.css';

type TabType = 'colors' | 'logos' | 'identity';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
}

function ColorPicker({ label, value, onChange, description }: ColorPickerProps) {
  return (
    <div className={styles.colorPickerGroup}>
      <label className={styles.colorLabel}>
        {label}
        {description && <span className={styles.colorDescription}>{description}</span>}
      </label>
      <div className={styles.colorInputWrapper}>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.colorInput}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={styles.colorHexInput}
          pattern="^#[0-9A-Fa-f]{6}$"
        />
      </div>
    </div>
  );
}

export function WhitelabelSettings() {
  const navigate = useNavigate();
  const { settings, loading, updateSettings, uploadLogo } = useTheme();
  const [activeTab, setActiveTab] = useState<TabType>('colors');
  const [localSettings, setLocalSettings] = useState<Partial<AppSettings>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<'main' | 'icon' | 'favicon' | null>(null);

  const mainLogoRef = useRef<HTMLInputElement>(null);
  const iconLogoRef = useRef<HTMLInputElement>(null);
  const faviconRef = useRef<HTMLInputElement>(null);

  // Inicializar local settings do settings carregado
  useEffect(() => {
    if (settings) {
      setLocalSettings(settings);
    }
  }, [settings]);

  // Helper para atualizar setting local
  const updateLocal = (key: keyof AppSettings, value: string) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveMessage(null);
  };

  // Gerar variante light de uma cor
  const generateLightColor = (hex: string): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, 0.1)`;
  };

  // Gerar variante hover (mais escura)
  const generateHoverColor = (hex: string): string => {
    const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 30);
    const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 30);
    const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 30);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };

  // Auto-gerar variantes quando cor primaria muda
  const handlePrimaryChange = (value: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
      updateLocal('color_primary', value);
      return;
    }
    updateLocal('color_primary', value);
    updateLocal('color_primary_hover', generateHoverColor(value));
    updateLocal('color_primary_light', generateLightColor(value));
    updateLocal('pwa_theme_color', value);
  };

  // Auto-gerar variantes quando cor accent muda
  const handleAccentChange = (value: string) => {
    if (!/^#[0-9A-Fa-f]{6}$/.test(value)) {
      updateLocal('color_accent', value);
      return;
    }
    updateLocal('color_accent', value);
    updateLocal('color_accent_hover', generateHoverColor(value));
    updateLocal('color_accent_light', generateLightColor(value));
  };

  // Salvar configuracoes
  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);

    const { error } = await updateSettings(localSettings);

    if (error) {
      setSaveMessage({ type: 'error', text: 'Erro ao salvar configuracoes' });
    } else {
      setSaveMessage({ type: 'success', text: 'Configuracoes salvas com sucesso!' });
      setHasChanges(false);
    }

    setSaving(false);
    setTimeout(() => setSaveMessage(null), 3000);
  };

  // Restaurar padrao
  const handleReset = () => {
    if (confirm('Deseja restaurar todas as configuracoes para o padrao?')) {
      setLocalSettings({ ...DEFAULT_APP_SETTINGS });
      setHasChanges(true);
    }
  };

  // Upload de logo
  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>, type: 'main' | 'icon' | 'favicon') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      setSaveMessage({ type: 'error', text: 'Por favor, selecione uma imagem' });
      return;
    }

    // Validar tamanho (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setSaveMessage({ type: 'error', text: 'Imagem muito grande. Maximo 2MB' });
      return;
    }

    setUploadingLogo(type);

    const { url, error } = await uploadLogo(file, type);

    if (error || !url) {
      setSaveMessage({ type: 'error', text: 'Erro ao fazer upload da imagem' });
    } else {
      const fieldMap = {
        main: 'logo_main_url',
        icon: 'logo_icon_url',
        favicon: 'favicon_url',
      } as const;

      updateLocal(fieldMap[type], url);
      setSaveMessage({ type: 'success', text: 'Logo atualizado!' });
    }

    setUploadingLogo(null);
    // Limpar input para permitir re-upload do mesmo arquivo
    e.target.value = '';
    setTimeout(() => setSaveMessage(null), 3000);
  };

  if (loading && !settings) {
    return (
      <PageContainer hasBottomNav={false}>
        <div className={styles.loading}>Carregando configuracoes...</div>
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
          <h1 className={styles.title}>Personalizacao</h1>
          <p className={styles.subtitle}>Configure cores, logos e identidade do app</p>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          onClick={() => setActiveTab('colors')}
          className={`${styles.tab} ${activeTab === 'colors' ? styles.tabActive : ''}`}
        >
          <Palette size={16} />
          Cores
        </button>
        <button
          onClick={() => setActiveTab('logos')}
          className={`${styles.tab} ${activeTab === 'logos' ? styles.tabActive : ''}`}
        >
          <Image size={16} />
          Logos
        </button>
        <button
          onClick={() => setActiveTab('identity')}
          className={`${styles.tab} ${activeTab === 'identity' ? styles.tabActive : ''}`}
        >
          <Type size={16} />
          Identidade
        </button>
      </div>

      <main className={styles.content}>
        {/* Aba de Cores */}
        {activeTab === 'colors' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Cores Primarias</h3>
              <ColorPicker
                label="Cor Principal"
                value={localSettings.color_primary || DEFAULT_APP_SETTINGS.color_primary}
                onChange={handlePrimaryChange}
                description="Usada em botoes, links e elementos principais"
              />
              <ColorPicker
                label="Cor Secundaria"
                value={localSettings.color_secondary || DEFAULT_APP_SETTINGS.color_secondary}
                onChange={(v) => updateLocal('color_secondary', v)}
                description="Usada em gradientes e fundos escuros"
              />
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Cor de Destaque</h3>
              <ColorPicker
                label="Accent"
                value={localSettings.color_accent || DEFAULT_APP_SETTINGS.color_accent}
                onChange={handleAccentChange}
                description="Checkboxes, indicadores e botao flutuante"
              />
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Fundos</h3>
              <ColorPicker
                label="Fundo Principal"
                value={localSettings.color_bg_main || DEFAULT_APP_SETTINGS.color_bg_main}
                onChange={(v) => updateLocal('color_bg_main', v)}
              />
              <ColorPicker
                label="Fundo dos Cards"
                value={localSettings.color_bg_card || DEFAULT_APP_SETTINGS.color_bg_card}
                onChange={(v) => updateLocal('color_bg_card', v)}
              />
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Textos</h3>
              <ColorPicker
                label="Texto Principal"
                value={localSettings.color_text_primary || DEFAULT_APP_SETTINGS.color_text_primary}
                onChange={(v) => updateLocal('color_text_primary', v)}
              />
              <ColorPicker
                label="Texto Secundario"
                value={localSettings.color_text_secondary || DEFAULT_APP_SETTINGS.color_text_secondary}
                onChange={(v) => updateLocal('color_text_secondary', v)}
              />
            </Card>

            {/* Preview em tempo real */}
            <Card className={styles.previewCard}>
              <h3 className={styles.sectionTitle}>Preview</h3>
              <div
                className={styles.previewContainer}
                style={
                  {
                    '--preview-primary': localSettings.color_primary || DEFAULT_APP_SETTINGS.color_primary,
                    '--preview-accent': localSettings.color_accent || DEFAULT_APP_SETTINGS.color_accent,
                    '--preview-bg': localSettings.color_bg_main || DEFAULT_APP_SETTINGS.color_bg_main,
                    '--preview-card': localSettings.color_bg_card || DEFAULT_APP_SETTINGS.color_bg_card,
                    '--preview-text': localSettings.color_text_primary || DEFAULT_APP_SETTINGS.color_text_primary,
                    '--preview-secondary': localSettings.color_secondary || DEFAULT_APP_SETTINGS.color_secondary,
                  } as React.CSSProperties
                }
              >
                <div className={styles.previewHeader}>
                  <div className={styles.previewLogo}>
                    {(localSettings.app_short_name || 'MC').slice(0, 2)}
                  </div>
                  <span>Preview do App</span>
                </div>
                <div className={styles.previewBody}>
                  <div className={styles.previewCardItem}>
                    <span>Exemplo de Card</span>
                  </div>
                  <button className={styles.previewButton}>Botao Primario</button>
                  <button className={styles.previewButtonAccent}>Botao Accent</button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Aba de Logos */}
        {activeTab === 'logos' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Logo Principal</h3>
              <p className={styles.logoDescription}>Usado na splash screen e cabecalhos. Recomendado: 512x512px</p>
              <div className={styles.logoPreview}>
                <img
                  src={localSettings.logo_main_url || '/logo.jpeg'}
                  alt="Logo principal"
                  className={styles.logoImage}
                />
              </div>
              <input
                ref={mainLogoRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e, 'main')}
                className={styles.hiddenInput}
              />
              <Button variant="outline" onClick={() => mainLogoRef.current?.click()} loading={uploadingLogo === 'main'}>
                <Upload size={16} />
                Alterar Logo Principal
              </Button>
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Icone do App</h3>
              <p className={styles.logoDescription}>Usado na tela de login e PWA. Recomendado: 192x192px</p>
              <div className={styles.logoPreview}>
                <img
                  src={localSettings.logo_icon_url || '/logo-icon.png'}
                  alt="Icone do app"
                  className={styles.logoImageSmall}
                />
              </div>
              <input
                ref={iconLogoRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e, 'icon')}
                className={styles.hiddenInput}
              />
              <Button variant="outline" onClick={() => iconLogoRef.current?.click()} loading={uploadingLogo === 'icon'}>
                <Upload size={16} />
                Alterar Icone
              </Button>
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Favicon</h3>
              <p className={styles.logoDescription}>Icone exibido na aba do navegador. Recomendado: 32x32px ou SVG</p>
              <div className={styles.logoPreview}>
                <img
                  src={localSettings.favicon_url || '/favicon.svg'}
                  alt="Favicon"
                  className={styles.faviconImage}
                />
              </div>
              <input
                ref={faviconRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e, 'favicon')}
                className={styles.hiddenInput}
              />
              <Button variant="outline" onClick={() => faviconRef.current?.click()} loading={uploadingLogo === 'favicon'}>
                <Upload size={16} />
                Alterar Favicon
              </Button>
            </Card>
          </div>
        )}

        {/* Aba de Identidade */}
        {activeTab === 'identity' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Nome do App</h3>
              <Input
                label="Nome Completo"
                value={localSettings.app_name || ''}
                onChange={(e) => updateLocal('app_name', e.target.value)}
                placeholder="Ex: Michael Cezar Nutricionista"
              />
              <div style={{ marginTop: 16 }}>
                <Input
                  label="Nome Curto (PWA)"
                  value={localSettings.app_short_name || ''}
                  onChange={(e) => updateLocal('app_short_name', e.target.value)}
                  placeholder="Ex: MC Nutri"
                  maxLength={20}
                />
              </div>
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Descricao</h3>
              <textarea
                className={styles.textarea}
                value={localSettings.app_description || ''}
                onChange={(e) => updateLocal('app_description', e.target.value)}
                placeholder="Descricao do app para PWA e SEO"
                rows={3}
              />
            </Card>
          </div>
        )}

        {/* Mensagem de status */}
        {saveMessage && (
          <div className={`${styles.saveMessage} ${styles[saveMessage.type]}`}>
            {saveMessage.type === 'success' ? <Check size={16} /> : <X size={16} />}
            {saveMessage.text}
          </div>
        )}
      </main>

      {/* Acoes fixas no rodape */}
      <div className={styles.bottomActions}>
        <Button variant="outline" onClick={handleReset} disabled={saving}>
          <RotateCcw size={16} />
          Restaurar Padrao
        </Button>
        <Button onClick={handleSave} loading={saving} disabled={!hasChanges}>
          <Save size={16} />
          Salvar Alteracoes
        </Button>
      </div>
    </PageContainer>
  );
}
