import type { UnitType, TabelaTacoWithMetadata } from '../types/database';
import { UNIT_TYPES } from '../constants/foodUnits';
import { formatFoodName } from './formatters';

/**
 * Calculate grams from units
 */
export function calculateGramsFromUnits(units: number, pesoPorUnidade: number): number {
  return units * pesoPorUnidade;
}

/**
 * Calculate units from grams
 */
export function calculateUnitsFromGrams(grams: number, pesoPorUnidade: number): number {
  if (pesoPorUnidade <= 0) return 0;
  return grams / pesoPorUnidade;
}

/**
 * Format quantity for display
 * Returns "2 fatias (60g)" or "100g"
 */
export function formatQuantityDisplay(
  grams: number,
  units: number | null,
  unitType: UnitType
): string {
  if (unitType === 'gramas' || units === null || units === 0) {
    return `${grams}g`;
  }

  const unitInfo = UNIT_TYPES[unitType];
  const label = units === 1 ? unitInfo.singular : unitInfo.plural;

  return `${units} ${label} (${Math.round(grams)}g)`;
}

/**
 * Get display name for a food (simplified name if available, otherwise formatted original)
 */
export function getDisplayName(food: TabelaTacoWithMetadata): string {
  if (food.food_metadata?.nome_simplificado) {
    return food.food_metadata.nome_simplificado;
  }
  return formatFoodName(food.alimento);
}

/**
 * Get unit label for display
 */
export function getUnitLabel(unitType: UnitType, quantity: number = 1): string {
  const unitInfo = UNIT_TYPES[unitType];
  return quantity === 1 ? unitInfo.singular : unitInfo.plural;
}

/**
 * Check if a food has unit support (metadata with unit defined)
 */
export function hasUnitSupport(food: TabelaTacoWithMetadata): boolean {
  return !!(
    food.food_metadata &&
    food.food_metadata.unidade_tipo !== 'gramas' &&
    food.food_metadata.peso_por_unidade &&
    food.food_metadata.peso_por_unidade > 0
  );
}
