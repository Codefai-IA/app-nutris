import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nibzlpxnwzufowssyaso.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pYnpscHhud3p1Zm93c3N5YXNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1NTk3ODUsImV4cCI6MjA4MDEzNTc4NX0.-hPVsLH5t_edtIDillcE7XXYq9RU0khwe3LMj0cuHvk';

// Custom fetch com timeout de 30 segundos
const fetchWithTimeout = (url: RequestInfo | URL, options?: RequestInit) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[Supabase] Fetch timeout - abortando requisição');
    controller.abort();
  }, 30000);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: fetchWithTimeout,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
