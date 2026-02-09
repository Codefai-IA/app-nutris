import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Check,
  X,
  CreditCard,
  QrCode,
  Receipt,
  Settings,
  Link as LinkIcon,
  Eye,
  EyeOff,
  TestTube2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { PageContainer } from '../../components/layout';
import { Card, Button, Input } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { PlansManager } from '../../components/admin/PlansManager';
import type { PaymentSettings as PaymentSettingsType, PaymentGateway } from '../../types/database';
import styles from './PaymentSettings.module.css';

type TabType = 'gateway' | 'methods' | 'checkout' | 'plans';

const GATEWAY_OPTIONS: { value: PaymentGateway; label: string; description: string }[] = [
  { value: 'none', label: 'Nenhum', description: 'Pagamentos desabilitados' },
  { value: 'mercado_pago', label: 'Mercado Pago', description: 'PIX, Boleto e Cartao' },
  { value: 'asaas', label: 'Asaas', description: 'PIX, Boleto e Cartao' },
  { value: 'pagseguro', label: 'PagSeguro', description: 'PIX, Boleto e Cartao' },
  { value: 'pagarme', label: 'Pagar.me', description: 'PIX, Boleto e Cartao' },
];

export function PaymentSettings() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('gateway');
  const [settings, setSettings] = useState<Partial<PaymentSettingsType>>({
    active_gateway: 'none',
    pix_enabled: true,
    boleto_enabled: true,
    credit_card_enabled: true,
    checkout_title: 'Plano de Acompanhamento',
    checkout_success_message: 'Pagamento realizado com sucesso! Voce recebera um email com suas credenciais de acesso.',
    asaas_environment: 'sandbox',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});

  // Load settings on mount
  useEffect(() => {
    if (profile?.id) {
      loadSettings();
    }
  }, [profile?.id]);

  const loadSettings = async () => {
    if (!profile?.id) return;

    try {
      const { data, error } = await supabase
        .from('payment_settings')
        .select('*')
        .eq('owner_id', profile.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading payment settings:', error);
        return;
      }

      if (data) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = <K extends keyof PaymentSettingsType>(key: K, value: PaymentSettingsType[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setSaveMessage(null);
  };

  const handleSave = async () => {
    if (!profile?.id) return;

    setSaving(true);
    setSaveMessage(null);

    try {
      // Check if settings exist
      const { data: existing } = await supabase
        .from('payment_settings')
        .select('id')
        .eq('owner_id', profile.id)
        .maybeSingle();

      const settingsToSave = {
        ...settings,
        owner_id: profile.id,
      };

      let error;
      if (existing) {
        // Update
        const result = await supabase
          .from('payment_settings')
          .update(settingsToSave)
          .eq('owner_id', profile.id);
        error = result.error;
      } else {
        // Insert
        const result = await supabase
          .from('payment_settings')
          .insert(settingsToSave);
        error = result.error;
      }

      if (error) {
        console.error('Error saving settings:', error);
        setSaveMessage({ type: 'error', text: 'Erro ao salvar configuracoes' });
      } else {
        setSaveMessage({ type: 'success', text: 'Configuracoes salvas!' });
        setHasChanges(false);
      }
    } catch (err) {
      console.error('Error:', err);
      setSaveMessage({ type: 'error', text: 'Erro ao salvar configuracoes' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setSaveMessage(null);

    try {
      // For now, just validate that credentials are filled
      const gateway = settings.active_gateway;

      if (gateway === 'none') {
        setSaveMessage({ type: 'error', text: 'Selecione um gateway primeiro' });
        return;
      }

      let hasCredentials = false;
      switch (gateway) {
        case 'mercado_pago':
          hasCredentials = !!(settings.mp_access_token && settings.mp_public_key);
          break;
        case 'asaas':
          hasCredentials = !!settings.asaas_api_key;
          break;
        case 'pagseguro':
          hasCredentials = !!(settings.ps_email && settings.ps_token);
          break;
        case 'pagarme':
          hasCredentials = !!(settings.pm_api_key && settings.pm_encryption_key);
          break;
      }

      if (!hasCredentials) {
        setSaveMessage({ type: 'error', text: 'Preencha todas as credenciais do gateway' });
        return;
      }

      // TODO: Actually test the connection via Edge Function
      setSaveMessage({ type: 'success', text: 'Credenciais configuradas! Teste de conexao em breve.' });
    } finally {
      setTesting(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  };

  const toggleSecretVisibility = (field: string) => {
    setShowSecrets((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setSaveMessage({ type: 'success', text: 'Copiado!' });
      setTimeout(() => setSaveMessage(null), 2000);
    } catch {
      setSaveMessage({ type: 'error', text: 'Erro ao copiar' });
    }
  };

  const generateSlug = () => {
    if (!profile?.full_name) return;
    const slug = profile.full_name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    updateSetting('checkout_slug', slug);
  };

  const checkoutUrl = settings.checkout_slug
    ? `${window.location.origin}/checkout/${settings.checkout_slug}`
    : null;

  if (loading) {
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
          <h1 className={styles.title}>Pagamentos</h1>
          <p className={styles.subtitle}>Configure gateways e planos de assinatura</p>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          onClick={() => setActiveTab('gateway')}
          className={`${styles.tab} ${activeTab === 'gateway' ? styles.tabActive : ''}`}
        >
          <Settings size={16} />
          Gateway
        </button>
        <button
          onClick={() => setActiveTab('methods')}
          className={`${styles.tab} ${activeTab === 'methods' ? styles.tabActive : ''}`}
        >
          <CreditCard size={16} />
          Metodos
        </button>
        <button
          onClick={() => setActiveTab('checkout')}
          className={`${styles.tab} ${activeTab === 'checkout' ? styles.tabActive : ''}`}
        >
          <LinkIcon size={16} />
          Checkout
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`${styles.tab} ${activeTab === 'plans' ? styles.tabActive : ''}`}
        >
          <Receipt size={16} />
          Planos
        </button>
      </div>

      <main className={styles.content}>
        {/* Gateway Tab */}
        {activeTab === 'gateway' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Gateway de Pagamento</h3>
              <p className={styles.sectionDescription}>
                Selecione o gateway que deseja utilizar para processar pagamentos
              </p>

              <div className={styles.gatewayOptions}>
                {GATEWAY_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`${styles.gatewayOption} ${
                      settings.active_gateway === option.value ? styles.gatewayOptionActive : ''
                    }`}
                    onClick={() => updateSetting('active_gateway', option.value)}
                  >
                    <div className={styles.gatewayInfo}>
                      <span className={styles.gatewayLabel}>{option.label}</span>
                      <span className={styles.gatewayDescription}>{option.description}</span>
                    </div>
                    {settings.active_gateway === option.value && (
                      <Check size={18} className={styles.gatewayCheck} />
                    )}
                  </button>
                ))}
              </div>
            </Card>

            {/* Gateway Credentials */}
            {settings.active_gateway === 'mercado_pago' && (
              <Card className={styles.card}>
                <h3 className={styles.sectionTitle}>Credenciais Mercado Pago</h3>
                <p className={styles.sectionDescription}>
                  Obtenha suas credenciais em{' '}
                  <a href="https://www.mercadopago.com.br/developers/panel/app" target="_blank" rel="noopener noreferrer">
                    mercadopago.com.br/developers
                  </a>
                </p>

                <div className={styles.credentialField}>
                  <Input
                    label="Access Token"
                    type={showSecrets['mp_access_token'] ? 'text' : 'password'}
                    value={settings.mp_access_token || ''}
                    onChange={(e) => updateSetting('mp_access_token', e.target.value)}
                    placeholder="APP_USR-..."
                  />
                  <button
                    type="button"
                    className={styles.toggleSecret}
                    onClick={() => toggleSecretVisibility('mp_access_token')}
                  >
                    {showSecrets['mp_access_token'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <Input
                  label="Public Key"
                  value={settings.mp_public_key || ''}
                  onChange={(e) => updateSetting('mp_public_key', e.target.value)}
                  placeholder="APP_USR-..."
                />
              </Card>
            )}

            {settings.active_gateway === 'asaas' && (
              <Card className={styles.card}>
                <h3 className={styles.sectionTitle}>Credenciais Asaas</h3>
                <p className={styles.sectionDescription}>
                  Obtenha sua API Key em{' '}
                  <a href="https://www.asaas.com/integracao/api" target="_blank" rel="noopener noreferrer">
                    asaas.com/integracao/api
                  </a>
                </p>

                <div className={styles.credentialField}>
                  <Input
                    label="API Key"
                    type={showSecrets['asaas_api_key'] ? 'text' : 'password'}
                    value={settings.asaas_api_key || ''}
                    onChange={(e) => updateSetting('asaas_api_key', e.target.value)}
                    placeholder="$aact_..."
                  />
                  <button
                    type="button"
                    className={styles.toggleSecret}
                    onClick={() => toggleSecretVisibility('asaas_api_key')}
                  >
                    {showSecrets['asaas_api_key'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className={styles.environmentToggle}>
                  <span className={styles.environmentLabel}>Ambiente:</span>
                  <div className={styles.environmentButtons}>
                    <button
                      className={`${styles.envButton} ${settings.asaas_environment === 'sandbox' ? styles.envButtonActive : ''}`}
                      onClick={() => updateSetting('asaas_environment', 'sandbox')}
                    >
                      Sandbox
                    </button>
                    <button
                      className={`${styles.envButton} ${settings.asaas_environment === 'production' ? styles.envButtonActive : ''}`}
                      onClick={() => updateSetting('asaas_environment', 'production')}
                    >
                      Producao
                    </button>
                  </div>
                </div>
              </Card>
            )}

            {settings.active_gateway === 'pagseguro' && (
              <Card className={styles.card}>
                <h3 className={styles.sectionTitle}>Credenciais PagSeguro</h3>
                <p className={styles.sectionDescription}>
                  Obtenha suas credenciais em{' '}
                  <a href="https://dev.pagseguro.uol.com.br" target="_blank" rel="noopener noreferrer">
                    dev.pagseguro.uol.com.br
                  </a>
                </p>

                <Input
                  label="Email"
                  type="email"
                  value={settings.ps_email || ''}
                  onChange={(e) => updateSetting('ps_email', e.target.value)}
                  placeholder="seu@email.com"
                />

                <div className={styles.credentialField}>
                  <Input
                    label="Token"
                    type={showSecrets['ps_token'] ? 'text' : 'password'}
                    value={settings.ps_token || ''}
                    onChange={(e) => updateSetting('ps_token', e.target.value)}
                    placeholder="Token de 32 caracteres"
                  />
                  <button
                    type="button"
                    className={styles.toggleSecret}
                    onClick={() => toggleSecretVisibility('ps_token')}
                  >
                    {showSecrets['ps_token'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Card>
            )}

            {settings.active_gateway === 'pagarme' && (
              <Card className={styles.card}>
                <h3 className={styles.sectionTitle}>Credenciais Pagar.me</h3>
                <p className={styles.sectionDescription}>
                  Obtenha suas credenciais em{' '}
                  <a href="https://dashboard.pagar.me" target="_blank" rel="noopener noreferrer">
                    dashboard.pagar.me
                  </a>
                </p>

                <div className={styles.credentialField}>
                  <Input
                    label="API Key"
                    type={showSecrets['pm_api_key'] ? 'text' : 'password'}
                    value={settings.pm_api_key || ''}
                    onChange={(e) => updateSetting('pm_api_key', e.target.value)}
                    placeholder="ak_live_..."
                  />
                  <button
                    type="button"
                    className={styles.toggleSecret}
                    onClick={() => toggleSecretVisibility('pm_api_key')}
                  >
                    {showSecrets['pm_api_key'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                <div className={styles.credentialField}>
                  <Input
                    label="Encryption Key"
                    type={showSecrets['pm_encryption_key'] ? 'text' : 'password'}
                    value={settings.pm_encryption_key || ''}
                    onChange={(e) => updateSetting('pm_encryption_key', e.target.value)}
                    placeholder="ek_live_..."
                  />
                  <button
                    type="button"
                    className={styles.toggleSecret}
                    onClick={() => toggleSecretVisibility('pm_encryption_key')}
                  >
                    {showSecrets['pm_encryption_key'] ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Card>
            )}

            {settings.active_gateway !== 'none' && (
              <Button variant="outline" onClick={handleTestConnection} loading={testing} fullWidth>
                <TestTube2 size={18} />
                Testar Conexao
              </Button>
            )}
          </div>
        )}

        {/* Payment Methods Tab */}
        {activeTab === 'methods' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Metodos de Pagamento</h3>
              <p className={styles.sectionDescription}>
                Selecione quais metodos de pagamento estarao disponiveis para seus clientes
              </p>

              <div className={styles.methodOptions}>
                <label className={styles.methodOption}>
                  <input
                    type="checkbox"
                    checked={settings.pix_enabled ?? true}
                    onChange={(e) => updateSetting('pix_enabled', e.target.checked)}
                    className={styles.methodCheckbox}
                  />
                  <div className={styles.methodIcon}>
                    <QrCode size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodLabel}>PIX</span>
                    <span className={styles.methodDescription}>Pagamento instantaneo</span>
                  </div>
                </label>

                <label className={styles.methodOption}>
                  <input
                    type="checkbox"
                    checked={settings.boleto_enabled ?? true}
                    onChange={(e) => updateSetting('boleto_enabled', e.target.checked)}
                    className={styles.methodCheckbox}
                  />
                  <div className={styles.methodIcon}>
                    <Receipt size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodLabel}>Boleto</span>
                    <span className={styles.methodDescription}>Vencimento em 3 dias uteis</span>
                  </div>
                </label>

                <label className={styles.methodOption}>
                  <input
                    type="checkbox"
                    checked={settings.credit_card_enabled ?? true}
                    onChange={(e) => updateSetting('credit_card_enabled', e.target.checked)}
                    className={styles.methodCheckbox}
                  />
                  <div className={styles.methodIcon}>
                    <CreditCard size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodLabel}>Cartao de Credito</span>
                    <span className={styles.methodDescription}>Visa, Mastercard, Elo</span>
                  </div>
                </label>
              </div>
            </Card>
          </div>
        )}

        {/* Checkout Tab */}
        {activeTab === 'checkout' && (
          <div className={styles.section}>
            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Link de Pagamento</h3>
              <p className={styles.sectionDescription}>
                Configure a URL publica para seus clientes realizarem pagamentos
              </p>

              <div className={styles.slugField}>
                <Input
                  label="Slug do Checkout"
                  value={settings.checkout_slug || ''}
                  onChange={(e) => updateSetting('checkout_slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="seu-nome"
                />
                <button type="button" className={styles.generateSlug} onClick={generateSlug}>
                  Gerar
                </button>
              </div>

              {checkoutUrl && (
                <div className={styles.checkoutUrl}>
                  <span className={styles.urlLabel}>Seu link de pagamento:</span>
                  <div className={styles.urlBox}>
                    <span className={styles.urlText}>{checkoutUrl}</span>
                    <button
                      type="button"
                      className={styles.urlAction}
                      onClick={() => copyToClipboard(checkoutUrl)}
                    >
                      <Copy size={16} />
                    </button>
                    <a
                      href={checkoutUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.urlAction}
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>
              )}
            </Card>

            <Card className={styles.card}>
              <h3 className={styles.sectionTitle}>Personalizacao</h3>

              <Input
                label="Titulo do Checkout"
                value={settings.checkout_title || ''}
                onChange={(e) => updateSetting('checkout_title', e.target.value)}
                placeholder="Plano de Acompanhamento"
              />

              <div className={styles.textareaWrapper}>
                <label className={styles.textareaLabel}>Descricao (opcional)</label>
                <textarea
                  className={styles.textarea}
                  value={settings.checkout_description || ''}
                  onChange={(e) => updateSetting('checkout_description', e.target.value)}
                  placeholder="Descreva os beneficios do seu acompanhamento..."
                  rows={3}
                />
              </div>

              <div className={styles.textareaWrapper}>
                <label className={styles.textareaLabel}>Mensagem de Sucesso</label>
                <textarea
                  className={styles.textarea}
                  value={settings.checkout_success_message || ''}
                  onChange={(e) => updateSetting('checkout_success_message', e.target.value)}
                  placeholder="Mensagem exibida apos pagamento aprovado..."
                  rows={3}
                />
              </div>
            </Card>
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className={styles.section}>
            <PlansManager ownerId={profile?.id || ''} />
          </div>
        )}

        {/* Save Message */}
        {saveMessage && (
          <div className={`${styles.saveMessage} ${styles[saveMessage.type]}`}>
            {saveMessage.type === 'success' ? <Check size={16} /> : <X size={16} />}
            {saveMessage.text}
          </div>
        )}
      </main>

      {/* Bottom Actions (only show for non-plans tabs) */}
      {activeTab !== 'plans' && (
        <div className={styles.bottomActions}>
          <Button onClick={handleSave} loading={saving} disabled={!hasChanges} fullWidth>
            <Save size={16} />
            Salvar Configuracoes
          </Button>
        </div>
      )}
    </PageContainer>
  );
}
