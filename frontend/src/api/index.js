import axios from 'axios';
import { isGuestSession, guestExpensesAPI, guestBudgetsAPI } from './guestStore';


const base_url = process.env.REACT_APP_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${base_url}/api`,
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('spendai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // Auth endpoints return 401 for bad credentials; let the page show that error
    const isAuthAttempt = /\/auth\/(login|register|google)$/.test(err.config?.url || '');
    if (err.response?.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('spendai_token');
      localStorage.removeItem('spendai_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  googleAuth: (credential) => api.post('/auth/google', { credential }),
  googleAuthToken: (accessToken) => api.post('/auth/google', { access_token: accessToken }),
  getMe: () => api.get('/auth/me'),
  updateApiKey: (key) => api.patch('/auth/api-key', { gemini_api_key: key }),
};

const serverExpensesAPI = {
  getAll: (params) => api.get('/expenses', { params }),
  create: (data) => api.post('/expenses', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  delete: (id) => api.delete(`/expenses/${id}`),
  getStats: (params) => api.get('/expenses/stats/summary', { params }),
  getDaily: (params) => api.get('/expenses/stats/daily', { params }),
};

const serverBudgetsAPI = {
  getAll: () => api.get('/budgets'),
  upsert: (data) => api.post('/budgets', data),
  delete: (category) => api.delete(`/budgets/${encodeURIComponent(category)}`),
};

// Guest sessions never touch the server; calls go to the in-browser store instead
const withGuestFallback = (serverApi, guestApi) =>
  Object.fromEntries(Object.keys(serverApi).map(name => [
    name,
    (...args) => (isGuestSession() ? guestApi : serverApi)[name](...args),
  ]));

export const expensesAPI = withGuestFallback(serverExpensesAPI, guestExpensesAPI);
export const budgetsAPI = withGuestFallback(serverBudgetsAPI, guestBudgetsAPI);

export default api;
