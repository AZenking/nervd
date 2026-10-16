import React from 'react';

interface ShinyTextProps {
  text: string;
  disabled?: boolean;
  speed?: number;
  className?: string;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  disabled = false,
  speed = 4,
  className = '',
}) => {
  const animationDuration = `${speed}s`;

  return (
    <span
      className={`inline-block font-medium ${
        disabled
          ? 'text-muted-foreground'
          : 'bg-clip-text text-transparent bg-gradient-to-r from-neutral-400 via-white to-neutral-400 bg-[length:200%_100%] animate-shine'
      } ${className}`}
      style={{
        animationDuration,
      }}
    >
      {text}
    </span>
  );
};
