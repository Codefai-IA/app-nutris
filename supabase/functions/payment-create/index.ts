import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CustomerData {
  name: string;
  email: string;
  phone: string | null;
  cpf: string;
}

interface CardData {
  number: string;
  holder_name: string;
  exp_month: number;
  exp_year: number;
  cvv: string;
  installments: number;
}

interface RequestBody {
  owner_id: string;
  plan_id: string;
  payment_method: 'pix' | 'boleto' | 'credit_card';
  customer: CustomerData;
  card?: CardData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: RequestBody = await req.json();
    const { owner_id, plan_id, payment_method, customer, card } = body;

    if (!owner_id || !plan_id || !payment_method || !customer) {
      return new Response(
        JSON.stringify({ error: 'Dados incompletos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (payment_method === 'credit_card' && !card) {
      return new Response(
        JSON.stringify({ error: 'Dados do cartao sao obrigatorios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment settings
    const { data: settings, error: settingsError } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('owner_id', owner_id)
      .single();

    if (settingsError || !settings) {
      console.error('Settings error:', settingsError);
      return new Response(
        JSON.stringify({ error: 'Configuracoes de pagamento nao encontradas' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate payment method is enabled
    if (payment_method === 'pix' && !settings.pix_enabled) {
      return new Response(
        JSON.stringify({ error: 'PIX nao esta habilitado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (payment_method === 'boleto' && !settings.boleto_enabled) {
      return new Response(
        JSON.stringify({ error: 'Boleto nao esta habilitado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    if (payment_method === 'credit_card' && !settings.credit_card_enabled) {
      return new Response(
        JSON.stringify({ error: 'Cartao de credito nao esta habilitado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', plan_id)
      .eq('is_active', true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ error: 'Plano nao encontrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if customer already exists
    const { data: existingClient } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', customer.email.toLowerCase())
      .maybeSingle();

    let paymentResult;

    // Process payment based on gateway
    switch (settings.active_gateway) {
      case 'mercado_pago':
        paymentResult = await createMercadoPagoPayment(settings, plan, customer, payment_method, card);
        break;
      case 'asaas':
        paymentResult = await createAsaasPayment(settings, plan, customer, payment_method, card);
        break;
      case 'pagseguro':
        paymentResult = await createPagSeguroPayment(settings, plan, customer, payment_method, card);
        break;
      case 'pagarme':
        paymentResult = await createPagarmePayment(settings, plan, customer, payment_method, card);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Gateway nao configurado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    if (paymentResult.error) {
      return new Response(
        JSON.stringify({ error: paymentResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        owner_id,
        client_id: existingClient?.id || null,
        plan_id,
        gateway: settings.active_gateway,
        gateway_payment_id: paymentResult.gateway_payment_id,
        amount_cents: plan.price_cents,
        payment_method,
        status: paymentResult.status || 'pending',
        customer_email: customer.email.toLowerCase(),
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_cpf: customer.cpf,
        pix_qr_code: paymentResult.pix_qr_code,
        pix_qr_code_base64: paymentResult.pix_qr_code_base64,
        pix_expiration: paymentResult.pix_expiration,
        boleto_url: paymentResult.boleto_url,
        boleto_barcode: paymentResult.boleto_barcode,
        boleto_expiration: paymentResult.boleto_expiration,
        card_last_digits: card?.number?.slice(-4),
        card_brand: paymentResult.card_brand,
        installments: card?.installments || 1,
        paid_at: paymentResult.status === 'approved' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Payment record error:', paymentError);
      return new Response(
        JSON.stringify({ error: 'Erro ao registrar pagamento' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If credit card approved, process user creation immediately
    if (payment_method === 'credit_card' && paymentResult.status === 'approved') {
      await handlePaymentApproved(supabase, payment, plan);
    }

    return new Response(
      JSON.stringify({
        payment_id: payment.id,
        status: paymentResult.status,
        pix_qr_code: payment.pix_qr_code,
        pix_qr_code_base64: payment.pix_qr_code_base64,
        pix_expiration: payment.pix_expiration,
        boleto_url: payment.boleto_url,
        boleto_barcode: payment.boleto_barcode,
        boleto_expiration: payment.boleto_expiration,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ===========================================
// MERCADO PAGO
// ===========================================
async function createMercadoPagoPayment(
  settings: any,
  plan: any,
  customer: CustomerData,
  payment_method: string,
  card?: CardData
): Promise<any> {
  const accessToken = settings.mp_access_token;

  if (!accessToken) {
    return { error: 'Credenciais do Mercado Pago nao configuradas' };
  }

  const paymentData: any = {
    transaction_amount: plan.price_cents / 100,
    description: `${plan.name} - ${plan.duration_days} dias`,
    payer: {
      email: customer.email,
      first_name: customer.name.split(' ')[0],
      last_name: customer.name.split(' ').slice(1).join(' ') || customer.name,
      identification: {
        type: 'CPF',
        number: customer.cpf,
      },
    },
  };

  if (payment_method === 'pix') {
    paymentData.payment_method_id = 'pix';
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + 30);
    paymentData.date_of_expiration = expiration.toISOString();
  } else if (payment_method === 'boleto') {
    paymentData.payment_method_id = 'bolbradesco';
    const expiration = new Date();
    expiration.setDate(expiration.getDate() + 3);
    paymentData.date_of_expiration = expiration.toISOString();
  } else if (payment_method === 'credit_card' && card) {
    // For Mercado Pago, we need to create a card token first
    const tokenResult = await createMPCardToken(accessToken, card, customer);
    if (tokenResult.error) return tokenResult;

    paymentData.token = tokenResult.token;
    paymentData.installments = card.installments;
    paymentData.payment_method_id = tokenResult.payment_method_id;
  }

  try {
    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify(paymentData),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MP Error:', data);
      return { error: data.message || 'Erro ao processar pagamento' };
    }

    const result: any = {
      gateway_payment_id: data.id.toString(),
      status: mapMPStatus(data.status),
    };

    if (payment_method === 'pix') {
      result.pix_qr_code = data.point_of_interaction?.transaction_data?.qr_code;
      result.pix_qr_code_base64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
      const exp = new Date();
      exp.setMinutes(exp.getMinutes() + 30);
      result.pix_expiration = exp.toISOString();
    } else if (payment_method === 'boleto') {
      result.boleto_url = data.transaction_details?.external_resource_url;
      result.boleto_barcode = data.barcode?.content;
      const exp = new Date();
      exp.setDate(exp.getDate() + 3);
      result.boleto_expiration = exp.toISOString().split('T')[0];
    } else if (payment_method === 'credit_card') {
      result.card_brand = data.payment_method_id;
    }

    return result;
  } catch (error) {
    console.error('MP Request Error:', error);
    return { error: 'Erro de comunicacao com Mercado Pago' };
  }
}

async function createMPCardToken(accessToken: string, card: CardData, customer: CustomerData): Promise<any> {
  try {
    const response = await fetch('https://api.mercadopago.com/v1/card_tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        card_number: card.number,
        cardholder: {
          name: card.holder_name,
          identification: {
            type: 'CPF',
            number: customer.cpf,
          },
        },
        expiration_month: card.exp_month,
        expiration_year: card.exp_year,
        security_code: card.cvv,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('MP Token Error:', data);
      return { error: 'Erro ao processar cartao' };
    }

    return {
      token: data.id,
      payment_method_id: data.payment_method?.id || 'visa',
    };
  } catch (error) {
    console.error('MP Token Request Error:', error);
    return { error: 'Erro ao processar cartao' };
  }
}

function mapMPStatus(status: string): string {
  switch (status) {
    case 'approved': return 'approved';
    case 'pending':
    case 'in_process':
    case 'authorized': return 'pending';
    case 'rejected':
    case 'cancelled': return 'rejected';
    default: return 'pending';
  }
}

// ===========================================
// ASAAS
// ===========================================
async function createAsaasPayment(
  settings: any,
  plan: any,
  customer: CustomerData,
  payment_method: string,
  card?: CardData
): Promise<any> {
  const apiKey = settings.asaas_api_key;
  const environment = settings.asaas_environment || 'sandbox';
  const baseUrl = environment === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

  if (!apiKey) {
    return { error: 'Credenciais do Asaas nao configuradas' };
  }

  try {
    // Create or get customer
    const customerResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify({
        name: customer.name,
        email: customer.email,
        cpfCnpj: customer.cpf,
        mobilePhone: customer.phone,
      }),
    });

    const customerData = await customerResponse.json();
    const customerId = customerData.id;

    if (!customerId) {
      console.error('Asaas customer error:', customerData);
      return { error: 'Erro ao criar cliente' };
    }

    // Map billing type
    let billingType;
    switch (payment_method) {
      case 'pix': billingType = 'PIX'; break;
      case 'boleto': billingType = 'BOLETO'; break;
      case 'credit_card': billingType = 'CREDIT_CARD'; break;
      default: return { error: 'Metodo de pagamento invalido' };
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);

    const paymentPayload: any = {
      customer: customerId,
      billingType,
      value: plan.price_cents / 100,
      dueDate: dueDate.toISOString().split('T')[0],
      description: `${plan.name} - ${plan.duration_days} dias`,
    };

    // Add credit card data
    if (payment_method === 'credit_card' && card) {
      paymentPayload.creditCard = {
        holderName: card.holder_name,
        number: card.number,
        expiryMonth: card.exp_month.toString().padStart(2, '0'),
        expiryYear: card.exp_year.toString(),
        ccv: card.cvv,
      };
      paymentPayload.creditCardHolderInfo = {
        name: customer.name,
        email: customer.email,
        cpfCnpj: customer.cpf,
        phone: customer.phone,
        postalCode: '00000000', // Required but we don't collect
        addressNumber: '0',
      };
      if (card.installments > 1) {
        paymentPayload.installmentCount = card.installments;
      }
    }

    const paymentResponse = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': apiKey,
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentResponse.json();

    if (!paymentData.id) {
      console.error('Asaas payment error:', paymentData);
      return { error: paymentData.errors?.[0]?.description || 'Erro ao criar cobranca' };
    }

    const result: any = {
      gateway_payment_id: paymentData.id,
      status: mapAsaasStatus(paymentData.status),
    };

    if (payment_method === 'pix') {
      const pixResponse = await fetch(`${baseUrl}/payments/${paymentData.id}/pixQrCode`, {
        headers: { 'access_token': apiKey },
      });
      const pixData = await pixResponse.json();
      result.pix_qr_code = pixData.payload;
      result.pix_qr_code_base64 = pixData.encodedImage;
      const exp = new Date();
      exp.setMinutes(exp.getMinutes() + 30);
      result.pix_expiration = exp.toISOString();
    } else if (payment_method === 'boleto') {
      result.boleto_url = paymentData.bankSlipUrl;
      result.boleto_barcode = paymentData.nossoNumero;
      result.boleto_expiration = paymentData.dueDate;
    }

    return result;
  } catch (error) {
    console.error('Asaas Request Error:', error);
    return { error: 'Erro de comunicacao com Asaas' };
  }
}

function mapAsaasStatus(status: string): string {
  switch (status) {
    case 'RECEIVED':
    case 'CONFIRMED': return 'approved';
    case 'PENDING':
    case 'AWAITING_RISK_ANALYSIS': return 'pending';
    case 'OVERDUE': return 'expired';
    default: return 'rejected';
  }
}

// ===========================================
// PAGSEGURO
// ===========================================
async function createPagSeguroPayment(
  settings: any,
  plan: any,
  customer: CustomerData,
  payment_method: string,
  card?: CardData
): Promise<any> {
  const token = settings.ps_token;
  const email = settings.ps_email;

  if (!token || !email) {
    return { error: 'Credenciais do PagSeguro nao configuradas' };
  }

  // PagSeguro API v4
  const baseUrl = 'https://api.pagseguro.com';

  try {
    const paymentPayload: any = {
      reference_id: crypto.randomUUID(),
      customer: {
        name: customer.name,
        email: customer.email,
        tax_id: customer.cpf,
        phones: customer.phone ? [{
          country: '55',
          area: customer.phone.slice(0, 2),
          number: customer.phone.slice(2),
          type: 'MOBILE',
        }] : [],
      },
      items: [{
        reference_id: plan.id,
        name: plan.name,
        quantity: 1,
        unit_amount: plan.price_cents,
      }],
    };

    if (payment_method === 'pix') {
      paymentPayload.qr_codes = [{
        amount: { value: plan.price_cents },
        expiration_date: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }];
    } else if (payment_method === 'boleto') {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      paymentPayload.boletos = [{
        amount: { value: plan.price_cents },
        due_date: dueDate.toISOString().split('T')[0],
        instruction_lines: {
          line_1: `Pagamento referente ao plano ${plan.name}`,
          line_2: `Valido por ${plan.duration_days} dias`,
        },
        holder: {
          name: customer.name,
          tax_id: customer.cpf,
          email: customer.email,
        },
      }];
    } else if (payment_method === 'credit_card' && card) {
      paymentPayload.charges = [{
        reference_id: crypto.randomUUID(),
        description: `${plan.name} - ${plan.duration_days} dias`,
        amount: {
          value: plan.price_cents,
          currency: 'BRL',
        },
        payment_method: {
          type: 'CREDIT_CARD',
          installments: card.installments,
          capture: true,
          card: {
            number: card.number,
            exp_month: card.exp_month.toString().padStart(2, '0'),
            exp_year: card.exp_year.toString(),
            security_code: card.cvv,
            holder: {
              name: card.holder_name,
            },
          },
        },
      }];
    }

    const response = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(paymentPayload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('PagSeguro Error:', data);
      return { error: data.error_messages?.[0]?.description || 'Erro ao processar pagamento' };
    }

    const result: any = {
      gateway_payment_id: data.id,
      status: 'pending',
    };

    if (payment_method === 'pix' && data.qr_codes?.[0]) {
      const qrCode = data.qr_codes[0];
      result.pix_qr_code = qrCode.text;
      // PagSeguro returns PNG as array, need to convert
      if (qrCode.links) {
        const pngLink = qrCode.links.find((l: any) => l.media === 'image/png');
        if (pngLink) {
          // Fetch the image and convert to base64
          const imgResponse = await fetch(pngLink.href);
          const imgBuffer = await imgResponse.arrayBuffer();
          result.pix_qr_code_base64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
        }
      }
      result.pix_expiration = qrCode.expiration_date;
    } else if (payment_method === 'boleto' && data.boletos?.[0]) {
      const boleto = data.boletos[0];
      result.boleto_url = boleto.links?.find((l: any) => l.media === 'application/pdf')?.href;
      result.boleto_barcode = boleto.barcode;
      result.boleto_expiration = boleto.due_date;
    } else if (payment_method === 'credit_card' && data.charges?.[0]) {
      const charge = data.charges[0];
      result.status = charge.status === 'PAID' ? 'approved' : 'pending';
      result.card_brand = charge.payment_method?.card?.brand;
    }

    return result;
  } catch (error) {
    console.error('PagSeguro Request Error:', error);
    return { error: 'Erro de comunicacao com PagSeguro' };
  }
}

// ===========================================
// PAGAR.ME
// ===========================================
async function createPagarmePayment(
  settings: any,
  plan: any,
  customer: CustomerData,
  payment_method: string,
  card?: CardData
): Promise<any> {
  const apiKey = settings.pm_api_key;

  if (!apiKey) {
    return { error: 'Credenciais do Pagar.me nao configuradas' };
  }

  const baseUrl = 'https://api.pagar.me/core/v5';
  const authHeader = 'Basic ' + btoa(apiKey + ':');

  try {
    // Create customer first
    const customerPayload = {
      name: customer.name,
      email: customer.email,
      document: customer.cpf,
      type: 'individual',
      document_type: 'CPF',
      phones: customer.phone ? {
        mobile_phone: {
          country_code: '55',
          area_code: customer.phone.replace(/\D/g, '').slice(0, 2),
          number: customer.phone.replace(/\D/g, '').slice(2),
        },
      } : undefined,
    };

    const customerResponse = await fetch(`${baseUrl}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(customerPayload),
    });

    const customerData = await customerResponse.json();

    if (!customerData.id && !customerResponse.ok) {
      // Try to find existing customer
      const searchResponse = await fetch(`${baseUrl}/customers?email=${customer.email}`, {
        headers: { 'Authorization': authHeader },
      });
      const searchData = await searchResponse.json();
      if (searchData.data?.[0]?.id) {
        customerData.id = searchData.data[0].id;
      } else {
        console.error('Pagar.me customer error:', customerData);
        return { error: 'Erro ao criar cliente' };
      }
    }

    // Create order with payment
    const orderPayload: any = {
      customer_id: customerData.id,
      items: [{
        amount: plan.price_cents,
        description: plan.name,
        quantity: 1,
      }],
      payments: [],
    };

    if (payment_method === 'pix') {
      orderPayload.payments.push({
        payment_method: 'pix',
        pix: {
          expires_in: 1800, // 30 minutes
        },
      });
    } else if (payment_method === 'boleto') {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      orderPayload.payments.push({
        payment_method: 'boleto',
        boleto: {
          instructions: `Pagamento referente ao plano ${plan.name}`,
          due_at: dueDate.toISOString(),
        },
      });
    } else if (payment_method === 'credit_card' && card) {
      orderPayload.payments.push({
        payment_method: 'credit_card',
        credit_card: {
          installments: card.installments,
          card: {
            number: card.number,
            holder_name: card.holder_name,
            exp_month: card.exp_month,
            exp_year: card.exp_year,
            cvv: card.cvv,
            billing_address: {
              line_1: 'Rua Exemplo, 123',
              zip_code: '00000000',
              city: 'Sao Paulo',
              state: 'SP',
              country: 'BR',
            },
          },
        },
      });
    }

    const orderResponse = await fetch(`${baseUrl}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(orderPayload),
    });

    const orderData = await orderResponse.json();

    if (!orderData.id) {
      console.error('Pagar.me order error:', orderData);
      return { error: orderData.message || 'Erro ao criar cobranca' };
    }

    const charge = orderData.charges?.[0];
    const result: any = {
      gateway_payment_id: orderData.id,
      status: mapPagarmeStatus(orderData.status),
    };

    if (payment_method === 'pix' && charge?.last_transaction) {
      const txn = charge.last_transaction;
      result.pix_qr_code = txn.qr_code;
      result.pix_qr_code_base64 = txn.qr_code_url ? await fetchImageAsBase64(txn.qr_code_url) : null;
      result.pix_expiration = txn.expires_at;
    } else if (payment_method === 'boleto' && charge?.last_transaction) {
      const txn = charge.last_transaction;
      result.boleto_url = txn.pdf;
      result.boleto_barcode = txn.line;
      result.boleto_expiration = txn.due_at?.split('T')[0];
    } else if (payment_method === 'credit_card') {
      result.card_brand = charge?.last_transaction?.card?.brand;
    }

    return result;
  } catch (error) {
    console.error('Pagar.me Request Error:', error);
    return { error: 'Erro de comunicacao com Pagar.me' };
  }
}

function mapPagarmeStatus(status: string): string {
  switch (status) {
    case 'paid': return 'approved';
    case 'pending': return 'pending';
    case 'canceled':
    case 'failed': return 'rejected';
    default: return 'pending';
  }
}

async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
  } catch {
    return null;
  }
}

// ===========================================
// USER CREATION ON APPROVED PAYMENT
// ===========================================
async function handlePaymentApproved(supabase: any, payment: any, plan: any) {
  const today = new Date();
  const planEndDate = new Date(today);
  planEndDate.setDate(planEndDate.getDate() + plan.duration_days);

  // Check if user exists
  if (payment.client_id) {
    // Extend existing user's plan
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('plan_end_date')
      .eq('id', payment.client_id)
      .single();

    let newEndDate = planEndDate;
    if (existingProfile?.plan_end_date) {
      const currentEnd = new Date(existingProfile.plan_end_date);
      if (currentEnd > today) {
        newEndDate = new Date(currentEnd);
        newEndDate.setDate(newEndDate.getDate() + plan.duration_days);
      }
    }

    await supabase
      .from('profiles')
      .update({
        plan_end_date: newEndDate.toISOString().split('T')[0],
        is_active: true,
      })
      .eq('id', payment.client_id);

    return;
  }

  // Check if user exists by email
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', payment.customer_email)
    .maybeSingle();

  if (existingUser) {
    await supabase
      .from('profiles')
      .update({
        plan_end_date: planEndDate.toISOString().split('T')[0],
        is_active: true,
      })
      .eq('id', existingUser.id);

    await supabase
      .from('payments')
      .update({ client_id: existingUser.id })
      .eq('id', payment.id);

    return;
  }

  // Create new user
  const password = generatePassword();

  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: payment.customer_email,
    password: password,
    email_confirm: true,
    user_metadata: { full_name: payment.customer_name },
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    return;
  }

  await supabase.from('profiles').insert({
    id: authUser.user.id,
    role: 'client',
    full_name: payment.customer_name,
    email: payment.customer_email,
    phone: payment.customer_phone,
    plan_start_date: today.toISOString().split('T')[0],
    plan_end_date: planEndDate.toISOString().split('T')[0],
    is_active: true,
  });

  await supabase
    .from('payments')
    .update({ client_id: authUser.user.id })
    .eq('id', payment.id);

  // Send welcome email
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        type: 'welcome',
        to: payment.customer_email,
        data: {
          name: payment.customer_name,
          email: payment.customer_email,
          password: password,
          planName: plan.name,
          planEndDate: planEndDate.toLocaleDateString('pt-BR'),
        },
      },
    });
  } catch (e) {
    console.error('Email error:', e);
  }
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
