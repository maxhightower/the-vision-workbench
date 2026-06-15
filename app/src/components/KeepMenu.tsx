import { useEffect } from 'react';

interface Props {
  x: number;
  y: number;
  onKeep: () => void;
  onClose: () => void;
}

export function KeepMenu({ x, y, onKeep, onClose }: Props) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [onClose]);

  return (
    <div className="keep-menu" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => {
          onKeep();
        }}
      >
        ＋ Keep to map
      </button>
    </div>
  );
}
