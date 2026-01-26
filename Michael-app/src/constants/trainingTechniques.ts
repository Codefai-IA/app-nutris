export interface TrainingTechnique {
  id: string;
  name: string;
  category: 'tecnica' | 'esforco';
  description: string;
}

export const TRAINING_TECHNIQUES: TrainingTechnique[] = [
  {
    id: 'drop_sets',
    name: 'Drop Sets',
    category: 'tecnica',
    description: 'Retirar 10 a 30% da carga após realizar a série e continuar o exercício com intuito de aumentar as repetições totais até falhar.'
  },
  {
    id: 'rest_pausa',
    name: 'Rest Pausa',
    category: 'tecnica',
    description: 'Após realizar uma série descanse de 10 a 15 segundos e volte a realizar o exercício com a mesma carga.'
  },
  {
    id: 'cluster_set',
    name: 'Cluster Set',
    category: 'tecnica',
    description: 'Muito parecido com o rest pause porém aqui faremos blocos de 5 repetições com carga MÁXIMA com descanso de 10s até não sair mais 2 repetições: 5 - 10s - 5 - 10s - 5...'
  },
  {
    id: 'biset',
    name: 'Biset',
    category: 'tecnica',
    description: 'Execução de 2 exercícios um após outro.'
  },
  {
    id: 'no_stop',
    name: 'No Stop',
    category: 'tecnica',
    description: 'Realizar exercício unilateral um lado após o outro sem parar.'
  },
  {
    id: 'pico_contracao',
    name: 'Pico de Contração',
    category: 'tecnica',
    description: 'Segurar na contração máxima de 1 a 3 segundos.'
  },
  {
    id: 'piramide',
    name: 'Pirâmide',
    category: 'tecnica',
    description: 'Diminuindo as repetições aumenta a carga.'
  }
];

export const EFFORT_PARAMETERS: TrainingTechnique[] = [
  {
    id: 'aquecimento',
    name: 'Aquecimento',
    category: 'esforco',
    description: 'Realizar o exercício com 50% da carga máxima 2x 15 repetições.'
  },
  {
    id: 'serie_reconhecimento',
    name: 'Série de Reconhecimento',
    category: 'esforco',
    description: 'Realizar o exercício sem falhar, apenas progredindo cargas até a carga máxima.'
  },
  {
    id: 'serie_trabalho',
    name: 'Série de Trabalho',
    category: 'esforco',
    description: 'Realizar o exercício com carga para 1 ou 2 antes da falha com boa execução.'
  },
  {
    id: 'top_set',
    name: 'Top Set',
    category: 'esforco',
    description: 'Realizar o exercício com carga para falhar de forma perfeita o movimento, aqui fazemos progressão de carga ou reps semanal.'
  },
  {
    id: 'falha_maxima',
    name: 'Falha Máxima',
    category: 'esforco',
    description: 'Executar o exercício até não sair mais repetições perfeitas e com ajuda (se possível) fazer mais repetições forçadas além da falha.'
  }
];

// Combined for easy lookup
export const ALL_TECHNIQUES = [...TRAINING_TECHNIQUES, ...EFFORT_PARAMETERS];

// Helper to find technique by ID
export const getTechniqueById = (id: string): TrainingTechnique | undefined =>
  ALL_TECHNIQUES.find(t => t.id === id);
