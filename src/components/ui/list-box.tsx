import * as React from "react"
import { ListBox as HeroUIListBox } from "@heroui/react"

export interface ListBoxProps extends React.ComponentPropsWithRef<typeof HeroUIListBox> {}

/** HeroUI ListBox 薄封装：语义 listbox 容器（方向键漫游焦点 / Enter 触发 onAction / 类型前置匹配） */
const ListBox = HeroUIListBox

export { ListBox }
