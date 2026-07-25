'use client'

import * as React from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface AnimatedCounterProps {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: AnimatedCounterProps) {
  const count = useMotionValue(0)
  const rounded = useTransform(count, (latest) => format(latest))
  const [display, setDisplay] = React.useState(format(0))

  React.useEffect(() => {
    const controls = animate(count, value, { duration, ease: 'easeOut' })
    const unsubscribe = rounded.on('change', (v) => setDisplay(v))
    return () => {
      controls.stop()
      unsubscribe()
    }
  }, [value, duration, count, rounded])

  return <span className={className}>{display}</span>
}
