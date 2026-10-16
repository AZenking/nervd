import React, { useEffect, useRef } from 'react';

interface ParticlesProps {
  particleColors?: string[];
  particleCount?: number;
  particleSpread?: number;
  speed?: number;
  particleBaseSize?: number;
  moveParticlesOnHover?: boolean;
  alphaParticles?: boolean;
  disableRotation?: boolean;
  className?: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  baseAlpha: number;
}

export const Particles: React.FC<ParticlesProps> = ({
  particleColors = ['#5e6ad2', '#8a8f98', '#4f46b5', '#ffffff'],
  particleCount = 50,
  particleSpread = 10,
  speed = 0.3,
  particleBaseSize = 2,
  moveParticlesOnHover = true,
  alphaParticles = true,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; isHovering: boolean }>({
    x: 0,
    y: 0,
    isHovering: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.parentElement?.clientWidth || window.innerWidth;
      height = canvas.height = canvas.parentElement?.clientHeight || window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      const color = particleColors[Math.floor(Math.random() * particleColors.length)] || '#5e6ad2';
      const baseAlpha = alphaParticles ? Math.random() * 0.6 + 0.2 : 0.8;
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        size: Math.random() * particleBaseSize + 1,
        color,
        alpha: baseAlpha,
        baseAlpha,
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        isHovering: true,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current.isHovering = false;
    };

    const parent = canvas.parentElement || canvas;
    parent.addEventListener('mousemove', handleMouseMove as any);
    parent.addEventListener('mouseleave', handleMouseLeave);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle connecting lines between close particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i]!.x - particles[j]!.x;
          const dy = particles[i]!.y - particles[j]!.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 90;
          if (dist < maxDist) {
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(94, 106, 210, ' + (0.12 * (1 - dist / maxDist)) + ')';
            ctx.lineWidth = 0.75;
            ctx.moveTo(particles[i]!.x, particles[i]!.y);
            ctx.lineTo(particles[j]!.x, particles[j]!.y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap boundaries
        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        // Mouse interaction
        if (moveParticlesOnHover && mouseRef.current.isHovering) {
          const dx = p.x - mouseRef.current.x;
          const dy = p.y - mouseRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const hoverRadius = 120;
          if (dist < hoverRadius && dist > 0) {
            const force = (1 - dist / hoverRadius) * 0.8;
            p.x += (dx / dist) * force * particleSpread * 0.1;
            p.y += (dy / dist) * force * particleSpread * 0.1;
            p.alpha = Math.min(1, p.baseAlpha + 0.4);
          } else {
            p.alpha += (p.baseAlpha - p.alpha) * 0.05;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      parent.removeEventListener('mousemove', handleMouseMove as any);
      parent.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [
    alphaParticles,
    moveParticlesOnHover,
    particleBaseSize,
    particleColors,
    particleCount,
    particleSpread,
    speed,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  );
};
