import { useState } from 'react';
import { Plus, X, Search, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { parseBrazilianNumber } from './FoodSelect';
import { formatFoodName } from '../../utils/formatters';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import type { TabelaTaco, UnitType } from '../../types/database';
import styles from './AddExtraMealModal.module.css';

const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: 'gramas', label: 'Gramas (g)' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'fatia', label: 'Fatia' },
];

interface ExtraFood {
  id: string;
  name: string;
  quantity: number; // Always in grams for calculations
  quantity_units: number | null; // Unit quantity if using units
  unit_type: UnitType;
  peso_por_unidade: number | null;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  // Store per 100g values for display when using units
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fats_100g: number;
}

export interface ExtraMeal {
  id: string;
  meal_name: string;
  foods: ExtraFood[];
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fats: number;
}

interface AddExtraMealModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (meal: ExtraMeal) => void;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/,/g, ' ')
    .trim();
}

export function AddExtraMealModal({ isOpen, onClose, onAdd }: AddExtraMealModalProps) {
  const [mealName, setMealName] = useState('');
  const [foods, setFoods] = useState<ExtraFood[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<TabelaTaco[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFood, setSelectedFood] = useState<TabelaTaco | null>(null);
  const [quantity, setQuantity] = useState('100');
  const [unitType, setUnitType] = useState<UnitType>('gramas');
  const [pesoPorUnidade, setPesoPorUnidade] = useState<number | null>(null);
  const searchFoods = async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }

    setLoading(true);

    try {
      // Busca direta no servidor com filtro ilike para encontrar todos os alimentos
      const { data, error } = await supabase
        .from('tabela_taco')
        .select('*')
        .ilike('alimento', `%${term}%`)
        .order('alimento', { ascending: true })
        .limit(30);

      if (error) {
        console.error('Erro ao buscar alimentos:', error);
        setLoading(false);
        return;
      }

      if (data) {
        // Ordena para priorizar alimentos que comecam com o termo buscado
        const normalizedTerm = normalizeText(term);
        const sorted = [...data].sort((a, b) => {
          const aName = normalizeText(a.alimento);
          const bName = normalizeText(b.alimento);
          const aStartsWith = aName.startsWith(normalizedTerm);
          const bStartsWith = bName.startsWith(normalizedTerm);
          if (aStartsWith && !bStartsWith) return -1;
          if (!aStartsWith && bStartsWith) return 1;
          return aName.localeCompare(bName);
        });

        setSearchResults(sorted);
      }
    } catch (err) {
      console.error('Erro ao buscar alimentos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const term = e.target.value;
    setSearchTerm(term);
    setSelectedFood(null);
    searchFoods(term);
  };

  const handleSelectFood = async (food: TabelaTaco) => {
    setSelectedFood(food);
    setSearchTerm(food.alimento);
    setSearchResults([]);
    setUnitType('gramas');
    setQuantity('100');
    setPesoPorUnidade(null);

    // Fetch food_metadata to get peso_por_unidade
    try {
      const { data: metadata } = await supabase
        .from('food_metadata')
        .select('peso_por_unidade')
        .eq('food_name', food.alimento)
        .maybeSingle();

      if (metadata?.peso_por_unidade) {
        setPesoPorUnidade(metadata.peso_por_unidade);
      }
    } catch (err) {
      console.error('Error fetching food metadata:', err);
    }
  };

  const handleUnitTypeChange = (newUnitType: UnitType) => {
    if (newUnitType === 'gramas') {
      // Switching to grams - if we had units, convert
      if (unitType !== 'gramas' && pesoPorUnidade) {
        const unitQty = parseFloat(quantity) || 1;
        const grams = unitQty * pesoPorUnidade;
        setQuantity(String(Math.round(grams)));
      }
    } else {
      // Switching to units - start with 1
      if (unitType === 'gramas') {
        setQuantity('1');
      }
    }
    setUnitType(newUnitType);
  };

  const getGramEquivalent = (): number | null => {
    if (unitType === 'gramas') return null;
    if (!pesoPorUnidade) return null;
    const unitQty = parseFloat(quantity) || 0;
    return Math.round(unitQty * pesoPorUnidade);
  };

  const getUnitLabel = (type: UnitType): string => {
    switch (type) {
      case 'fatia': return 'fatia(s)';
      case 'unidade': return 'unidade(s)';
      default: return 'g';
    }
  };

  const addFoodToMeal = () => {
    if (!selectedFood) return;

    const inputQty = parseFloat(quantity) || (unitType === 'gramas' ? 100 : 1);

    // Calculate grams for macro calculation
    let gramsForCalc: number;
    let quantityUnits: number | null = null;

    if (unitType === 'gramas') {
      gramsForCalc = inputQty;
    } else if (pesoPorUnidade) {
      // Using units with known peso_por_unidade
      quantityUnits = inputQty;
      gramsForCalc = inputQty * pesoPorUnidade;
    } else {
      // No peso_por_unidade - treat as 100g per unit
      quantityUnits = inputQty;
      gramsForCalc = inputQty * 100;
    }

    const multiplier = gramsForCalc / 100;

    // Store per 100g values
    const calories100g = Math.round(parseBrazilianNumber(selectedFood.caloria));
    const protein100g = Math.round(parseBrazilianNumber(selectedFood.proteina) * 10) / 10;
    const carbs100g = Math.round(parseBrazilianNumber(selectedFood.carboidrato) * 10) / 10;
    const fats100g = Math.round(parseBrazilianNumber(selectedFood.gordura) * 10) / 10;

    const newFood: ExtraFood = {
      id: crypto.randomUUID(),
      name: formatFoodName(selectedFood.alimento),
      quantity: gramsForCalc, // Always store grams for totals
      quantity_units: quantityUnits,
      unit_type: unitType,
      peso_por_unidade: pesoPorUnidade,
      // Calculated values for this quantity
      calories: Math.round(calories100g * multiplier),
      protein: Math.round(protein100g * multiplier * 10) / 10,
      carbs: Math.round(carbs100g * multiplier * 10) / 10,
      fats: Math.round(fats100g * multiplier * 10) / 10,
      // Per 100g values for display when using units
      calories_100g: calories100g,
      protein_100g: protein100g,
      carbs_100g: carbs100g,
      fats_100g: fats100g,
    };

    setFoods([...foods, newFood]);
    setSelectedFood(null);
    setSearchTerm('');
    setQuantity('100');
    setUnitType('gramas');
    setPesoPorUnidade(null);
  };

  const removeFood = (id: string) => {
    setFoods(foods.filter(f => f.id !== id));
  };

  const mealTotals = foods.reduce(
    (acc, food) => ({
      calories: acc.calories + food.calories,
      protein: acc.protein + food.protein,
      carbs: acc.carbs + food.carbs,
      fats: acc.fats + food.fats,
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  const handleSave = () => {
    const extraMeal: ExtraMeal = {
      id: crypto.randomUUID(),
      meal_name: mealName || 'Refeicao Extra',
      foods,
      total_calories: mealTotals.calories,
      total_protein: mealTotals.protein,
      total_carbs: mealTotals.carbs,
      total_fats: mealTotals.fats,
    };

    onAdd(extraMeal);
    handleClose();
  };

  const handleClose = () => {
    setMealName('');
    setFoods([]);
    setSearchTerm('');
    setSearchResults([]);
    setSelectedFood(null);
    setQuantity('100');
    setUnitType('gramas');
    setPesoPorUnidade(null);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Adicionar Refeicao Extra">
      <div className={styles.content}>
        <Input
          label="Nome da refeicao"
          placeholder="Ex: Lanche da tarde"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
        />

        <div className={styles.searchSection}>
          <label className={styles.label}>Buscar alimento</label>
          <div className={styles.searchWrapper}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Digite para buscar..."
              value={searchTerm}
              onChange={handleInputChange}
              className={styles.searchInput}
              autoComplete="off"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setSearchResults([]);
                  setSelectedFood(null);
                }}
                className={styles.clearButton}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {loading && <div className={styles.loadingState}>Buscando...</div>}

          {!loading && searchTerm.length >= 2 && searchResults.length === 0 && !selectedFood && (
            <div className={styles.loadingState}>Nenhum alimento encontrado para "{searchTerm}"</div>
          )}

          {!loading && searchResults.length > 0 && (
            <ul className={styles.searchResults}>
              {searchResults.map((food) => (
                <li
                  key={food.id}
                  className={styles.searchItem}
                  onClick={() => handleSelectFood(food)}
                >
                  <span className={styles.foodName}>{formatFoodName(food.alimento)}</span>
                  <span className={styles.foodCal}>
                    {Math.round(parseBrazilianNumber(food.caloria))} kcal
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedFood && (
          <div className={styles.addFoodSection}>
            <div className={styles.selectedFood}>
              <span>{formatFoodName(selectedFood.alimento)}</span>
              <span className={styles.selectedNutrition}>
                {Math.round(parseBrazilianNumber(selectedFood.caloria))} kcal/100g
              </span>
            </div>
            <div className={styles.quantityRow}>
              <Input
                label={unitType === 'gramas' ? 'Quantidade (g)' : 'Quantidade'}
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className={styles.quantityInput}
              />
              <div className={styles.unitWrapper}>
                <label className={styles.unitLabel}>Unidade</label>
                <select
                  value={unitType}
                  onChange={(e) => handleUnitTypeChange(e.target.value as UnitType)}
                  className={styles.unitSelect}
                >
                  {UNIT_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <Button onClick={addFoodToMeal} className={styles.addButton}>
                <Plus size={18} />
                Adicionar
              </Button>
            </div>
            {unitType !== 'gramas' && (
              <div className={styles.unitInfo}>
                {pesoPorUnidade ? (
                  <span className={styles.gramEquivalent}>
                    = {getGramEquivalent()}g
                  </span>
                ) : (
                  <span className={styles.unitWarning}>
                    Peso por unidade nao cadastrado - usando 100g por unidade
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {foods.length > 0 && (
          <div className={styles.addedFoods}>
            <h4 className={styles.sectionTitle}>Alimentos adicionados</h4>
            <ul className={styles.foodList}>
              {foods.map((food) => {
                const isUsingUnits = food.unit_type !== 'gramas' && food.quantity_units !== null;
                const displayQty = isUsingUnits
                  ? `${food.quantity_units} ${getUnitLabel(food.unit_type)} (${Math.round(food.quantity)}g)`
                  : `${Math.round(food.quantity)}g`;

                return (
                  <li key={food.id} className={styles.foodItem}>
                    <div className={styles.foodInfo}>
                      <span className={styles.foodItemName}>{food.name}</span>
                      <span className={styles.foodItemQty}>{displayQty}</span>
                      {isUsingUnits ? (
                        <span className={styles.foodItemMacros}>
                          {food.calories_100g} kcal | P: {food.protein_100g}g | C: {food.carbs_100g}g | G: {food.fats_100g}g (por 100g)
                        </span>
                      ) : (
                        <span className={styles.foodItemMacros}>
                          {food.calories} kcal | P: {food.protein}g | C: {food.carbs}g | G: {food.fats}g
                        </span>
                      )}
                    </div>
                    <div className={styles.foodActions}>
                      <button
                        onClick={() => removeFood(food.id)}
                        className={styles.removeButton}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className={styles.totals}>
              <h4>Total da refeicao:</h4>
              <div className={styles.totalsValues}>
                <span className={styles.totalCalories}>{mealTotals.calories} kcal</span>
                <span>P: {mealTotals.protein.toFixed(1)}g</span>
                <span>C: {mealTotals.carbs.toFixed(1)}g</span>
                <span>G: {mealTotals.fats.toFixed(1)}g</span>
              </div>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={foods.length === 0}>
            Salvar Refeicao
          </Button>
        </div>
      </div>
    </Modal>
  );
}
