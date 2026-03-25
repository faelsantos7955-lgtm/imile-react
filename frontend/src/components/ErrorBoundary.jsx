import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow max-w-md">
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Algo deu errado</h2>
            <p className="text-gray-500 text-sm mb-4">
              {this.state.error?.message || 'Erro inesperado na aplicação.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}