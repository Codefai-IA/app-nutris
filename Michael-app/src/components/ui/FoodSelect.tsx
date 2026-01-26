import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { Search, X, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { TabelaTacoWithMetadata } from '../../types/database';
import { getDisplayName, hasUnitSupport } from '../../utils/foodUnits';
import { UNIT_TYPES } from '../../constants/foodUnits';
import styles from './FoodSelect.module.css';

// Helper para converter números no formato brasileiro (vírgula como decimal)
export function parseBrazilianNumber(value: string | number | null | undefined): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;

  // Substitui vírgula por ponto e faz o parse
  const normalized = value.toString().replace(',', '.');
  const parsed = parseFloat(normalized);

  return isNaN(parsed) ? 0 : parsed;
}

// Normaliza texto removendo acentos e convertendo para minúsculas
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/,/g, ' ') // Substitui vírgulas por espaços
    .trim();
}

interface FoodSelectProps {
  value: string;
  onChange: (foodName: string) => void;
  onFoodSelect?: (food: TabelaTacoWithMetadata) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function FoodSelect({
  value,
  onChange,
  onFoodSelect,
  placeholder = 'Buscar alimento...',
  disabled = false,
}: FoodSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [foods, setFoods] = useState<TabelaTacoWithMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<TabelaTacoWithMetadata | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setSearchTerm(value);
    if (!value) {
      setSelectedFood(null);
    }
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchFoods = async () => {
      if (searchTerm.length < 2) {
        setFoods([]);
        return;
      }

      setLoading(true);

      const searchTermClean = searchTerm.trim();

      // Busca em paralelo: pelo nome original (alimento) e pelo nome simplificado
      const [resultByAlimento, resultBySimplified] = await Promise.all([
        // Query 1: Busca pelo nome original na tabela_taco
        supabase
          .from('tabela_taco')
          .select(`
            *,
            food_metadata (
              id,
              taco_id,
              nome_simplificado,
              unidade_tipo,
              peso_por_unidade,
              created_at,
              updated_at
            )
          `)
          .ilike('alimento', `%${searchTermClean}%`)
          .limit(30),

        // Query 2: Busca pelo nome simplificado na food_metadata
        supabase
          .from('food_metadata')
          .select('taco_id')
          .ilike('nome_simplificado', `%${searchTermClean}%`)
          .limit(30)
      ]);

      // Coleta IDs encontrados pelo nome simplificado
      const simplifiedTacoIds = (resultBySimplified.data || [])
        .map(item => item.taco_id)
        .filter((id): id is number => id !== null);

      // Se houver IDs do nome simplificado, busca os dados completos
      let dataBySimplified: TabelaTacoWithMetadata[] = [];
      if (simplifiedTacoIds.length > 0) {
        const { data: tacoData } = await supabase
          .from('tabela_taco')
          .select(`
            *,
            food_metadata (
              id,
              taco_id,
              nome_simplificado,
              unidade_tipo,
              peso_por_unidade,
              created_at,
              updated_at
            )
          `)
          .in('id', simplifiedTacoIds);

        dataBySimplified = (tacoData || []) as TabelaTacoWithMetadata[];
      }

      setLoading(false);

      if (resultByAlimento.error) {
        console.error('Erro ao buscar alimentos:', resultByAlimento.error);
      }

      // Combina resultados removendo duplicatas
      const dataByAlimento = (resultByAlimento.data || []) as TabelaTacoWithMetadata[];
      const seenIds = new Set<number>();
      const combinedData: TabelaTacoWithMetadata[] = [];

      // Adiciona resultados do nome simplificado primeiro (prioridade)
      for (const food of dataBySimplified) {
        if (!seenIds.has(food.id)) {
          seenIds.add(food.id);
          combinedData.push(food);
        }
      }

      // Adiciona resultados do nome original
      for (const food of dataByAlimento) {
        if (!seenIds.has(food.id)) {
          seenIds.add(food.id);
          combinedData.push(food);
        }
      }

      if (combinedData.length === 0) {
        setFoods([]);
        return;
      }

      // Ordena por relevância localmente
      const normalizedSearch = normalizeText(searchTermClean);
      const firstWord = normalizedSearch.split(/\s+/)[0] || '';

      combinedData.sort((a, b) => {
        const aSimplified = a.food_metadata?.nome_simplificado
          ? normalizeText(a.food_metadata.nome_simplificado)
          : '';
        const bSimplified = b.food_metadata?.nome_simplificado
          ? normalizeText(b.food_metadata.nome_simplificado)
          : '';
        const aOriginal = normalizeText(a.alimento);
        const bOriginal = normalizeText(b.alimento);

        // Prioriza nome simplificado que comeca com a busca
        const aSimplifiedStarts = aSimplified.startsWith(firstWord);
        const bSimplifiedStarts = bSimplified.startsWith(firstWord);
        if (aSimplifiedStarts && !bSimplifiedStarts) return -1;
        if (!aSimplifiedStarts && bSimplifiedStarts) return 1;

        // Depois prioriza nome original que comeca com a busca
        const aOriginalStarts = aOriginal.startsWith(firstWord);
        const bOriginalStarts = bOriginal.startsWith(firstWord);
        if (aOriginalStarts && !bOriginalStarts) return -1;
        if (!aOriginalStarts && bOriginalStarts) return 1;

        // Ordena alfabeticamente pelo nome de exibicao
        const aDisplay = aSimplified || aOriginal;
        const bDisplay = bSimplified || bOriginal;
        return aDisplay.localeCompare(bDisplay);
      });

      // Limita a 30 resultados
      setFoods(combinedData.slice(0, 30));
      setHighlightedIndex(0);
    };

    const debounceTimer = setTimeout(searchFoods, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    if (listRef.current && foods.length > 0) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, foods.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    onChange(newValue);
    setSelectedFood(null);
    setIsOpen(true);
  };

  const handleFoodSelect = (food: TabelaTacoWithMetadata) => {
    setSelectedFood(food);
    const displayName = getDisplayName(food);
    setSearchTerm(displayName);
    onChange(food.alimento); // Always use original name for database
    onFoodSelect?.(food);
    setIsOpen(false);
  };

  const handleClear = () => {
    setSelectedFood(null);
    setSearchTerm('');
    onChange('');
    setFoods([]);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || foods.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < foods.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (foods[highlightedIndex]) {
          handleFoodSelect(foods[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  const formatCalories = (cal: string) => {
    const num = parseBrazilianNumber(cal);
    return num === 0 ? cal : `${Math.round(num)} kcal`;
  };

  const formatNutrient = (value: string) => {
    const num = parseBrazilianNumber(value);
    return num.toFixed(1);
  };

  const highlightMatch = (text: string, search: string) => {
    if (!search || search.length < 2) return text;

    const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className={styles.highlight}>
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={`${styles.inputWrapper} ${selectedFood ? styles.hasSelection : ''}`}>
        <Search size={18} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => searchTerm.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className={styles.input}
          autoComplete="off"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClear}
            className={styles.clearButton}
            aria-label="Limpar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {selectedFood && (
        <div className={styles.selectedInfo}>
          <Check size={14} className={styles.checkIcon} />
          <span className={styles.nutritionInfo}>
            {formatCalories(selectedFood.caloria)} | P: {formatNutrient(selectedFood.proteina)}g | C: {formatNutrient(selectedFood.carboidrato)}g | G: {formatNutrient(selectedFood.gordura)}g
          </span>
        </div>
      )}

      {isOpen && (
        <div className={styles.dropdown}>
          {loading && (
            <div className={styles.loadingState}>Buscando alimentos...</div>
          )}

          {!loading && searchTerm.length >= 2 && foods.length === 0 && (
            <div className={styles.emptyState}>Nenhum alimento encontrado</div>
          )}

          {!loading && searchTerm.length < 2 && (
            <div className={styles.hintState}>Digite pelo menos 2 caracteres para buscar</div>
          )}

          {!loading && foods.length > 0 && (
            <ul className={styles.foodList} ref={listRef}>
              {foods.map((food, index) => {
                const displayName = getDisplayName(food);
                const showOriginal = food.food_metadata?.nome_simplificado &&
                  food.food_metadata.nome_simplificado !== food.alimento;
                const unitType = food.food_metadata?.unidade_tipo;
                const unitInfo = hasUnitSupport(food) && unitType && UNIT_TYPES[unitType]
                  ? `${food.food_metadata!.peso_por_unidade}g/${UNIT_TYPES[unitType].singular}`
                  : null;

                return (
                  <li
                    key={food.id}
                    className={`${styles.foodItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
                    onClick={() => handleFoodSelect(food)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <div className={styles.foodNameWrapper}>
                      <span className={styles.foodName}>
                        {highlightMatch(displayName, searchTerm)}
                      </span>
                      {showOriginal && (
                        <span className={styles.foodOriginal}>
                          {food.alimento}
                        </span>
                      )}
                    </div>
                    <div className={styles.foodMeta}>
                      {unitInfo && (
                        <span className={styles.foodUnit}>{unitInfo}</span>
                      )}
                      <span className={styles.foodCalories}>
                        {formatCalories(food.caloria)}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
