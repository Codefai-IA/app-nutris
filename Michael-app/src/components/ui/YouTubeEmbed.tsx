import { useState } from 'react';
import { Play, X, ExternalLink } from 'lucide-react';
import styles from './YouTubeEmbed.module.css';

interface YouTubeEmbedProps {
  url: string;
  title?: string;
}

type VideoType = 'youtube' | 'drive' | 'other';

// Extract video ID from various YouTube URL formats
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=)([^&\s]+)/,
    /(?:youtu\.be\/)([^?\s]+)/,
    /(?:youtube\.com\/embed\/)([^?\s]+)/,
    /(?:youtube\.com\/shorts\/)([^?\s]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Extract Google Drive file ID
function getGoogleDriveFileId(url: string): string | null {
  if (!url) return null;

  const patterns = [
    /drive\.google\.com\/file\/d\/([^/]+)/,
    /drive\.google\.com\/open\?id=([^&]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

// Determine video type
function getVideoType(url: string): VideoType {
  if (!url) return 'other';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('drive.google.com')) return 'drive';
  return 'other';
}

// Validate URL is safe (only allow http/https)
function isValidUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function YouTubeEmbed({ url, title }: YouTubeEmbedProps) {
  const [showVideo, setShowVideo] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const videoType = getVideoType(url);
  const youtubeId = getYouTubeVideoId(url);
  const driveId = getGoogleDriveFileId(url);

  // If no valid video source, show external link button (only for valid URLs)
  if (videoType === 'other' || (videoType === 'youtube' && !youtubeId) || (videoType === 'drive' && !driveId)) {
    if (!url || !isValidUrl(url)) return null;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.externalLink}
      >
        <ExternalLink size={16} />
        <span>Ver video</span>
      </a>
    );
  }

  const thumbnailUrl = videoType === 'youtube'
    ? `https://img.youtube.com/vi/${youtubeId}/mqdefault.jpg`
    : null;

  const embedUrl = videoType === 'youtube'
    ? `https://www.youtube.com/embed/${youtubeId}?rel=0&modestbranding=1&autoplay=1`
    : `https://drive.google.com/file/d/${driveId}/preview`;

  const handleClose = () => {
    setShowVideo(false);
    setIsFullscreen(false);
  };

  return (
    <>
      {/* Thumbnail with play button */}
      <div
        className={styles.thumbnail}
        onClick={() => setShowVideo(true)}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title || 'Video do exercicio'}
            className={styles.thumbnailImage}
          />
        ) : (
          <div className={styles.drivePlaceholder}>
            <Play size={20} fill="currentColor" />
          </div>
        )}
        <div className={styles.overlay}>
          <div className={styles.playButton}>
            <Play size={24} fill="currentColor" />
          </div>
        </div>
        <span className={styles.label}>{videoType === 'drive' ? 'Ver video' : 'Ver demonstracao'}</span>
      </div>

      {/* Video Modal */}
      {showVideo && (
        <div
          className={`${styles.modal} ${isFullscreen ? styles.fullscreen : ''}`}
          onClick={handleClose}
        >
          <div
            className={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={styles.closeButton}
              onClick={handleClose}
              aria-label="Fechar"
            >
              <X size={24} />
            </button>

            {title && <h3 className={styles.title}>{title}</h3>}

            <div className={styles.videoContainer}>
              <iframe
                src={embedUrl}
                title={title || 'Video do exercicio'}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className={styles.iframe}
              />
            </div>

            <button
              className={styles.fullscreenToggle}
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? 'Sair da tela cheia' : 'Tela cheia'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
