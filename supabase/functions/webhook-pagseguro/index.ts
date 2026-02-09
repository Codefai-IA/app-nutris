import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    console.log('PagSeguro Webhook received:', JSON.stringify(body));

    // PagSeguro sends order or charge notifications
    const orderId = body.id;
    const charges = body.charges || [];

    if (!orderId) {
      return new Response('OK', { status: 200 });
    }

    // Find payment in our database
    const { data: dbPayment, error: paymentError } = await supabase
      .from('payments')
      .select('*')
      .eq('gateway_payment_id', orderId)
      .eq('gateway', 'pagseguro')
      .maybeSingle();

    if (paymentError || !dbPayment) {
      console.log('Payment not found:', orderId);
      return new Response('OK', { status: 200 });
    }

    // Check charge status
    let newStatus = dbPayment.status;
    for (const charge of charges) {
      if (charge.status === 'PAID') {
        newStatus = 'approved';
        break;
      } else if (charge.status === 'DECLINED' || charge.status === 'CANCELED') {
        newStatus = 'rejected';
      }
    }

    // Also check PIX and Boleto status
    if (body.qr_codes?.[0]?.status === 'PAID') {
      newStatus = 'approved';
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
