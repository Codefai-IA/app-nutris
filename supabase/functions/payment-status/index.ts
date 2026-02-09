import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { payment_id } = await req.json();

    if (!payment_id) {
      return new Response(
        JSON.stringify({ error: 'payment_id e obrigatorio' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment from database
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('id', payment_id)
      .single();

    if (paymentError || !payment) {
      return new Response(
        JSON.stringify({ error: 'Pagamento nao encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If already approved, return immediately
    if (payment.status === 'approved') {
      return new Response(
        JSON.stringify({ status: 'approved', paid_at: payment.paid_at }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If expired or rejected, return that status
    if (payment.status === 'expired' || payment.status === 'rejected') {
      return new Response(
        JSON.stringify({ status: payment.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get payment settings to check with gateway
    const { data: settings } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('owner_id', payment.owner_id)
      .single();

    if (!settings) {
      return new Response(
        JSON.stringify({ status: payment.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check payment status with gateway
    let gatewayStatus;

    switch (settings.active_gateway) {
      case 'mercado_pago':
        gatewayStatus = await checkMercadoPagoStatus(settings, payment.gateway_payment_id);
        break;
      case 'asaas':
        gatewayStatus = await checkAsaasStatus(settings, payment.gateway_payment_id);
        break;
      default:
        gatewayStatus = { status: payment.status };
    }

    // Update payment if status changed
    if (gatewayStatus.status !== payment.status) {
      const updateData: any = {
        status: gatewayStatus.status,
      };

      if (gatewayStatus.status === 'approved') {
        updateData.paid_at = new Date().toISOString();
      }

      await supabase
        .from('payments')
        .update(updateData)
        .eq('id', payment_id);
    }

    return new Response(
      JSON.stringify({
        status: gatewayStatus.status,
        paid_at: gatewayStatus.status === 'approved' ? new Date().toISOString() : null,
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

async function checkMercadoPagoStatus(settings: any, gatewayPaymentId: string): Promise<{ status: string }> {
  try {
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${gatewayPaymentId}`, {
      headers: {
        'Authorization': `Bearer ${settings.mp_access_token}`,
      },
    });

    const data = await response.json();

    // Map Mercado Pago status to our status
    switch (data.status) {
      case 'approved':
        return { status: 'approved' };
      case 'pending':
      case 'in_process':
      case 'authorized':
        return { status: 'pending' };
      case 'rejected':
      case 'cancelled':
        return { status: 'rejected' };
      case 'refunded':
      case 'charged_back':
        return { status: 'refunded' };
      default:
        return { status: 'pending' };
    }
  } catch (error) {
    console.error('MP status check error:', error);
    return { status: 'pending' };
  }
}

async function checkAsaasStatus(settings: any, gatewayPaymentId: string): Promise<{ status: string }> {
  const environment = settings.asaas_environment || 'sandbox';
  const baseUrl = environment === 'production'
    ? 'https://api.asaas.com/v3'
    : 'https://sandbox.asaas.com/api/v3';

  try {
    const response = await fetch(`${baseUrl}/payments/${gatewayPaymentId}`, {
      headers: {
        'access_token': settings.asaas_api_key,
      },
    });

    const data = await response.json();

    // Map Asaas status to our status
    switch (data.status) {
      case 'RECEIVED':
      case 'CONFIRMED':
        return { status: 'approved' };
      case 'PENDING':
      case 'AWAITING_RISK_ANALYSIS':
        return { status: 'pending' };
      case 'OVERDUE':
        return { status: 'expired' };
      case 'REFUNDED':
      case 'REFUND_REQUESTED':
        return { status: 'refunded' };
      default:
        return { status: 'rejected' };
    }
  } catch (error) {
    console.error('Asaas status check error:', error);
    return { status: 'pending' };
  }
}
