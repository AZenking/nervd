import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StartupSplash } from './StartupSplash';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  host.remove();
});

describe('StartupSplash with HeroUI ProgressBar & Label', () => {
  it('renders startup splash with native HeroUI ProgressBar and Label', async () => {
    await act(async () => {
      root.render(<StartupSplash />);
    });

    // Check splash container
    const splash = host.querySelector('[role="status"]');
    expect(splash).not.toBeNull();

    // Check logo image
    const img = host.querySelector('img[alt="nervd logo"]');
    expect(img).not.toBeNull();

    // Check HeroUI ProgressBar
    const progressBar = host.querySelector('[role="progressbar"]');
    expect(progressBar).not.toBeNull();

    // Check Label text
    expect(host.textContent).toContain('正在加载 nervd…');
  });

  it('applies fading styles when fading is true', async () => {
    await act(async () => {
      root.render(<StartupSplash fading />);
    });

    const splash = host.querySelector('[role="status"]');
    expect(splash?.classList.contains('opacity-0')).toBe(true);
    expect(splash?.classList.contains('invisible')).toBe(true);
  });
});
