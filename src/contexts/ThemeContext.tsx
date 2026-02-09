import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { AppSettings } from '../types/database';
import { DEFAULT_APP_SETTINGS } from '../types/database';

// Cache keys para localStorage
const THEME_CACHE_KEY = 'mc_theme_settings';
const THEME_CACHE_TIMESTAMP_KEY = 'mc_theme_timestamp';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutos

interface ThemeContextType {
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  refreshSettings: () => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<{ error: Error | null }>;
  uploadLogo: (file: File, type: 'main' | 'icon' | 'favicon') => Promise<{ url: string | null; error: Error | null }>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Funcoes de cache
function getCachedSettings(): AppSettings | null {
  try {
    const cached = localStorage.getItem(THEME_CACHE_KEY);
    const timestamp = localStorage.getItem(THEME_CACHE_TIMESTAMP_KEY);

    if (cached && timestamp) {
      const age = Date.now() - parseInt(timestamp);
      if (age < CACHE_DURATION_MS) {
        return JSON.parse(cached);
      }
    }
    return null;
  } catch {
    return null;
  }
}

function setCachedSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(THEME_CACHE_KEY, JSON.stringify(settings));
    localStorage.setItem(THEME_CACHE_TIMESTAMP_KEY, Date.now().toString());
  } catch {
    // Ignorar erro de localStorage
  }
}

function clearCachedSettings(): void {
  try {
    localStorage.removeItem(THEME_CACHE_KEY);
    localStorage.removeItem(THEME_CACHE_TIMESTAMP_KEY);
  } catch {
    // Ignorar erro
  }
}

// Aplicar tema ao DOM
function applyThemeToDOM(settings: AppSettings | null): void {
  const root = document.documentElement;
  const s = settings || DEFAULT_APP_SETTINGS;

  // Cores primarias
  root.style.setProperty('--primary', s.color_primary);
  root.style.setProperty('--primary-hover', s.color_primary_hover);
  root.style.setProperty('--primary-light', s.color_primary_light);

  // Cores secundarias
  root.style.setProperty('--secondary', s.color_secondary);

  // Cores de destaque
  root.style.setProperty('--accent', s.color_accent);
  root.style.setProperty('--accent-hover', s.color_accent_hover);
  root.style.setProperty('--accent-light', s.color_accent_light);

  // Cores de texto
  root.style.setProperty('--text-primary', s.color_text_primary);
  root.style.setProperty('--text-secondary', s.color_text_secondary);

  // Cores de fundo
  root.style.setProperty('--bg-main', s.color_bg_main);
  root.style.setProperty('--bg-card', s.color_bg_card);

  // Atualizar sombras baseadas nas cores
  const primaryRgb = hexToRgb(s.color_primary);
  const accentRgb = hexToRgb(s.color_accent);
  if (primaryRgb) {
    root.style.setProperty('--shadow-primary', `0 4px 14px rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`);
  }
  if (accentRgb) {
    root.style.setProperty('--shadow-accent', `0 4px 14px rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3)`);
  }

  // Atualizar meta theme-color
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.setAttribute('content', s.pwa_theme_color);
  }

  // Atualizar titulo do documento
  if (settings?.app_name) {
    document.title = settings.app_name;
  }

  // Atualizar favicon se customizado
  if (settings?.favicon_url) {
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
    if (link) {
      link.href = settings.favicon_url;
    }
  }
}

// Helper para converter hex para RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Inicializar do cache para evitar flash
  const [settings, setSettings] = useState<AppSettings | null>(() => getCachedSettings());
  const [loading, setLoading] = useState(!settings);
  const [error, setError] = useState<string | null>(null);

  // Aplicar tema imediatamente do cache
  useEffect(() => {
    if (settings) {
      applyThemeToDOM(settings);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const { data, error: fetchError } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      if (fetchError) {
        // Se tabela nao existe, usar defaults silenciosamente
        if (fetchError.code === 'PGRST116' || fetchError.message.includes('does not exist')) {
          console.log('[ThemeContext] Tabela app_settings nao existe, usando defaults');
          applyThemeToDOM(null);
          setError(null);
          return;
        }
        console.error('[ThemeContext] Erro ao buscar configuracoes:', fetchError);
        setError(fetchError.message);
        applyThemeToDOM(null);
        return;
      }

      if (data) {
        setSettings(data);
        setCachedSettings(data);
        applyThemeToDOM(data);
        setError(null);
      }
    } catch (err) {
      console.error('[ThemeContext] Erro ao buscar configuracoes:', err);
      setError('Falha ao carregar configuracoes de tema');
      applyThemeToDOM(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    clearCachedSettings();
    await fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (updates: Partial<AppSettings>): Promise<{ error: Error | null }> => {
      if (!settings) {
        return { error: new Error('Configuracoes nao carregadas') };
      }

      try {
        // Remover campos que nao podem ser atualizados via API
        const fieldsToRemove = ['id', 'created_at', 'updated_at'];
        const cleanUpdates: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(updates)) {
          if (!fieldsToRemove.includes(key)) {
            cleanUpdates[key] = value;
          }
        }

        console.log('[ThemeContext] Enviando update:', JSON.stringify(cleanUpdates, null, 2));

        const { data, error: updateError } = await supabase
          .from('app_settings')
          .update(cleanUpdates)
          .eq('id', settings.id)
          .select()
          .single();

        if (updateError) {
          console.error('[ThemeContext] Erro ao atualizar:', JSON.stringify(updateError, null, 2));
          return { error: updateError };
        }

        if (data) {
          setSettings(data);
          setCachedSettings(data);
          applyThemeToDOM(data);
        }

        return { error: null };
      } catch (err) {
        return { error: err as Error };
      }
    },
    [settings]
  );

  const uploadLogo = useCallback(
    async (
      file: File,
      type: 'main' | 'icon' | 'favicon'
    ): Promise<{ url: string | null; error: Error | null }> => {
      const extension = file.name.split('.').pop() || 'png';
      const fileName = `${type}-${Date.now()}.${extension}`;
      const filePath = `logos/${fileName}`;

      try {
        // Upload para Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('branding')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true,
          });

        if (uploadError) {
          return { url: null, error: uploadError };
        }

        // Obter URL publica
        const { data: urlData } = supabase.storage.from('branding').getPublicUrl(filePath);

        return { url: urlData.publicUrl, error: null };
      } catch (err) {
        return { url: null, error: err as Error };
      }
    },
    []
  );

  return (
    <ThemeContext.Provider
      value={{
        settings,
        loading,
        error,
        refreshSettings,
        updateSettings,
        uploadLogo,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
