"use client"

import * as React from "react"
import { Chip as HeroChip } from "@heroui/react"

export interface ChipProps extends React.ComponentPropsWithRef<typeof HeroChip> {}

const Chip = HeroChip

export { Chip }
