import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './MacroPieChart.module.css';

interface MacroPieChartProps {
  protein: number;
  carbs: number;
  fats: number;
  calories?: number;
  showLegend?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const COLORS = {
  protein: '#3B82F6', // Blue
  carbs: '#F59E0B',   // Yellow/Orange
  fats: '#EF4444',    // Red/Pink
};

export function MacroPieChart({
  protein,
  carbs,
  fats,
  calories,
  showLegend = true,
  size = 'md',
}: MacroPieChartProps) {
  const total = protein + carbs + fats;

  const data = [
    {
      name: 'Proteínas',
      value: protein,
      grams: Math.round(protein * 10) / 10,
      percentage: total > 0 ? Math.round((protein / total) * 100) : 0,
      color: COLORS.protein,
    },
    {
      name: 'Carboidratos',
      value: carbs,
      grams: Math.round(carbs * 10) / 10,
      percentage: total > 0 ? Math.round((carbs / total) * 100) : 0,
      color: COLORS.carbs,
    },
    {
      name: 'Gorduras',
      value: fats,
      grams: Math.round(fats * 10) / 10,
      percentage: total > 0 ? Math.round((fats / total) * 100) : 0,
      color: COLORS.fats,
    },
  ];

  // Dimensões baseadas no tamanho
  const dimensions = {
    sm: { height: 180, innerRadius: 30, outerRadius: 55 },
    md: { height: 220, innerRadius: 40, outerRadius: 70 },
    lg: { height: 280, innerRadius: 50, outerRadius: 90 },
  };

  const { height, innerRadius, outerRadius } = dimensions[size];

  // Não renderiza se não houver dados
  if (total === 0) {
    return (
      <div className={styles.emptyState}>
        <p>Sem dados nutricionais</p>
      </div>
    );
  }

  const renderCustomizedLabel = (props: {
    cx?: number;
    cy?: number;
    midAngle?: number;
    innerRadius?: number;
    outerRadius?: number;
    percent?: number;
  }) => {
    const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
    const percentage = Math.round(percent * 100);
    if (percentage < 5) return null; // Não mostra label se for muito pequeno

    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={12}
        fontWeight="bold"
      >
        {`${percentage}%`}
      </text>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.chartWrapper} style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={innerRadius}
              outerRadius={outerRadius}
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
              label={renderCustomizedLabel}
              animationBegin={0}
              animationDuration={800}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const item = payload[0].payload;
                  return (
                    <div className={styles.tooltip}>
                      <span style={{ color: item.color }}>{item.name}</span>
                      <span>{item.grams}g ({item.percentage}%)</span>
                    </div>
                  );
                }
                return null;
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* Centro do donut com calorias */}
        {calories !== undefined && (
          <div className={styles.centerLabel}>
            <span className={styles.caloriesValue}>{Math.round(calories)}</span>
            <span className={styles.caloriesUnit}>kcal</span>
          </div>
        )}
      </div>

      {showLegend && (
        <div className={styles.legend}>
          {data.map((item) => (
            <div key={item.name} className={styles.legendItem}>
              <span
                className={styles.legendColor}
                style={{ backgroundColor: item.color }}
              />
              <span className={styles.legendLabel}>{item.name}</span>
              <span className={styles.legendValue}>
                {item.grams}g ({item.percentage}%)
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
