import React, {Component, ReactNode} from 'react';
import ErrorMessage from '@jetbrains/ring-ui-built/components/error-message/error-message';
import Button from '@jetbrains/ring-ui-built/components/button/button';
import {logger} from '../utils/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Error Boundary component to catch and handle React errors gracefully
 * 
 * This prevents the entire application from crashing when an error occurs
 * and provides a user-friendly fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details
    logger.error('Error caught by ErrorBoundary:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      errorInfo
    });
  }

  handleReset = (): void => {
    // Reset error state and try to recover
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  handleReload = (): void => {
    // Reload the page
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <ErrorMessage
            message="Something went wrong"
            description="An unexpected error occurred. Please try reloading the page."
          />
          <div style={{ 
            marginTop: '20px',
            display: 'flex',
            gap: '10px',
            justifyContent: 'center'
          }}>
            <Button onClick={this.handleReset}>
              Try Again
            </Button>
            <Button onClick={this.handleReload} primary>
              Reload Page
            </Button>
          </div>
          
          {/* Show error details in development only */}
          {this.state.error && typeof console.assert === 'function' && (
            <details style={{ 
              marginTop: '20px', 
              textAlign: 'left',
              fontSize: '12px',
              color: '#666'
            }}>
              <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                Error Details (Development Only)
              </summary>
              <pre style={{ 
                marginTop: '10px',
                padding: '10px',
                background: '#f5f5f5',
                borderRadius: '4px',
                overflow: 'auto'
              }}>
                {this.state.error.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

