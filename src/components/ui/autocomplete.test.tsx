import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  Autocomplete,
  SearchField,
  ListBox,
  useFilter,
} from './autocomplete'

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

describe('HeroUI Autocomplete Component', () => {
  it('renders standard HeroUI Autocomplete trigger and value placeholder', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function TestComp() {
      const { contains } = useFilter({ sensitivity: 'base' })
      return (
        <Autocomplete placeholder="请选择仓库...">
          <Autocomplete.Trigger>
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover>
            <Autocomplete.Filter filter={contains}>
              <SearchField aria-label="搜索">
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="搜索..." />
                </SearchField.Group>
              </SearchField>
              <ListBox>
                <ListBox.Item id="repo-1" textValue="nervd-desktop">
                  nervd-desktop
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id="repo-2" textValue="nervd-core">
                  nervd-core
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      )
    }

    await act(async () => {
      root.render(<TestComp />)
    })

    const trigger = container.querySelector('[data-slot="autocomplete-trigger"]')
    expect(trigger).not.toBeNull()
    expect(container.textContent).toContain('请选择仓库...')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('renders with preselected value', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function TestComp() {
      return (
        <Autocomplete value="repo-2">
          <Autocomplete.Trigger>
            <Autocomplete.Value />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover>
            <ListBox>
              <ListBox.Item id="repo-1" textValue="nervd-desktop">
                nervd-desktop
                <ListBox.ItemIndicator />
              </ListBox.Item>
              <ListBox.Item id="repo-2" textValue="nervd-core">
                nervd-core
                <ListBox.ItemIndicator />
              </ListBox.Item>
            </ListBox>
          </Autocomplete.Popover>
        </Autocomplete>
      )
    }

    await act(async () => {
      root.render(<TestComp />)
    })

    const trigger = container.querySelector('[data-slot="autocomplete-trigger"]')
    expect(trigger).not.toBeNull()
    expect(trigger?.textContent).toContain('nervd-core')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('SearchField reconciles value and triggers both onChange and onValueChange', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    let currentValue = 'initial'
    const onChangeMock = vi.fn((val: string) => { currentValue = val })
    const onValueChangeMock = vi.fn()

    await act(async () => {
      root.render(
        <SearchField aria-label="搜索" value={currentValue} onChange={onChangeMock} onValueChange={onValueChangeMock}>
          <SearchField.Input />
        </SearchField>
      )
    })

    const input = container.querySelector('input')!
    expect(input.value).toBe('initial')

    await act(async () => {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      nativeSetter?.call(input, 'updated')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(onChangeMock).toHaveBeenCalledWith('updated')
    expect(onValueChangeMock).toHaveBeenCalledWith('updated')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('SearchField.Input stops propagation of Space key and IME composition events', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const parentKeyDown = vi.fn()
    const parentKeyUp = vi.fn()

    await act(async () => {
      root.render(
        <div onKeyDown={parentKeyDown} onKeyUp={parentKeyUp}>
          <SearchField aria-label="搜索">
            <SearchField.Input />
          </SearchField>
        </div>
      )
    })

    const input = container.querySelector('input')!

    // Space keydown & keyup
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true }))
    })
    expect(parentKeyDown).not.toHaveBeenCalled()
    expect(parentKeyUp).not.toHaveBeenCalled()

    // IME composition keydown & keyup
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', isComposing: true, bubbles: true, cancelable: true }))
      input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Process', isComposing: true, bubbles: true, cancelable: true }))
    })
    expect(parentKeyDown).not.toHaveBeenCalled()
    expect(parentKeyUp).not.toHaveBeenCalled()

    // Normal key (e.g. 'a') bubbles to parent
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))
    })
    expect(parentKeyDown).toHaveBeenCalledTimes(1)

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it('Autocomplete.Popover contains overscroll-contain class', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <Autocomplete isOpen aria-label="测试选择">
          <Autocomplete.Trigger>
            <Autocomplete.Value />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className="custom-popover">
            <ListBox>
              <ListBox.Item id="item-1">Item 1</ListBox.Item>
            </ListBox>
          </Autocomplete.Popover>
        </Autocomplete>
      )
    })

    const popover = document.querySelector('[data-slot="autocomplete-popover"]')
    expect(popover?.className).toContain('overscroll-contain')
    expect(popover?.className).toContain('custom-popover')

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })
})
