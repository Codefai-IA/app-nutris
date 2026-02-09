import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://ixqrdmitrbxcbvaejagj.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4cXJkbWl0cmJ4Y2J2YWVqYWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3Njg3NjQsImV4cCI6MjA4NTM0NDc2NH0.IZG-sdeQwmvi2BIwWSXsaGHwhWI1Bj832UwQHSBhZ5c';

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
