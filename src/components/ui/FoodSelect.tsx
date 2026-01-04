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

      // OTIMIZADO: Filtra diretamente no servidor com ilike, limitando a 30 resultados
      const { data, error } = await supabase
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
        .order('alimento', { ascending: true })
        .limit(30);

      setLoading(false);

      if (error) {
        console.error('Erro ao buscar alimentos:', error);
        setFoods([]);
        return;
      }

      if (!data || data.length === 0) {
        setFoods([]);
        return;
      }

      // Ordena por relevância localmente (operação leve com apenas 30 itens)
      const normalizedSearch = normalizeText(searchTermClean);
      const firstWord = normalizedSearch.split(/\s+/)[0] || '';

      data.sort((a, b) => {
        const aSimplified = a.food_metadata?.nome_simplificado
          ? normalizeText(a.food_metadata.nome_simplificado)
          : '';
        const bSimplified = b.food_metadata?.nome_simplificado
          ? normalizeText(b.food_metadata.nome_simplificado)
          : '';
        const aOriginal = normalizeText(a.alimento);
        const bOriginal = normalizeText(b.alimento);

        // Prioriza nome que comeca com a busca
        const aStarts = aSimplified.startsWith(firstWord) || aOriginal.startsWith(firstWord);
        const bStarts = bSimplified.startsWith(firstWord) || bOriginal.startsWith(firstWord);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        // Ordena alfabeticamente
        const aDisplay = aSimplified || aOriginal;
        const bDisplay = bSimplified || bOriginal;
        return aDisplay.localeCompare(bDisplay);
      });

      setFoods(data);
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
