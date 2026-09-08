import React from 'react';
import { Volume2 } from 'lucide-react';
import { speechStudio, sound } from '../../../utils/audio.js';
import { Button } from '../../ui/button.js';

export interface KanaGuideSpeakButtonProps {
  text: string;
  label: string;
  className?: string;
}

export function KanaGuideSpeakButton({ text, label, className }: KanaGuideSpeakButtonProps) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={() => {
        sound.playClick();
        void speechStudio.speak(text, { lang: 'JA', purpose: 'preview' });
      }}
      className={`h-7 w-7 rounded-full text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200${className ? ` ${className}` : ''}`}
      aria-label={label}
      title={label}
    >
      <Volume2 className="h-3.5 w-3.5" />
    </Button>
  );
}
