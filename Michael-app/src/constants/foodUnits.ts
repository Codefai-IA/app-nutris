import type { UnitType } from '../types/database';

export const UNIT_TYPES: Record<UnitType, { singular: string; plural: string; label: string }> = {
  gramas: { singular: 'g', plural: 'g', label: 'Gramas' },
  ml: { singular: 'ml', plural: 'ml', label: 'Mililitros' },
  unidade: { singular: 'unidade', plural: 'unidades', label: 'Unidade' },
  fatia: { singular: 'fatia', plural: 'fatias', label: 'Fatia' },
  colher_sopa: { singular: 'colher de sopa', plural: 'colheres de sopa', label: 'Colher de Sopa' },
  colher_cha: { singular: 'colher de cha', plural: 'colheres de cha', label: 'Colher de Cha' },
  xicara: { singular: 'xicara', plural: 'xicaras', label: 'Xicara' },
  copo: { singular: 'copo', plural: 'copos', label: 'Copo' },
  porcao: { singular: 'porcao', plural: 'porcoes', label: 'Porcao' },
};

export const UNIT_OPTIONS: { value: UnitType; label: string }[] = [
  { value: 'gramas', label: 'Gramas (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'unidade', label: 'Unidade' },
  { value: 'fatia', label: 'Fatia' },
  { value: 'colher_sopa', label: 'Colher de Sopa' },
  { value: 'colher_cha', label: 'Colher de Cha' },
  { value: 'xicara', label: 'Xicara' },
  { value: 'copo', label: 'Copo' },
  { value: 'porcao', label: 'Porcao' },
];
