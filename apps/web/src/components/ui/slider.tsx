"use client"

import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"

function Slider({
  className,
  defaultValue,
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  id,
}: {
  className?: string
  defaultValue?: number[]
  value?: number[]
  onValueChange?: (value: number[]) => void
  min?: number
  max?: number
  step?: number
  id?: string
}) {
  const thumbCount = value?.length ?? defaultValue?.length ?? 1

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      id={id}
      defaultValue={defaultValue}
      value={value}
      onValueChange={(val: any) => {
        const arr = Array.isArray(val) ? val : [val]
        onValueChange?.(arr)
      }}
      min={min}
      max={max}
      step={step}
      className={cn("relative flex w-full touch-none select-none items-center py-1", className)}
    >
      <SliderPrimitive.Control className="flex items-center w-full">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
          <SliderPrimitive.Indicator className="absolute h-full bg-primary" />
        </SliderPrimitive.Track>
        {Array.from({ length: thumbCount }).map((_, i) => (
          <SliderPrimitive.Thumb
            key={i}
            className="block size-3 rounded-full border-2 border-primary bg-background shadow-sm ring-ring/50 transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 cursor-grab active:cursor-grabbing"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
