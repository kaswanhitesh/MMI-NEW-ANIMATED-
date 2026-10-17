/**
 * Error boundary around one model's Suspense tree. A failed GLB load — thrown
 * by React Three Fiber's useLoader during render — lands here and is swapped
 * for the supplied fallback (the TEMPORARY placeholder) without unmounting the
 * rest of the canvas. Changing `resetKey` clears the error and retries.
 */
import { Component, type ReactNode } from 'react'
export interface ModelErrorBoundaryProps {
  /** Model this boundary guards (a manifest id or an environment slot name). Not used for rendering; it labels the boundary in React DevTools and error reports. */
  modelId: string
  fallback: ReactNode
  /** Receives whatever was thrown (usually the Error React Three Fiber wraps a ModelLoadError in). */
  onError?: (error: unknown) => void
  /** When this value changes (compared with Object.is) an errored boundary clears its error state and renders children again. */
  resetKey?: unknown
  children: ReactNode
}

interface ModelErrorBoundaryState {
  hasError: boolean
}

export class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, ModelErrorBoundaryState> {
  state: ModelErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ModelErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error)
  }

  componentDidUpdate(previousProps: ModelErrorBoundaryProps): void {
    if (this.state.hasError && !Object.is(previousProps.resetKey, this.props.resetKey)) {
      this.setState({ hasError: false })
    }
  }

  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}
