import { useEffect, useState, useRef, useCallback } from 'react';

interface UsePageDataOptions {
  userId: string | undefined;
  fetchData: () => Promise<void>;
  dependencies?: unknown[];
}

/**
 * Hook robusto para carregar dados com suporte a:
 * - Refetch automático quando app volta ao foco (visibilitychange)
 * - Proteção contra múltiplos fetches simultâneos
 * - Recovery quando dados são perdidos
 */
export function usePageData({ userId, fetchData, dependencies = [] }: UsePageDataOptions) {
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  // Refs para valores atuais (evita closures stale)
  const fetchDataRef = useRef(fetchData);
  const userIdRef = useRef(userId);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);
  const lastFetchTimeRef = useRef(0);

  // Sempre atualiza as refs (sync, sem effect)
  fetchDataRef.current = fetchData;
  userIdRef.current = userId;

  // Função de fetch centralizada com proteção contra múltiplas chamadas
  const doFetch = useCallback(async (isRefetch = false) => {
    const uid = userIdRef.current;
    if (!uid) {
      console.log('[usePageData] Sem userId, aguardando...');
      return;
    }

    // Evitar múltiplos fetches simultâneos
    if (isFetchingRef.current) {
      console.log('[usePageData] Fetch já em andamento, ignorando...');
      return;
    }

    // Debounce: evitar refetch se o último foi há menos de 500ms
    const now = Date.now();
    if (isRefetch && now - lastFetchTimeRef.current < 500) {
      console.log('[usePageData] Debounce ativo, ignorando refetch');
      return;
    }

    isFetchingRef.current = true;
    lastFetchTimeRef.current = now;

    console.log(`[usePageData] Iniciando ${isRefetch ? 'refetch' : 'fetch'}...`);

    try {
      await fetchDataRef.current();
      if (mountedRef.current) {
        console.log('[usePageData] Fetch completou com sucesso');
        setIsInitialLoading(false);
      }
    } catch (err) {
      console.error('[usePageData] Erro no fetch:', err);
      if (mountedRef.current) {
        setIsInitialLoading(false);
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // Effect principal - roda quando userId ou dependencies mudam
  useEffect(() => {
    mountedRef.current = true;

    // Reset loading quando userId muda (novo usuário logou)
    if (userId) {
      setIsInitialLoading(true);
      doFetch(false);
    }

    return () => {
      mountedRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ...dependencies]);

  // Listener de visibilidade - refetch quando app volta ao foco
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!userIdRef.current) return;

      console.log('[usePageData] App voltou ao foco - executando refetch');

      // Pequeno delay para garantir que a conexão está estabilizada
      setTimeout(() => {
        if (mountedRef.current && userIdRef.current) {
          doFetch(true);
        }
      }, 100);
    };

    // Também refetch quando a janela ganha foco (cobre mais casos)
    const onFocus = () => {
      if (!userIdRef.current) return;
      console.log('[usePageData] Janela ganhou foco - executando refetch');

      setTimeout(() => {
        if (mountedRef.current && userIdRef.current) {
          doFetch(true);
        }
      }, 100);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, [doFetch]);

  return {
    isInitialLoading,
    refetch: useCallback(async () => {
      await doFetch(true);
    }, [doFetch]),
  };
}
