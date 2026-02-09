-- ============================================
-- CRIAR USUARIOS
-- Execute cada bloco separadamente
-- ============================================

-- 1. Primeiro rode isso para ver a estrutura da tabela
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'auth' AND table_name = 'users';
