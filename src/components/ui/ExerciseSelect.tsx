import { useState, useEffect, useRef, type KeyboardEvent } from 'react';
import { Search, X, Play, ExternalLink } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ExerciseLibrary } from '../../types/database';
import styles from './ExerciseSelect.module.css';

// Helper para extrair thumbnail do YouTube
export function getYouTubeThumbnail(url: string): string {
  let videoId = '';

  if (url.includes('youtube.com/watch')) {
    videoId = new URL(url).searchParams.get('v') || '';
  } else if (url.includes('youtu.be/')) {
    videoId = url.split('youtu.be/')[1]?.split('?')[0] || '';
  } else if (url.includes('youtube.com/embed/')) {
    videoId = url.split('youtube.com/embed/')[1]?.split('?')[0] || '';
  }

  if (videoId) {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }

  return '';
}

// Verifica se é URL do YouTube
function isYouTubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be');
}

// Normaliza texto removendo acentos e convertendo para minúsculas
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

interface ExerciseSelectProps {
  value: string;
  videoUrl: string | null;
  onChange: (name: string, videoUrl: string | null, exerciseId?: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ExerciseSelect({
  value,
  videoUrl,
  onChange,
  placeholder = 'Buscar exercício...',
  disabled = false,
}: ExerciseSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [exercises, setExercises] = useState<ExerciseLibrary[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<ExerciseLibrary | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    // Only sync from parent if dropdown is closed (prevents search on selection)
    if (!isOpen) {
      setSearchTerm(value);
      if (!value) {
        setSelectedExercise(null);
      }
    }
  }, [value, isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setLoading(false);  // Reset loading when clicking outside
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchExercises = async () => {
      if (searchTerm.length < 2) {
        setExercises([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const normalizedSearchTerm = normalizeText(searchTerm);
        const searchWords = normalizedSearchTerm.split(/\s+/).filter(w => w.length > 0);

        const { data, error } = await supabase
          .from('exercise_library')
          .select('*')
          .order('name', { ascending: true });

        if (error) {
          console.error('Erro ao buscar exercícios:', error);
          setExercises([]);
        } else if (data) {
          const filteredExercises = data.filter(exercise => {
            const normalizedName = normalizeText(exercise.name);
            return searchWords.every(word => normalizedName.includes(word));
          });

          filteredExercises.sort((a, b) => {
            const aName = normalizeText(a.name);
            const bName = normalizeText(b.name);
            const firstWord = searchWords[0] || '';

            const aStartsWith = aName.startsWith(firstWord);
            const bStartsWith = bName.startsWith(firstWord);

            if (aStartsWith && !bStartsWith) return -1;
            if (!aStartsWith && bStartsWith) return 1;
            return aName.localeCompare(bName);
          });

          setExercises(filteredExercises.slice(0, 30));
          setHighlightedIndex(0);
        }
      } finally {
        setLoading(false);
      }
    };

    const debounceTimer = setTimeout(searchExercises, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchTerm]);

  useEffect(() => {
    if (listRef.current && exercises.length > 0) {
      const highlightedElement = listRef.current.children[highlightedIndex] as HTMLElement;
      if (highlightedElement) {
        highlightedElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, exercises.length]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearchTerm(newValue);
    onChange(newValue, null);
    setSelectedExercise(null);
    setIsOpen(true);
  };

  const handleExerciseSelect = (exercise: ExerciseLibrary) => {
    setSelectedExercise(exercise);
    setSearchTerm(exercise.name);
    onChange(exercise.name, exercise.video_url, exercise.id);
    setIsOpen(false);
    setLoading(false);  // Reset loading state after selection
    setExercises([]);   // Clear search results
  };

  const handleClear = () => {
    setSelectedExercise(null);
    setSearchTerm('');
    onChange('', null);
    setExercises([]);
    setLoading(false);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || exercises.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < exercises.length - 1 ? prev + 1 : prev));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (exercises[highlightedIndex]) {
          handleExerciseSelect(exercises[highlightedIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setLoading(false);
        break;
    }
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

  const currentVideoUrl = videoUrl || selectedExercise?.video_url;

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <div className={`${styles.inputWrapper} ${selectedExercise ? styles.hasSelection : ''}`}>
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

      {/* Video Preview */}
      {currentVideoUrl && (
        <div className={styles.videoPreview}>
          {isYouTubeUrl(currentVideoUrl) ? (
            <div className={styles.youtubePreview}>
              {getYouTubeThumbnail(currentVideoUrl) && (
                <img
                  src={getYouTubeThumbnail(currentVideoUrl)}
                  alt="Preview do vídeo"
                  className={styles.thumbnail}
                />
              )}
              <a
                href={currentVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.videoLink}
              >
                <Play size={14} />
                Assistir vídeo
              </a>
            </div>
          ) : (
            <a
              href={currentVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.externalLink}
            >
              <ExternalLink size={14} />
              Ver demonstração
            </a>
          )}
        </div>
      )}

      {isOpen && (
        <div className={styles.dropdown}>
          {loading && (
            <div className={styles.loadingState}>Buscando exercícios...</div>
          )}

          {!loading && searchTerm.length >= 2 && exercises.length === 0 && (
            <div className={styles.emptyState}>Nenhum exercício encontrado</div>
          )}

          {!loading && searchTerm.length < 2 && (
            <div className={styles.hintState}>Digite pelo menos 2 caracteres para buscar</div>
          )}

          {!loading && exercises.length > 0 && (
            <ul className={styles.exerciseList} ref={listRef}>
              {exercises.map((exercise, index) => (
                <li
                  key={exercise.id}
                  className={`${styles.exerciseItem} ${index === highlightedIndex ? styles.highlighted : ''}`}
                  onClick={() => handleExerciseSelect(exercise)}
                  onMouseEnter={() => setHighlightedIndex(index)}
                >
                  <div className={styles.exerciseInfo}>
                    <span className={styles.exerciseName}>
                      {highlightMatch(exercise.name, searchTerm)}
                    </span>
                    {exercise.muscle_group && (
                      <span className={styles.muscleTag}>
                        {exercise.muscle_group}
                      </span>
                    )}
                  </div>
                  {exercise.video_url && (
                    <span className={styles.hasVideo}>
                      <Play size={12} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
