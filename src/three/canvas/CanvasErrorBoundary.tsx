/**
 * Error boundary around the React Three Fiber canvas. A render-time failure
 * anywhere inside the canvas tree (renderer construction, a shader that fails
 * to compile, an exception in a child) is swallowed here and replaced by the
 * supplied DOM fallback, so the rest of the page keeps working. The failure is
 * reported once per session with console.warn in development.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

export interface CanvasErrorBoundaryProps {
  /** DOM content rendered in place of the canvas after a failure. */
  fallback: ReactNode
  children: ReactNode
}

interface CanvasErrorBoundaryState {
  hasError: boolean
}

let warnedOnce = false

export class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, CanvasErrorBoundaryState> {
  state: CanvasErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): CanvasErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (import.meta.env.DEV && !warnedOnce) {
      warnedOnce = true
      console.warn('[canvas] The 3D canvas failed and was replaced by the DOM fallback.', error, info.componentStack ?? '')
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
