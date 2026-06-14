import axios from 'axios';

const BASE_URL = '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 300000, // 5 minutes for long AI calls
});

// Attach JWT from Zustand persisted store
api.interceptors.request.use((config) => {
  try {
    const stored = localStorage.getItem('placement-copilot-store');
    if (stored) {
      const { state } = JSON.parse(stored);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    }
  } catch {}
  return config;
});

// Normalize errors — redirect to login on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      // Clear persisted auth state and redirect
      try {
        const stored = localStorage.getItem('placement-copilot-store');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.state.token = null;
          parsed.state.user = null;
          parsed.state.isAuthenticated = false;
          localStorage.setItem('placement-copilot-store', JSON.stringify(parsed));
        }
      } catch {}
      window.location.href = '/login';
    }

    const message =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export default api;
