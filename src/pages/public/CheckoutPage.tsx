import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  QrCode,
  Receipt,
  CreditCard,
  Check,
  Copy,
  Loader2,
  AlertCircle,
  ChevronRight,
  Star,
  ArrowLeft,
  Clock,
  Lock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import type { SubscriptionPlan, PaymentMethod } from '../../types/database';
import styles from './CheckoutPage.module.css';

interface CheckoutSettings {
  owner_id: string;
  checkout_title: string;
  checkout_description: string | null;
  checkout_success_message: string;
  active_gateway: string;
  pix_enabled: boolean;
  boleto_enabled: boolean;
  credit_card_enabled: boolean;
  mp_public_key: string | null;
}

interface PaymentData {
  pix_qr_code?: string;
  pix_qr_code_base64?: string;
  pix_expiration?: string;
  boleto_url?: string;
  boleto_barcode?: string;
  boleto_expiration?: string;
  payment_id?: string;
}

interface CardForm {
  number: string;
  holder_name: string;
  expiry: string;
  cvv: string;
  installments: number;
}

type CheckoutStep = 'plans' | 'customer' | 'payment' | 'card_form' | 'processing' | 'success' | 'error';

export function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const { settings: themeSettings } = useTheme();

  const [loading, setLoading] = useState(true);
  const [checkoutSettings, setCheckoutSettings] = useState<CheckoutSettings | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Checkout state
  const [step, setStep] = useState<CheckoutStep>('plans');
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [copied, setCopied] = useState(false);

  // Customer form
  const [customerForm, setCustomerForm] = useState({
    name: '',
    email: '',
    phone: '',
    cpf: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Credit card form
  const [cardForm, setCardForm] = useState<CardForm>({
    number: '',
    holder_name: '',
    expiry: '',
    cvv: '',
    installments: 1,
  });
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (slug) {
      loadCheckoutData();
    }
  }, [slug]);

  const loadCheckoutData = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: settings, error: settingsError } = await supabase
        .from('payment_settings')
        .select('owner_id, checkout_title, checkout_description, checkout_success_message, active_gateway, pix_enabled, boleto_enabled, credit_card_enabled, mp_public_key')
        .eq('checkout_slug', slug)
        .neq('active_gateway', 'none')
        .maybeSingle();

      if (settingsError) {
        console.error('Error loading settings:', settingsError);
        setError('Erro ao carregar pagina de pagamento');
        return;
      }

      if (!settings) {
        setError('Pagina de pagamento nao encontrada');
        return;
      }

      setCheckoutSettings(settings);

      const { data: plansData, error: plansError } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('owner_id', settings.owner_id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (plansError) {
        console.error('Error loading plans:', plansError);
        setError('Erro ao carregar planos');
        return;
      }

      if (!plansData || plansData.length === 0) {
        setError('Nenhum plano disponivel no momento');
        return;
      }

      setPlans(plansData);
    } finally {
      setLoading(false);
    }
  };

  const validateCustomerForm = () => {
    const errors: Record<string, string> = {};

    if (!customerForm.name.trim()) {
      errors.name = 'Nome e obrigatorio';
    }

    if (!customerForm.email.trim()) {
      errors.email = 'Email e obrigatorio';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email)) {
      errors.email = 'Email invalido';
    }

    if (!customerForm.cpf.trim()) {
      errors.cpf = 'CPF e obrigatorio';
    } else {
      const cpfNumbers = customerForm.cpf.replace(/\D/g, '');
      if (cpfNumbers.length !== 11) {
        errors.cpf = 'CPF invalido';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateCardForm = () => {
    const errors: Record<string, string> = {};

    const cardNumber = cardForm.number.replace(/\D/g, '');
    if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) {
      errors.number = 'Numero do cartao invalido';
    }

    if (!cardForm.holder_name.trim() || cardForm.holder_name.trim().split(' ').length < 2) {
      errors.holder_name = 'Nome completo e obrigatorio';
    }

    const expiryParts = cardForm.expiry.split('/');
    if (expiryParts.length !== 2) {
      errors.expiry = 'Data invalida';
    } else {
      const month = parseInt(expiryParts[0]);
      const year = parseInt(expiryParts[1]);
      const now = new Date();
      const currentYear = now.getFullYear() % 100;
      const currentMonth = now.getMonth() + 1;

      if (month < 1 || month > 12) {
        errors.expiry = 'Mes invalido';
      } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
        errors.expiry = 'Cartao expirado';
      }
    }

    const cvv = cardForm.cvv.replace(/\D/g, '');
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      errors.cvv = 'CVV invalido';
    }

    setCardErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    setSelectedPlan(plan);
    setStep('customer');
  };

  const handleCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateCustomerForm()) {
      setStep('payment');
    }
  };

  const handleSelectMethod = (method: PaymentMethod) => {
    setSelectedMethod(method);

    if (method === 'credit_card') {
      // Show credit card form
      setCardForm({
        ...cardForm,
        holder_name: customerForm.name,
      });
      setStep('card_form');
    } else {
      // Process PIX or Boleto directly
      processPayment(method);
    }
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validateCardForm()) {
      processPayment('credit_card');
    }
  };

  const processPayment = async (method: PaymentMethod) => {
    if (!selectedPlan || !checkoutSettings) return;

    setStep('processing');
    setProcessing(true);
    setError(null);

    try {
      const payload: any = {
        owner_id: checkoutSettings.owner_id,
        plan_id: selectedPlan.id,
        payment_method: method,
        customer: {
          name: customerForm.name.trim(),
          email: customerForm.email.trim().toLowerCase(),
          phone: customerForm.phone.trim() || null,
          cpf: customerForm.cpf.replace(/\D/g, ''),
        },
      };

      // Add card data for credit card payments
      if (method === 'credit_card') {
        const expiryParts = cardForm.expiry.split('/');
        payload.card = {
          number: cardForm.number.replace(/\D/g, ''),
          holder_name: cardForm.holder_name.trim().toUpperCase(),
          exp_month: parseInt(expiryParts[0]),
          exp_year: 2000 + parseInt(expiryParts[1]),
          cvv: cardForm.cvv.replace(/\D/g, ''),
          installments: cardForm.installments,
        };
      }

      const { data, error: fnError } = await supabase.functions.invoke('payment-create', {
        body: payload,
      });

      if (fnError) {
        console.error('Payment creation error:', fnError);
        setError('Erro ao criar pagamento. Tente novamente.');
        setStep('error');
        return;
      }

      if (data.error) {
        setError(data.error);
        setStep('error');
        return;
      }

      setPaymentData(data);
      setStep('success');
    } catch (err) {
      console.error('Error:', err);
      setError('Erro ao processar pagamento');
      setStep('error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyPix = async () => {
    if (paymentData?.pix_qr_code) {
      try {
        await navigator.clipboard.writeText(paymentData.pix_qr_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        const textArea = document.createElement('textarea');
        textArea.value = paymentData.pix_qr_code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  const formatPrice = (cents: number) => {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });
  };

  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const formatPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const formatCardNumber = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})(\d)/, '$1 $2')
      .replace(/(\d{4})\d+?$/, '$1');
  };

  const formatExpiry = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\/\d{2})\d+?$/, '$1');
  };

  const getCardBrand = (number: string) => {
    const cleanNumber = number.replace(/\D/g, '');
    if (/^4/.test(cleanNumber)) return 'Visa';
    if (/^5[1-5]/.test(cleanNumber)) return 'Mastercard';
    if (/^(636368|438935|504175|451416|636297|5067|4576|4011|506699)/.test(cleanNumber)) return 'Elo';
    if (/^3[47]/.test(cleanNumber)) return 'Amex';
    if (/^(6011|65|64[4-9]|622)/.test(cleanNumber)) return 'Discover';
    return null;
  };

  // Installment options based on plan price
  const installmentOptions = selectedPlan
    ? Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const installmentValue = selectedPlan.price_cents / n / 100;
        if (installmentValue < 5) return null; // Minimum R$ 5 per installment
        return {
          value: n,
          label: n === 1
            ? `1x de ${formatPrice(selectedPlan.price_cents)} (sem juros)`
            : `${n}x de ${formatPrice(selectedPlan.price_cents / n)} (sem juros)`,
        };
      }).filter(Boolean)
    : [];

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 className={styles.spinner} size={32} />
          <span>Carregando...</span>
        </div>
      </div>
    );
  }

  if (error && step !== 'error') {
    return (
      <div className={styles.container}>
        <div className={styles.errorPage}>
          <AlertCircle size={48} />
          <h2>Ops!</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        {themeSettings?.logo_main_url && (
          <img src={themeSettings.logo_main_url} alt="Logo" className={styles.logo} />
        )}
        <h1 className={styles.title}>{checkoutSettings?.checkout_title || 'Plano de Acompanhamento'}</h1>
        {checkoutSettings?.checkout_description && (
          <p className={styles.description}>{checkoutSettings.checkout_description}</p>
        )}
      </header>

      <main className={styles.content}>
        {/* Step: Select Plan */}
        {step === 'plans' && (
          <div className={styles.plansStep}>
            <h2 className={styles.stepTitle}>Escolha seu plano</h2>
            <div className={styles.plansList}>
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  className={`${styles.planCard} ${plan.is_featured ? styles.planFeatured : ''}`}
                  onClick={() => handleSelectPlan(plan)}
                >
                  {plan.is_featured && (
                    <div className={styles.featuredBadge}>
                      <Star size={12} />
                      Mais Popular
                    </div>
                  )}
                  <div className={styles.planHeader}>
                    <h3 className={styles.planName}>{plan.name}</h3>
                    <div className={styles.planPrice}>
                      <span className={styles.priceValue}>{formatPrice(plan.price_cents)}</span>
                      <span className={styles.pricePeriod}>
                        / {plan.duration_days} {plan.duration_days === 1 ? 'dia' : 'dias'}
                      </span>
                    </div>
                  </div>
                  {plan.description && <p className={styles.planDescription}>{plan.description}</p>}
                  {plan.features && plan.features.length > 0 && (
                    <ul className={styles.planFeatures}>
                      {plan.features.map((feature, idx) => (
                        <li key={idx}>
                          <Check size={14} />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className={styles.selectPlan}>
                    Selecionar
                    <ChevronRight size={18} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Customer Info */}
        {step === 'customer' && selectedPlan && (
          <div className={styles.customerStep}>
            <button className={styles.backBtn} onClick={() => setStep('plans')}>
              <ArrowLeft size={18} />
              Voltar
            </button>

            <div className={styles.selectedPlanSummary}>
              <span>Plano selecionado:</span>
              <strong>{selectedPlan.name} - {formatPrice(selectedPlan.price_cents)}</strong>
            </div>

            <h2 className={styles.stepTitle}>Seus dados</h2>

            <form className={styles.customerForm} onSubmit={handleCustomerSubmit}>
              <div className={styles.formGroup}>
                <label>Nome completo *</label>
                <input
                  type="text"
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Seu nome completo"
                  className={formErrors.name ? styles.inputError : ''}
                />
                {formErrors.name && <span className={styles.errorText}>{formErrors.name}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>Email *</label>
                <input
                  type="email"
                  value={customerForm.email}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="seu@email.com"
                  className={formErrors.email ? styles.inputError : ''}
                />
                {formErrors.email && <span className={styles.errorText}>{formErrors.email}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>CPF *</label>
                <input
                  type="text"
                  value={customerForm.cpf}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, cpf: formatCPF(e.target.value) }))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className={formErrors.cpf ? styles.inputError : ''}
                />
                {formErrors.cpf && <span className={styles.errorText}>{formErrors.cpf}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>Telefone (opcional)</label>
                <input
                  type="tel"
                  value={customerForm.phone}
                  onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: formatPhone(e.target.value) }))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>

              <button type="submit" className={styles.continueBtn}>
                Continuar
                <ChevronRight size={18} />
              </button>
            </form>
          </div>
        )}

        {/* Step: Payment Method */}
        {step === 'payment' && selectedPlan && checkoutSettings && (
          <div className={styles.paymentStep}>
            <button className={styles.backBtn} onClick={() => setStep('customer')}>
              <ArrowLeft size={18} />
              Voltar
            </button>

            <div className={styles.selectedPlanSummary}>
              <span>Total a pagar:</span>
              <strong>{formatPrice(selectedPlan.price_cents)}</strong>
            </div>

            <h2 className={styles.stepTitle}>Forma de pagamento</h2>

            <div className={styles.methodsList}>
              {checkoutSettings.pix_enabled && (
                <button className={styles.methodCard} onClick={() => handleSelectMethod('pix')}>
                  <div className={styles.methodIcon}>
                    <QrCode size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodName}>PIX</span>
                    <span className={styles.methodDescription}>Aprovacao instantanea</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              )}

              {checkoutSettings.boleto_enabled && (
                <button className={styles.methodCard} onClick={() => handleSelectMethod('boleto')}>
                  <div className={styles.methodIcon}>
                    <Receipt size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodName}>Boleto Bancario</span>
                    <span className={styles.methodDescription}>Vencimento em 3 dias uteis</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              )}

              {checkoutSettings.credit_card_enabled && (
                <button className={styles.methodCard} onClick={() => handleSelectMethod('credit_card')}>
                  <div className={styles.methodIcon}>
                    <CreditCard size={24} />
                  </div>
                  <div className={styles.methodInfo}>
                    <span className={styles.methodName}>Cartao de Credito</span>
                    <span className={styles.methodDescription}>Visa, Mastercard, Elo</span>
                  </div>
                  <ChevronRight size={20} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step: Credit Card Form */}
        {step === 'card_form' && selectedPlan && checkoutSettings && (
          <div className={styles.cardFormStep}>
            <button className={styles.backBtn} onClick={() => setStep('payment')}>
              <ArrowLeft size={18} />
              Voltar
            </button>

            <div className={styles.selectedPlanSummary}>
              <span>Total a pagar:</span>
              <strong>{formatPrice(selectedPlan.price_cents)}</strong>
            </div>

            <h2 className={styles.stepTitle}>Dados do Cartao</h2>

            <form className={styles.cardForm} onSubmit={handleCardSubmit}>
              <div className={styles.formGroup}>
                <label>Numero do Cartao *</label>
                <div className={styles.cardInputWrapper}>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardForm.number}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, number: formatCardNumber(e.target.value) }))}
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    className={cardErrors.number ? styles.inputError : ''}
                  />
                  {getCardBrand(cardForm.number) && (
                    <span className={styles.cardBrand}>{getCardBrand(cardForm.number)}</span>
                  )}
                </div>
                {cardErrors.number && <span className={styles.errorText}>{cardErrors.number}</span>}
              </div>

              <div className={styles.formGroup}>
                <label>Nome no Cartao *</label>
                <input
                  type="text"
                  value={cardForm.holder_name}
                  onChange={(e) => setCardForm((prev) => ({ ...prev, holder_name: e.target.value.toUpperCase() }))}
                  placeholder="NOME COMO NO CARTAO"
                  className={cardErrors.holder_name ? styles.inputError : ''}
                />
                {cardErrors.holder_name && <span className={styles.errorText}>{cardErrors.holder_name}</span>}
              </div>

              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label>Validade *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardForm.expiry}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, expiry: formatExpiry(e.target.value) }))}
                    placeholder="MM/AA"
                    maxLength={5}
                    className={cardErrors.expiry ? styles.inputError : ''}
                  />
                  {cardErrors.expiry && <span className={styles.errorText}>{cardErrors.expiry}</span>}
                </div>

                <div className={styles.formGroup}>
                  <label>CVV *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder="123"
                    maxLength={4}
                    className={cardErrors.cvv ? styles.inputError : ''}
                  />
                  {cardErrors.cvv && <span className={styles.errorText}>{cardErrors.cvv}</span>}
                </div>
              </div>

              {installmentOptions.length > 1 && (
                <div className={styles.formGroup}>
                  <label>Parcelas</label>
                  <select
                    value={cardForm.installments}
                    onChange={(e) => setCardForm((prev) => ({ ...prev, installments: parseInt(e.target.value) }))}
                    className={styles.selectInput}
                  >
                    {installmentOptions.map((opt: any) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.securityNote}>
                <Lock size={14} />
                <span>Pagamento 100% seguro. Seus dados estao protegidos.</span>
              </div>

              <button type="submit" className={styles.payBtn}>
                <Lock size={18} />
                Pagar {formatPrice(selectedPlan.price_cents)}
              </button>
            </form>
          </div>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className={styles.processingStep}>
            <Loader2 className={styles.spinner} size={48} />
            <h2>Processando pagamento...</h2>
            <p>Aguarde um momento</p>
          </div>
        )}

        {/* Step: Success */}
        {step === 'success' && paymentData && (
          <div className={styles.successStep}>
            {selectedMethod === 'pix' && paymentData.pix_qr_code_base64 && (
              <>
                <div className={styles.successIcon}>
                  <QrCode size={32} />
                </div>
                <h2>Pague com PIX</h2>
                <p>Escaneie o QR Code ou copie o codigo</p>

                <div className={styles.qrCodeContainer}>
                  <img
                    src={`data:image/png;base64,${paymentData.pix_qr_code_base64}`}
                    alt="QR Code PIX"
                    className={styles.qrCode}
                  />
                </div>

                <button className={styles.copyBtn} onClick={handleCopyPix}>
                  {copied ? (
                    <>
                      <Check size={18} />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      Copiar codigo PIX
                    </>
                  )}
                </button>

                {paymentData.pix_expiration && (
                  <div className={styles.expirationNote}>
                    <Clock size={14} />
                    Expira em 30 minutos
                  </div>
                )}

                <div className={styles.waitingNote}>
                  <p>
                    Apos o pagamento, voce recebera um email com suas credenciais de acesso.
                  </p>
                </div>
              </>
            )}

            {selectedMethod === 'boleto' && paymentData.boleto_url && (
              <>
                <div className={styles.successIcon}>
                  <Receipt size={32} />
                </div>
                <h2>Boleto Gerado</h2>
                <p>Clique no botao abaixo para visualizar e pagar</p>

                <a
                  href={paymentData.boleto_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.boletoBtn}
                >
                  Visualizar Boleto
                </a>

                {paymentData.boleto_barcode && (
                  <div className={styles.barcodeBox}>
                    <span className={styles.barcodeLabel}>Codigo de barras:</span>
                    <span className={styles.barcodeValue}>{paymentData.boleto_barcode}</span>
                  </div>
                )}

                <div className={styles.waitingNote}>
                  <p>
                    O pagamento sera confirmado em ate 3 dias uteis. Voce recebera um email com suas credenciais de acesso.
                  </p>
                </div>
              </>
            )}

            {selectedMethod === 'credit_card' && (
              <>
                <div className={styles.successIconGreen}>
                  <Check size={32} />
                </div>
                <h2>Pagamento Confirmado!</h2>
                <p>{checkoutSettings?.checkout_success_message}</p>
              </>
            )}
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className={styles.errorStep}>
            <div className={styles.errorIcon}>
              <AlertCircle size={32} />
            </div>
            <h2>Erro no Pagamento</h2>
            <p>{error || 'Ocorreu um erro ao processar seu pagamento.'}</p>
            <button className={styles.retryBtn} onClick={() => setStep('payment')}>
              Tentar Novamente
            </button>
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>Pagamento seguro processado por {checkoutSettings?.active_gateway?.replace('_', ' ')}</p>
      </footer>
    </div>
  );
}
