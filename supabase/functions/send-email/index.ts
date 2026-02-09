import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WelcomeEmailData {
  name: string;
  email: string;
  password: string;
  planName: string;
  planEndDate: string;
}

interface EmailRequest {
  type: 'welcome' | 'renewal' | 'expiring';
  to: string;
  data: WelcomeEmailData;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: EmailRequest = await req.json();
    const { type, to, data } = body;

    let subject: string;
    let html: string;

    switch (type) {
      case 'welcome':
        subject = 'Bem-vindo! Suas credenciais de acesso';
        html = getWelcomeEmailHtml(data);
        break;
      case 'renewal':
        subject = 'Plano renovado com sucesso!';
        html = getRenewalEmailHtml(data);
        break;
      case 'expiring':
        subject = 'Seu plano esta expirando';
        html = getExpiringEmailHtml(data);
        break;
      default:
        return new Response(
          JSON.stringify({ error: 'Tipo de email invalido' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    // Send email via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: 'Nutri App <noreply@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Resend error:', result);
      return new Response(
        JSON.stringify({ error: 'Erro ao enviar email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Email sent:', result.id);

    return new Response(
      JSON.stringify({ success: true, id: result.id }),
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

function getWelcomeEmailHtml(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: linear-gradient(135deg, #1c4c9b, #263066); border-radius: 16px; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 24px; font-weight: bold;">N</span>
              </div>

              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #080d15;">
                Bem-vindo, ${data.name}!
              </h1>

              <p style="margin: 0 0 32px; font-size: 16px; color: #4a5568; line-height: 1.6;">
                Seu pagamento foi confirmado e seu acesso ao plano <strong>${data.planName}</strong> esta liberado.
              </p>

              <div style="background-color: #f5f7fa; border-radius: 12px; padding: 24px; margin-bottom: 32px; text-align: left;">
                <p style="margin: 0 0 16px; font-size: 14px; font-weight: 600; color: #080d15;">
                  Suas credenciais de acesso:
                </p>

                <p style="margin: 0 0 12px; font-size: 14px; color: #4a5568;">
                  <strong>Email:</strong><br>
                  <span style="color: #1c4c9b;">${data.email}</span>
                </p>

                <p style="margin: 0; font-size: 14px; color: #4a5568;">
                  <strong>Senha:</strong><br>
                  <code style="background: #e2e8f0; padding: 4px 8px; border-radius: 4px; font-family: monospace; color: #080d15;">${data.password}</code>
                </p>
              </div>

              <p style="margin: 0 0 16px; font-size: 14px; color: #4a5568;">
                Seu plano e valido ate <strong>${data.planEndDate}</strong>.
              </p>

              <a href="${Deno.env.get('APP_URL') || '#'}/login" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1c4c9b, #263066); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Acessar Agora
              </a>

              <p style="margin: 32px 0 0; font-size: 12px; color: #a0aec0;">
                Recomendamos que voce altere sua senha apos o primeiro acesso.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getRenewalEmailHtml(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plano Renovado</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: #dcfce7; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
                <span style="color: #15803d; font-size: 32px;">✓</span>
              </div>

              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #080d15;">
                Plano Renovado!
              </h1>

              <p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
                Ola ${data.name}, seu plano <strong>${data.planName}</strong> foi renovado com sucesso.
              </p>

              <div style="background-color: #dcfce7; border-radius: 12px; padding: 20px; margin-bottom: 32px;">
                <p style="margin: 0; font-size: 14px; color: #15803d;">
                  Seu acesso e valido ate <strong>${data.planEndDate}</strong>
                </p>
              </div>

              <a href="${Deno.env.get('APP_URL') || '#'}/app" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #1c4c9b, #263066); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Continuar Acessando
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

function getExpiringEmailHtml(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Plano Expirando</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f7fa;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" width="100%" style="max-width: 480px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 32px; text-align: center;">
              <div style="width: 64px; height: 64px; background: #fef3c7; border-radius: 50%; margin: 0 auto 24px; display: flex; align-items: center; justify-content: center;">
                <span style="color: #d97706; font-size: 32px;">⚠</span>
              </div>

              <h1 style="margin: 0 0 16px; font-size: 24px; font-weight: 700; color: #080d15;">
                Seu plano esta expirando
              </h1>

              <p style="margin: 0 0 24px; font-size: 16px; color: #4a5568; line-height: 1.6;">
                Ola ${data.name}, seu plano <strong>${data.planName}</strong> expira em <strong>${data.planEndDate}</strong>.
              </p>

              <p style="margin: 0 0 32px; font-size: 14px; color: #4a5568; line-height: 1.6;">
                Renove agora para continuar tendo acesso a todas as funcionalidades do app.
              </p>

              <a href="${Deno.env.get('APP_URL') || '#'}/app" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f3985b, #e07d3a); color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Renovar Plano
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
