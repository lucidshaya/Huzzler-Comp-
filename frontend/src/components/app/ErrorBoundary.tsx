import { Component, type ReactNode } from "react";
import { reportClientError } from "@/lib/clientErrors";

/** Keeps a crash inside one part of the page (e.g. the help widget) instead of the whole site. */
export class ErrorBoundary extends Component<
  { where: string; fallback: (reset: () => void) => ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    reportClientError(error, this.props.where);
  }
  reset = () => this.setState({ failed: false });
  render() {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children;
  }
}
