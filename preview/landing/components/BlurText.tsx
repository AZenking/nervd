import React, { useEffect, useState, useRef } from 'react';

interface BlurTextProps {
  text: string;
  delay?: number;
  className?: string;
  animateBy?: 'words' | 'letters';
}

export const BlurText: React.FC<BlurTextProps> = ({
  text,
  delay = 50,
  className = '',
  animateBy = 'words',
}) => {
  const elements = animateBy === 'words' ? text.split(' ') : text.split('');
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <p ref={ref} className={`flex flex-wrap ${className}`}>
      {elements.map((segment, index) => (
        <span
          key={index}
          style={{
            transitionDuration: '500ms',
            transitionDelay: `${index * delay}ms`,
            transitionProperty: 'opacity, filter, transform',
          }}
          className={`inline-block transition-all ease-out ${
            inView
              ? 'opacity-100 blur-none translate-y-0'
              : 'opacity-0 blur-md translate-y-2'
          } ${animateBy === 'words' ? 'mr-[0.25em]' : ''}`}
        >
          {segment === ' ' ? '\u00A0' : segment}
        </span>
      ))}
    </p>
  );
};
