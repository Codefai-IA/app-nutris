/**
 * Formata nomes de alimentos da tabela TACO para exibição
 * Remove vírgulas, ajusta espaços e aplica capitalização correta
 *
 * Exemplos:
 * "Arroz, tipo 2, cru" → "Arroz Tipo 2 Cru"
 * "Cuscuz,de,ovo" → "Cuscuz de Ovo"
 * "Frango, peito, sem pele, grelhado" → "Frango Peito sem Pele Grelhado"
 */
export function formatFoodName(name: string | null | undefined): string {
  if (!name) return '';

  // Palavras que devem ficar em minúsculo (exceto no início)
  const smallWords = ['de', 'da', 'do', 'das', 'dos', 'com', 'sem', 'e', 'em', 'para', 'por', 'ao', 'a', 'o'];

  // Remove vírgulas e espaços extras
  let formatted = name
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Aplica capitalização
  formatted = formatted
    .toLowerCase()
    .split(' ')
    .map((word, index) => {
      // Sempre capitaliza a primeira palavra
      // Outras palavras: capitaliza se não for uma palavra pequena
      if (index === 0 || !smallWords.includes(word)) {
        return word.charAt(0).toUpperCase() + word.slice(1);
      }
      return word;
    })
    .join(' ');

  return formatted;
}
