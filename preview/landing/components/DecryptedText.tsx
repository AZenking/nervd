import React, { useEffect, useState, useRef } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  maxIterations?: number;
  sequential?: boolean;
  characters?: string;
  className?: string;
  encryptedClassName?: string;
  animateOn?: 'view' | 'hover';
}

const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+~|}{[]:;?><,./-=';

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 40,
  maxIterations = 10,
  sequential = true,
  characters = DEFAULT_CHARS,
  className = '',
  encryptedClassName = 'text-primary/70 font-mono',
  animateOn = 'view',
}) => {
  const [displayText, setDisplayText] = useState<string>(text);
  const [isDecrypted, setIsDecrypted] = useState<boolean>(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const animatingRef = useRef<boolean>(false);

  const startAnimation = () => {
    if (animatingRef.current) return;
    animatingRef.current = true;
    setIsDecrypted(false);

    let iteration = 0;
    const len = text.length;

    const interval = setInterval(() => {
      setDisplayText(() => {
        return text
          .split('')
          .map((char, index) => {
            if (char === ' ' || char === '\n') return char;

            if (sequential) {
              const charProgress = Math.floor((iteration / maxIterations) * len);
              if (index < charProgress) {
                return char;
              }
            } else {
              if (iteration >= maxIterations) {
                return char;
              }
            }

            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('');
      });

      iteration += 1;

      if (iteration > maxIterations) {
        clearInterval(interval);
        setDisplayText(text);
        setIsDecrypted(true);
        animatingRef.current = false;
      }
    }, speed);
  };

  useEffect(() => {
    if (animateOn === 'view') {
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            startAnimation();
            observer.disconnect();
          }
        },
        { threshold: 0.1 }
      );

      if (containerRef.current) {
        observer.observe(containerRef.current);
      }

      return () => observer.disconnect();
    }
  }, [text, animateOn]);

  return (
    <span
      ref={containerRef}
      onMouseEnter={() => {
        if (animateOn === 'hover') {
          startAnimation();
        }
      }}
      className={`inline-block ${className} ${!isDecrypted ? encryptedClassName : ''}`}
    >
      {displayText}
    </span>
  );
};
