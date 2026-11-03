import { describe, it, expect } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import {
  Autocomplete,
  SearchField,
  ListBox,
  useFilter,
} from '@heroui/react'

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
})
