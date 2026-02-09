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

    const body = await req.json();
    console.log('Webhook received:', JSON.stringify(body));

    // Mercado Pago sends 'payment' or 'payment.updated' action
    if (body.type !== 'payment' && body.action !== 'payment.created' && body.action !== 'payment.updated') {
      return new Response('OK', { status: 200 });
    }

    const paymentId = body.data?.id;
    if (!paymentId) {
      console.log('No payment ID in webhook');
      return new Response('OK', { status: 200 });
    }

    // Find payment in our database
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('*, payment_settings:owner_id(mp_access_token)')
      .eq('gateway_payment_id', paymentId.toString())
      .eq('gateway', 'mercado_pago')
      .maybeSingle();

    if (paymentError || !payment) {
      console.log('Payment not found:', paymentId);
      return new Response('OK', { status: 200 });
    }

    // Get full payment details from Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${payment.payment_settings?.mp_access_token}`,
      },
    });

    const mpPayment = await mpResponse.json();
    console.log('MP Payment status:', mpPayment.status);

    // Map status
    let newStatus;
    switch (mpPayment.status) {
      case 'approved':
        newStatus = 'approved';
        break;
      case 'pending':
      case 'in_process':
      case 'authorized':
        newStatus = 'pending';
        break;
      case 'rejected':
      case 'cancelled':
        newStatus = 'rejected';
        break;
      case 'refunded':
      case 'charged_back':
        newStatus = 'refunded';
        break;
      default:
        newStatus = payment.status;
    }

    // Only process if status changed
    if (newStatus === payment.status) {
      return new Response('OK', { status: 200 });
    }

    // Update payment status
    const updateData: any = {
      status: newStatus,
      webhook_data: mpPayment,
    };

    if (newStatus === 'approved') {
      updateData.paid_at = new Date().toISOString();
    }

    await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id);

    // If payment is approved, create or update user
    if (newStatus === 'approved') {
      await handlePaymentApproved(supabase, payment);
    }

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response('Error', { status: 500 });
  }
});

async function handlePaymentApproved(supabase: any, payment: any) {
  console.log('Processing approved payment:', payment.id);

  // Get plan details
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('id', payment.plan_id)
    .single();

  if (!plan) {
    console.error('Plan not found');
    return;
  }

  // Calculate plan dates
  const today = new Date();
  const planEndDate = new Date(today);
  planEndDate.setDate(planEndDate.getDate() + plan.duration_days);

  // Check if client already exists
  if (payment.client_id) {
    // Existing client - extend plan
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('plan_end_date')
      .eq('id', payment.client_id)
      .single();

    let newEndDate = planEndDate;

    // If existing plan hasn't expired, add to it
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

    console.log('Extended plan for existing client:', payment.client_id);
    return;
  }

  // Check if user already exists by email
  const { data: existingUser } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', payment.customer_email)
    .maybeSingle();

  if (existingUser) {
    // Update existing user's plan
    await supabase
      .from('profiles')
      .update({
        plan_end_date: planEndDate.toISOString().split('T')[0],
        is_active: true,
      })
      .eq('id', existingUser.id);

    // Link payment to user
    await supabase
      .from('payments')
      .update({ client_id: existingUser.id })
      .eq('id', payment.id);

    console.log('Updated existing user:', existingUser.id);
    return;
  }

  // Generate random password
  const password = generatePassword();

  // Create new auth user
  const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
    email: payment.customer_email,
    password: password,
    email_confirm: true,
    user_metadata: {
      full_name: payment.customer_name,
    },
  });

  if (authError) {
    console.error('Error creating auth user:', authError);
    return;
  }

  // Create profile
  const { error: profileError } = await supabase
    .from('profiles')
    .insert({
      id: authUser.user.id,
      role: 'client',
      full_name: payment.customer_name,
      email: payment.customer_email,
      phone: payment.customer_phone,
      plan_start_date: today.toISOString().split('T')[0],
      plan_end_date: planEndDate.toISOString().split('T')[0],
      is_active: true,
    });

  if (profileError) {
    console.error('Error creating profile:', profileError);
    return;
  }

  // Update payment with client_id
  await supabase
    .from('payments')
    .update({ client_id: authUser.user.id })
    .eq('id', payment.id);

  console.log('Created new user:', authUser.user.id);

  // Send welcome email with credentials
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
    console.log('Welcome email sent');
  } catch (emailError) {
    console.error('Error sending welcome email:', emailError);
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
