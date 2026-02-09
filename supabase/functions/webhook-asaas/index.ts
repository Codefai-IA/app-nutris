import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, asaas-access-token',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    console.log('Asaas Webhook received:', JSON.stringify(body));

    // Asaas sends event type in the body
    const event = body.event;
    const payment = body.payment;

    if (!payment?.id) {
      return new Response('OK', { status: 200 });
    }

    // Only process payment events
    const paymentEvents = [
      'PAYMENT_CONFIRMED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'PAYMENT_DELETED',
      'PAYMENT_REFUNDED',
    ];

    if (!paymentEvents.includes(event)) {
      return new Response('OK', { status: 200 });
    }

    // Find payment in our database
    const { data: dbPayment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('gateway_payment_id', payment.id)
      .eq('gateway', 'asaas')
      .maybeSingle();

    if (paymentError || !dbPayment) {
      console.log('Payment not found:', payment.id);
      return new Response('OK', { status: 200 });
    }

    // Map status
    let newStatus;
    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        newStatus = 'approved';
        break;
      case 'PAYMENT_OVERDUE':
        newStatus = 'expired';
        break;
      case 'PAYMENT_DELETED':
        newStatus = 'rejected';
        break;
      case 'PAYMENT_REFUNDED':
        newStatus = 'refunded';
        break;
      default:
        newStatus = dbPayment.status;
    }

    if (newStatus === dbPayment.status) {
      return new Response('OK', { status: 200 });
    }

    // Update payment
    const updateData: any = {
      status: newStatus,
      webhook_data: body,
    };

    if (newStatus === 'approved') {
      updateData.paid_at = new Date().toISOString();
    }

    await supabase
      .from('payments')
      .update(updateData)
      .eq('id', dbPayment.id);

    // Handle approved payment
    if (newStatus === 'approved') {
      await handlePaymentApproved(supabase, dbPayment);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});

async function handlePaymentApproved(supabase: any, payment: any) {
  // Get plan
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', payment.plan_id)
    .single();

  if (!plan) return;

  const today = new Date();
  const planEndDate = new Date(today);
  planEndDate.setDate(planEndDate.getDate() + plan.duration_days);

  if (payment.client_id) {
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
      .update({ plan_end_date: newEndDate.toISOString().split('T')[0], is_active: true })
      .eq('id', payment.client_id);
    return;
  }

  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', payment.customer_email)
    .maybeSingle();

  if (existingUser) {
    await supabase
      .from('profiles')
      .update({ plan_end_date: planEndDate.toISOString().split('T')[0], is_active: true })
      .eq('id', existingUser.id);
    await supabase.from('payments').update({ client_id: existingUser.id }).eq('id', payment.id);
    return;
  }

  // Create new user
  const password = generatePassword();
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: payment.customer_email,
    password,
    email_confirm: true,
    user_metadata: { full_name: payment.customer_name },
  });

  if (authError) {
    console.error('Auth error:', authError);
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

  await supabase.from('payments').update({ client_id: authUser.user.id }).eq('id', payment.id);

  try {
    await supabase.functions.invoke('send-email', {
      body: {
        type: 'welcome',
        to: payment.customer_email,
        data: {
          name: payment.customer_name,
          email: payment.customer_email,
          password,
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
